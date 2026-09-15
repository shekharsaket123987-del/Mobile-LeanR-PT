# Audit Section 1: Auth, Journey State Machine, Gates, Onboarding, Profile

Scope: `leanr-mobile-app` repo. Compared against `mobile-app-reference/ClientPortal.md` (web source of truth) §4, §13, §17, §21, §26.A, and inline PRD citations (`LEANR_PT_MOBILE_PRD.md`, `LEANR_PT_NEXTGEN_APP_PRD.md`, `mobile-app-reference/New PRD.md`).

---

## Functionality Inventory

| # | Function | File(s) |
|---|---|---|
| 1 | Manual signup (email+phone+password) | `src/app/(auth)/signup.tsx` |
| 2 | Google OAuth signup/login | `src/lib/auth/auth-context.tsx` (`signInWithGoogle`) |
| 3 | Email OTP (alternate passwordless sign-in, not gating signup) | `src/app/(auth)/otp.tsx` |
| 4 | Phone OTP (MSG91, real implementation) | `src/lib/data/phone-otp.ts`, `supabase/functions/phone-otp/index.ts` |
| 5 | Forgot password / reset password (net-new vs. web) | `src/app/(auth)/forgot-password.tsx`, `src/app/(auth)/reset-password.tsx`, `auth-context.tsx` (`sendPasswordReset`, `updatePassword`, recovery-link parsing) |
| 6 | Login (unified, all 3 roles) | `src/app/(auth)/login.tsx`, `auth-context.tsx` (`signInWithPassword`) |
| 7 | Role routing | `src/lib/auth/role-routing.ts` + `__tests__/role-routing.test.ts` |
| 8 | Session persistence / logout | `auth-context.tsx` |
| 9 | Client journey stage machine | `src/lib/data/journey.ts` |
| 10 | Global gates orchestrator (client) | `src/components/gates/global-gates.tsx` |
| 11 | Phone gate | `src/components/gates/phone-gate-modal.tsx` |
| 12 | Measurement gate | `src/components/gates/measurement-gate-modal.tsx` |
| 13 | Sessions-low gate | `src/components/gates/sessions-low-gate-modal.tsx` |
| 14 | Coach pending-tasks gate (coach-side, no web precedent) | `src/components/gates/coach-pending-tasks-gate-modal.tsx`, mounted `src/app/(coach)/_layout.tsx:66` |
| 15 | Gate data layer | `src/lib/data/gates.ts`, `identity.ts`, `measurement-status.ts` |
| 16 | Onboarding (one-time intake) | `src/lib/data/onboarding.ts`, `src/app/(client)/onboarding.tsx` |
| 17 | Activate Plan | `src/app/(client)/activate.tsx`, `src/lib/data/subscription.ts` (`activateSubscription`, `getPendingActivationSubscription`) |
| 18 | Profile (view/edit/password/photo) | `src/lib/data/profile.ts`, `src/app/(client)/profile.tsx`, `src/components/avatar-editor.tsx` |
| 19 | Welcome/splash, unsupported-role fallback | `src/app/welcome.tsx`, `src/app/unsupported-role.tsx` |
| 20 | Layout-level auth/role gating | `src/app/(auth)/_layout.tsx`, `src/app/(client)/_layout.tsx`, `(coach)/_layout.tsx`, `(admin)/_layout.tsx` |
| 21 | Role-escalation protection | `supabase/migrations/20260912110000_sync_role_on_auth_user_metadata_update.sql`, `auth-context.tsx` (`signUpWithPassword`) |

---

## Complete Journey Stage State Machine (as implemented)

File: `src/lib/data/journey.ts:68-100` (`getClientJourneyStage`).

Evaluation order, first match wins (verified line-by-line against ClientPortal.md §4.0):

1. `journey.ts:69-70` — no `client_profiles` row for the caller (`getMyClientProfileId()` returns null) → `'marketing'`. (Not an explicit web-documented state, but a safe pre-account fallback; not reachable once account exists since signup always creates `client_profiles`.)
2. `journey.ts:72,74` — `getLatestSubscription()` (order by `created_at desc`, any status) → if `status === 'awaiting_activation'` → **`awaiting_activation`**, stop. Matches web §4.0 step 1 exactly.
3. `journey.ts:76-92` — if `status === 'active'`:
   a. `journey.ts:77-78` — no `client_onboarding` row (`getMyOnboarding()`) → **`onboarding`**. Matches web step 2.
   b. `journey.ts:80` — `isRenewalSubscription()` (any OTHER subscription row exists for this client, `journey.ts:37-45`) → renewal branch:
      - `journey.ts:81-83` — `activated_at` set AND no `progress_logs` row with `logged_at >= activated_at` (`hasProgressLoggedSince`, `journey.ts:47-55`) → **`renewal_checkin`**.
      - `journey.ts:84-86` — else no `recurring_slots` row with `subscription_id = latest.id` (any status, existence only, `hasRecurringSlotsForSubscription`, `journey.ts:58-66`) → **`renewal_scheduling`**.
      - `journey.ts:87` — else **`active`**.
   c. `journey.ts:90-92` — non-renewal (first-time) branch: no `getMyActiveRecurringSlots()` (status='active', any subscription) → **`slot_selection`**; else **`active`**.
   This matches web step 2 exactly, including the "renewal-only steps only apply if an older subscription exists" ordering and the "recurring slots exist" check.
4. `journey.ts:95-99` — subscription is `paused`/`inactive`/absent (i.e., none of the above matched) → falls through to demo lookup (`getLatestDemoBooking()`, ordered by `scheduled_start desc`, `session_type='assessment'` only):
   - `status === 'upcoming'` → **`demo_booked`**
   - `status === 'completed' | 'missed'` → **`demo_completed`**
   - else → **`marketing`**
   Matches web step 3+4 exactly (fallthrough for paused/inactive-with-nothing-newer "never permanently stuck" rule).

**Verdict: the state machine's core evaluation order is a faithful, line-for-line reproduction of ClientPortal.md §4.0.** Status: **WORKING CORRECTLY**.

### Consumption of the stage (redirect gate)

- `src/app/(client)/index.tsx:211-232` (`EnrolledHomeScreen`, the mobile Dashboard-equivalent) redirects: `awaiting_activation`→`/activate`, `onboarding`→`/onboarding`, `renewal_checkin`→`/renewal-checkin`, `renewal_scheduling`→`/renewal-scheduling`, `slot_selection`→`/my-schedule`; default (includes `active`, `marketing`, `demo_booked`, `demo_completed`) → clears the gate and renders the dashboard widgets in place.
- Web's dashboard redirect table (§4.0) additionally redirects `marketing` → `/client/plans`. **Mobile has no case for `marketing` inside `EnrolledHomeScreen`'s switch** — see AUTH-010 below (Gaps).
- `src/app/(client)/index.tsx:350-353` (`HomeScreen`) branches `EnrolledHomeScreen` vs. `PrePurchaseHomeScreen` purely on `getLatestSubscription() !== null` (any status) — this is a coarser check than the journey stage itself, done to decide the tab-bar shape (dual-branch nav), not to gate stage transitions; the actual stage redirect only runs inside `EnrolledHomeScreen`.
- `src/app/(client)/_layout.tsx` itself does **not** gate on journey stage (only on session/role, `_layout.tsx:60-63`) — all stage-redirect logic lives in `index.tsx`, unlike web where `/client/dashboard`'s server component does it. Functionally equivalent entry point (Home tab), acceptable architecture difference.

---

## Workflow Traces

### 1. Manual signup → account creation
`src/app/(auth)/signup.tsx:51-89` (`onSubmit`) → validates name/email/phone-regex/password≥8 client-side → `auth-context.tsx:235-248` (`signUpWithPassword`) → `supabase.auth.signUp({email, password, options:{data:{full_name, phone}}})`. No `role` key is ever passed (`auth-context.tsx:245`). Role defaults via the pre-existing (not in this repo) `handle_new_user()` trigger, which — per web spec and per this repo's own `sync_role_on_auth_user_metadata_update.sql:1-12` comment — reads `raw_app_meta_data`, not the `raw_user_meta_data` this call populates. **Role is never client-settable.** Matches ClientPortal.md §4.2/§21.

- If `needsEmailConfirmation` (no session returned, "Confirm email" enabled project-side) → `signup.tsx:126-134` shows "check your email" screen, directs to `/login`. This is **not** an in-app OTP-entry step (unlike web's `verifyOtp(type:'signup')`) — it relies on the emailed confirmation link. Environment-dependent, same caveat web has.
- Else → phone-OTP stage (`signup.tsx:83-88,136-165`): `sendPhoneOtp` → `verifyPhoneOtp` (real MSG91 call via `supabase/functions/phone-otp/index.ts`) → `updateMyProfile({phone})` (`profile.ts:48-59`) → `finishSignup()` clears `signupPhoneStepInProgress`, letting `(auth)/_layout.tsx:29` redirect by role.
- "Skip for now (demo — phone unverified)" (`signup.tsx:160-162`) bypasses OTP entirely, same as web's documented "TEMPORARY" bypass — deliberately reproduced (code comment `signup.tsx:13-15` cites this explicitly).

### 2. Google OAuth
`auth-context.tsx:268-285` (`signInWithGoogle`) → `signInWithOAuth({provider:'google', options:{redirectTo, skipBrowserRedirect:true}})` → `WebBrowser.openAuthSessionAsync` → parses tokens/code from the redirect (`parseAuthCallback`, `auth-context.tsx:128-144`) → `applyAuthCallback` sets the session. Role resolution happens generically via `fetchProfile()` (`auth-context.tsx:162-170`) reading `profiles.role`, then `(auth)/_layout.tsx:29` routes by `getHomeRouteForRole(profile.role)`. A brand-new Google sign-in has no pre-existing `profiles` row until the (pre-existing, not in this repo) trigger creates one with role `client` — same enforcement point as web. Matches ClientPortal.md §4.2.

### 3. Login
`src/app/(auth)/login.tsx:25-36` → `signInWithPassword` (`auth-context.tsx:222-233`) → **no role check/rejection at sign-in time** (explicit code comment `auth-context.tsx:223-228` documents this was tried and reverted — commit `6a42a6f` — because the mobile app uses one unified login screen for all 3 roles, unlike web's per-role login URLs). Role boundary is instead enforced uniformly at each role group's `_layout.tsx` (`(client)/_layout.tsx:62`, `(coach)/_layout.tsx:82`, `(admin)/_layout.tsx:45`), all via the same `profile.role !== <expected>` → `Redirect to getHomeRouteForRole(profile.role)` pattern. **Functionally equivalent security boundary to web's middleware.ts, architecturally different from web's login-time rejection message.** No "wrong-portal" error message is shown at all in the mobile app (a client typing correct credentials for a coach account is just silently redirected to the coach app, no "not registered as a client" error) — this is a deliberate, documented divergence, not a bug, but a UX difference worth flagging (see AUTH-004).

### 4. Forgot password / reset password (net-new vs. web)
`login.tsx:65-67` → `/forgot-password` → `forgot-password.tsx:25-39` → `sendPasswordReset(email)` (`auth-context.tsx:287-291`) → `supabase.auth.resetPasswordForEmail(email, {redirectTo: Linking.createURL('reset-password')})`. Deep link handling: `auth-context.tsx:183-196` detects the recovery link (cold start or live), calls `applyAuthCallback`, sets `recoveryInProgress=true`, routes to `/reset-password`. `(auth)/_layout.tsx:21-23` suppresses its normal "session exists → redirect home" while `recoveryInProgress` is true. `reset-password.tsx:48-68` → `updatePassword` (`auth-context.tsx:293-296`, `supabase.auth.updateUser({password})`) → `completePasswordRecovery()` clears the flag, normal redirect resumes.

Code comment `forgot-password.tsx:1-7` explicitly cites this as intentionally new functionality ("LEANR_PT_MOBILE_PRD.md §21/§28 flags this as net-new-for-mobile ... the web app's 'Forgot password?' link has no handler at all"). **ClientPortal.md §4.2/§13/§30 confirms web genuinely has zero forgot-password functionality.** This is a deliberate, well-engineered addition — flagged per task instructions as "APP has MORE than web," not a bug.

### 5. Onboarding (one-time intake)
`src/app/(client)/onboarding.tsx` — 3-step wizard (goal → measurements → medical). `canSubmit` requires `weightNum !== undefined && goal !== null` (`onboarding.tsx:71`) — weight and fitness-goal are the only required fields, matching web exactly. On submit → `submitOnboarding()` (`onboarding.ts:51-93`):
- Pre-check: `getMyOnboarding()` existing row → throws "Onboarding has already been submitted — contact support to make changes." (`onboarding.ts:55-56`), same message as web.
- Insert into `client_onboarding`.
- DB-level race guard: unique index `client_onboarding_client_id_key` on `client_id` (`supabase/migrations/20260912090000_client_onboarding_unique_client.sql:8-9`) catches Postgres error code `23505` and re-throws the same friendly message (`onboarding.ts:71-75`). **Insert-once is enforced at both the app layer and the DB layer, exactly matching ClientPortal.md §13's stated requirement.**
- Day-1 `progress_logs` row always inserted (`onboarding.ts:80-92`) since weight — always present — satisfies web's "if any measurement field was filled in" condition. Effectively equivalent to web's conditional behavior.
- Unit-label bug: fields `waist`/`chest`/`hip`/`arms`/`thigh` are presented with `(cm)` placeholders (`onboarding.tsx:153-157`) but ClientPortal.md §13/§11 states these are inches on web (`waist/chest/hip/arms/thigh (in)`). See AUTH-006.

### 6. Activate Plan
`src/app/(client)/activate.tsx` — loads `getPendingActivationSubscription()` (`subscription.ts:27-41`, `status='awaiting_activation'`, ordered `created_at desc`) — this **re-verifies server-side data** that the client is actually in this stage (empty-state shown if not, `activate.tsx:65-74`), matching web's independent stage re-verification. Date picker (`LightCalendarGrid`) is bounded by `minDate={tomorrow}` (`activate.tsx:30,81`, `addIstDays(todayIst(), 1)`), enforcing the "≥ tomorrow, IST" rule client-side. `onConfirm` → `activateSubscription(subscription.id, istDateKey(selectedDate))` → `subscription.ts:76-78` → Supabase edge function `subscription-lifecycle` (service-role, does the actual one-time-lock + atomic old-subscription-retirement — this mechanic itself is subsystem-3 territory, out of scope here, but its existence as a server-side edge function rather than a direct client RLS write is the correct trust boundary per ClientPortal.md §7/§26.A "signature/trust boundary" principle extended to subscription mutations). After success, **unconditionally** `router.replace('/onboarding')` (`activate.tsx:41`) regardless of actual journey stage — see AUTH-007 (renewal clients get misrouted).

### 7. Profile view/edit
`src/app/(client)/profile.tsx` — dual-branch (`PrePurchaseProfileScreen` / `EnrolledProfileScreen`) on `getLatestSubscription() !== null` (`profile.tsx:415-419`). Editable fields confirmed against web §13 table:

| Field | Mobile editable? | Matches web? |
|---|---|---|
| Full name | Yes (`profile.tsx:316`) | Yes |
| Email | Not shown/editable anywhere | Yes (web: not editable either) |
| Phone | Yes (`profile.tsx:317-323`) | Yes |
| Password | Yes, separate card (`profile.tsx:385-410`) | Yes |
| Photo | Yes, `AvatarEditor` (`profile.tsx:307`) | Yes |
| Goals (tags) | Yes, comma-separated text field (`profile.tsx:359`) | Yes |
| Equipment (tags) | Yes (`profile.tsx:360-365`) | Yes |
| Medical notes (profile-level) | Yes (`profile.tsx:366-373`) | Yes |
| Height/weight | Read-only, sourced from onboarding (`profile.tsx:219-221,337-358`) | Yes — matches "correctable afterward only by admin" |
| BMI | Derived, not editable (`profile.tsx:221`) | Yes |
| Emergency contact | **Not shown anywhere on this screen** (`MyProfile` type includes it, `profile.ts:32`, but no UI field renders/edits it in `profile.tsx`) | Yes — matches web's "not exposed on client Profile screen" (§13) |

All field-editability rules **match web exactly**. Status: **WORKING CORRECTLY**.

Password change: `onChangePassword` (`profile.tsx:96-118` pre-purchase branch, `265-287` enrolled branch) requires `newPassword.length < 6` → error (i.e., only enforces **≥6** chars) and a client-side confirm-match check. Web spec (§13) states password change requires **≥8 chars**, same as signup. `reset-password.tsx:50-53` also only enforces ≥6. Signup (`signup.tsx:57`) correctly enforces ≥8. **Inconsistent minimum-length enforcement across the app's 3 password-entry surfaces** — see AUTH-005.

Avatar upload: `avatar-editor.tsx:30-51` → `uploadAvatarImage()` (`profile.ts:62-75`) uploads to `avatars` bucket at path `${userId}/${Date.now()}.${ext}` (web uses `{userId}/{uuid}.{ext}`) — functionally equivalent (still satisfies the owner-path-prefix RLS policy per `profile.ts:17-24` comment), trivial naming difference, not a bug.

---

## Business Rules

| Rule | Web spec | Mobile implementation | Status |
|---|---|---|---|
| Role never client-settable | §4.2, migrations 0051/0055 | `auth-context.tsx:242-247` sends only `full_name`/`phone` in `options.data`; `sync_role_on_auth_user_metadata_update.sql:30` only reads `raw_app_meta_data` (server-only-settable) | WORKING CORRECTLY (app-layer confirmed; DB-layer column-restriction on `profiles.role` UPDATE inherited from the shared web-app schema, not present in this repo's migrations — **UNKNOWN — REQUIRES VERIFICATION** against the live DB/web-repo migrations) |
| Phone regex | `^\+?[0-9]{10,15}$` | `phone-otp.ts:14`, identical regex, comment explicitly says "Same validation the web app uses" | WORKING CORRECTLY |
| Password ≥8 chars (signup) | §4.2 | `signup.tsx:57` | WORKING CORRECTLY |
| Password ≥8 chars (change) | §13 | `profile.tsx:99,268` and `reset-password.tsx:50` enforce **≥6** | WORKING BUT INCORRECT (AUTH-005) |
| Onboarding weight required, goal required, rest optional | §13 | `onboarding.tsx:71` (`canSubmit`) | WORKING CORRECTLY |
| Onboarding insert-once (app + DB) | §13 | `onboarding.ts:55-56,71-75` + unique index migration | WORKING CORRECTLY |
| Day-1 progress_logs side effect | §13 | `onboarding.ts:80-92` (unconditional, but weight is always present so equivalent) | WORKING CORRECTLY |
| Activate start date ≥ tomorrow (IST) | §8 | `activate.tsx:30,81` `minDate={tomorrow}` | WORKING CORRECTLY (client-side; server-side enforcement lives in the `subscription-lifecycle` edge function, out of this subsystem's direct trace) |
| Activation one-time lock | §8 | Delegated to `subscription-lifecycle` edge function (not traced in this subsystem — subsystem 3 territory) | UNKNOWN — REQUIRES VERIFICATION (by subsystem 3) |
| Gate precedence: phone > measurement > sessions-low | §4/§9/§26.A | `global-gates.tsx:42-49`, exact same order | WORKING CORRECTLY |
| Measurement staleness = 7 days | §11 | `measurement-status.ts:21,39` `STALE_AFTER_MS = 7*24*60*60*1000` | WORKING CORRECTLY |
| Sessions-low threshold = 5 | §9 | `gates.ts:10` `SESSIONS_LOW_THRESHOLD = 5` | WORKING CORRECTLY |
| Phone/measurement gate "Skip" bypass | §4.2/§25 (documented as-is, not fixed) | `phone-gate-modal.tsx:112-119`, `measurement-gate-modal.tsx:31-33` — skip only dismisses the modal, underlying server-side block remains (`measurement-status.ts:44-48` `assertMeasurementsFresh` throws) | WORKING CORRECTLY (faithfully reproduces web's documented, not-yet-fixed behavior) |
| Emergency contact hidden from client Profile | §13 | Not rendered in `profile.tsx` | WORKING CORRECTLY |
| Height/weight not client-editable | §13 | Read-only in `profile.tsx:337-358` | WORKING CORRECTLY |

---

## Gates Precedence & Enforcement

Precedence confirmed identical to web (§4/§9, §26.A "gate precedence order (phone > measurement > sessions-low) replicated"):

1. **PhoneGateModal** (`phone-gate-modal.tsx`) — triggered by `!profile?.phone` (`global-gates.tsx:43`).
   - Client-side: full-screen bottom sheet, blocks nothing else in the UI, "Skip for now" dismisses only the modal (local `dismissed` state in `global-gates.tsx:24,51`, not persisted — reappears next cold mount, matches web's own skippable behavior).
   - Server-side: **not independently verified in this subsystem** — no explicit "phone required" check was found gating bookings/joins the way measurement staleness is (`assertMeasurementsFresh`). Per ClientPortal.md, web's phone gate is *also* UX-only with no independent booking-time enforcement (§25: "PhoneGateModal blocks nothing except itself being dismissed"), so this matches web's actual (not ideal) behavior. Status: WORKING CORRECTLY (faithful reproduction of web's real, not-fully-hardened state).

2. **MeasurementGateModal** (`measurement-gate-modal.tsx`) — triggered by `status.measurementStale` (`measurement-status.ts:25-41`, `getMeasurementStatus`).
   - Server-side enforcement confirmed independent of the modal: `measurement-status.ts:44-49` (`assertMeasurementsFresh`) throws the same literal message web uses ("Please update your measurements before booking a session or joining."), called from booking/join entry points per its own doc comment (`measurement-status.ts:6-8`) — cross-referenced but the booking/zoom call sites themselves are subsystem-2 territory; not re-traced here. Status: WORKING CORRECTLY, matches web's "modal is a UX nudge, not the enforcement" model exactly.

3. **SessionsLowGateModal** (`sessions-low-gate-modal.tsx`) — triggered by `sessionsRemaining !== null && sessionsRemaining <= 5` (`global-gates.tsx:47`, `gates.ts:10,30`).
   - This is purely a **display/nudge** gate (matches web — never a hard block), computed from `subscription.sessions_total - getSessionsUsedCount(subscription.id)` where `getSessionsUsedCount` counts only `status='completed'` bookings (`subscription.ts:59-67`) — this is the **display-only** metric, consistent with web's `subscription_usage_view` semantics for this specific gate (web §9: "SessionsLowGateModal — shown whenever ... sessions_remaining is between 1 and 5" uses the display figure, not the stricter upcoming+completed booking-time count). Status: WORKING CORRECTLY. **Note for cross-subsystem awareness**: the actual booking-time credit enforcement (counting `upcoming + completed` against `sessions_total`, per ClientPortal.md §10/§26.A) is NOT implemented in this file and must be verified in subsystem 2/3's booking-confirmation code path — out of this subsystem's scope.

4. **CoachPendingTasksGateModal** (`coach-pending-tasks-gate-modal.tsx`) — **not a client-portal gate**. Confirmed via `grep`: only imported/mounted in `src/app/(coach)/_layout.tsx:30,66`, never referenced from any `(client)/*` file. It gates the **coach** role (nudges a coach to resolve past sessions missing attendance/notes). Has **no web precedent** — ClientPortal.md's Client Portal scope has nothing resembling this; it's coach-facing app-only functionality per its own doc comment (`coach-pending-tasks-gate-modal.tsx:2-9`, "New PRD.md §4.B"). Correctly out of the phone/measurement/sessions-low precedence chain (separate orchestration, coach-only). Not further audited here (coach module is subsystem 5's scope) beyond confirming it does not leak into the client gate stack.

`global-gates.tsx` composition itself: fetches `getClientGateStatus()` once per mount (`useEffect` keyed on `profile?.phone`, `global-gates.tsx:26-38`), fails open on fetch error (`.catch()` swallows, `global-gates.tsx:32-34`) — matches the fail-soft principle in ClientPortal.md §24 for auxiliary checks, though arguably a gate-status fetch failure "failing open" (showing no gate at all) is a meaningfully different risk profile than web's presumed fail behavior — not specified in web docs either way, so **not flaggable as a regression**, just worth noting for subsystem 5's app-shell audit.

---

## Gaps vs Web Reference

- **AUTH-G1 (deliberate addition)**: Forgot-password/reset-password flow. Web has none; mobile implements a full, working flow. Documented in code as an intentional mobile addition (`forgot-password.tsx:1-7`). Not a bug — flagged per task instructions as "APP has MORE than web."
- **AUTH-G2 (deliberate divergence)**: Unified login screen for all 3 roles (vs. web's separate `/login/<role>` pages) with no login-time role-rejection message; role boundary enforced uniformly at each `_layout.tsx` instead. Documented explicitly in `auth-context.tsx:223-228` (citing the revert of a prior wrong-role-rejection attempt, commit `6a42a6f`). Functionally safe (role boundary still enforced, just later/silently), but the specific UX message web has ("This account isn't registered as a client...") does not exist anywhere in mobile.
- **AUTH-G3**: Email OTP verification during signup is link-based (click emailed confirmation link) rather than an in-app 6-digit-code entry step, when "Confirm email" is enabled. Web's flow enters a code in-app (`verifyOtp(type:'signup')`); mobile's signup flow shows "Check your email" and stops (`signup.tsx:126-134`). Mobile *does* have a separate in-app OTP-code screen (`otp.tsx`), but it's a parallel sign-in method, not part of the signup step sequence. Functionally reasonable (both ultimately verify the email), architecturally different sequencing than web's diagram in §21.
- **AUTH-G4**: `EnrolledHomeScreen`'s stage-redirect switch (`index.tsx:214-230`) has no case for `'marketing'`, `'demo_booked'`, or `'demo_completed'` — see AUTH-010 in the matrix.
- **AUTH-G5**: Activate Plan unconditionally routes to `/onboarding` next (`activate.tsx:41`), not stage-aware — see AUTH-007.
- **AUTH-G6**: Onboarding measurement fields (waist/chest/hip/arms/thigh) labeled "(cm)" vs. web's inches — see AUTH-006.
- **AUTH-G7**: Password-change minimum length inconsistent (6 vs. spec's 8) — see AUTH-005.
- **AUTH-G8**: `sync_role_on_auth_user_metadata_update.sql` and this repo's migrations do not include (and cannot, since they're in the separate web-app repo) the actual column-level protection against a client directly `UPDATE`-ing `profiles.role` via a raw table call bypassing this app's own `updateMyProfile()` wrapper. App-layer never attempts this; DB-layer protection is inherited from the shared production schema and unverifiable from within this repo. Flagged as **UNKNOWN — REQUIRES VERIFICATION**, not asserted as broken.

---

## Edge Cases Observed

- **Paused/inactive-with-nothing-newer client, journey stage falls through to `marketing`, but a subscription row still exists**: `HomeScreen` (`index.tsx:350-353`) picks `EnrolledHomeScreen` (since `getLatestSubscription()` is non-null), but `EnrolledHomeScreen`'s stage-switch has no `'marketing'` case, so the client sees the enrolled dashboard's empty states instead of being funneled to Plans, unlike web's explicit `marketing → /client/plans` hard redirect. See AUTH-010.
- **Renewal client immediately after activating**: `activate.tsx:41` always pushes `/onboarding`; a renewal client (who has `client_onboarding` already) hitting this screen will have `submitOnboarding()` throw "already submitted" if they try to fill and submit it, with no automatic bounce to `/renewal-checkin`. See AUTH-007.
- **Signup with "Confirm email" disabled** (session returned immediately): `needsEmailConfirmation` false → straight to phone-OTP stage (`signup.tsx:83`), matching web's environment-dependent skip behavior.
- **Password-recovery deep link received while already logged in as a different flow (e.g., mid-signup phone step)**: `auth-context.tsx`'s two escape-hatches (`recoveryInProgress`, `signupPhoneStepInProgress`) are independent booleans on the same `(auth)/_layout.tsx:21` OR-condition — both are handled, no observed conflict.
- **`otp.tsx` "Skip for now" ambiguity**: falls back to "/login" even mid-way through requesting an OTP code, discarding any in-flight code request — acceptable, no state corruption since Supabase OTP codes simply expire unused.
- **Google sign-in cancelled by user**: `auth-context.tsx:277` explicitly returns `{error: null}` for `cancel`/`dismiss` results — no spurious error shown, correct fail-soft handling not explicitly covered in web docs but a sensible mobile-specific necessity (in-app browser dismissal has no web equivalent).

---

## Matrix Rows

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Root Cause | Frontend | Backend/API | Database | Dependencies | Severity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AUTH-001 | Auth | Signup | Role assignment | `src/lib/auth/auth-context.tsx:242-247` | `signUp()` options.data only carries `full_name`/`phone`; role never sent | Role always server-derived, never client-supplied | WORKING CORRECTLY | N/A | `signup.tsx`, `auth-context.tsx` | Supabase Auth `signUp` | `profiles` (via inherited `handle_new_user()` trigger, not in this repo) | Shared web-app schema | Low (verified secure) |
| AUTH-002 | Auth | Role sync (ops-provisioning) | `sync_role_on_auth_user_metadata_update` trigger | `supabase/migrations/20260912110000_sync_role_on_auth_user_metadata_update.sql:21-45` | Re-syncs `profiles.role` from `raw_app_meta_data` on a follow-up admin UPDATE; only fixes coach/admin provisioning races | Server-only role source, no client path | WORKING CORRECTLY | N/A | N/A | Postgres trigger | `profiles`, `coach_profiles`, `client_profiles` | Admin provisioning flow (subsystem 5) | Low |
| AUTH-003 | Auth | Signup/Google role escalation via direct table write | Column-level RLS protection on `profiles.role` | Not present in this repo's `supabase/migrations/*` | Cannot confirm whether `profiles` UPDATE RLS policy restricts the `role` column from self-modification via a raw REST call bypassing `updateMyProfile()` | Client should be structurally unable to set its own role even via direct table access (web's migrations 0051/0055 closed exactly this) | UNKNOWN — REQUIRES VERIFICATION | Migration lives in the separate web-app repo / already-applied to the shared live DB, not visible from this repo | N/A | N/A | `profiles` RLS policy (inherited) | Live DB introspection needed | Medium (security-relevant, but app-layer is already safe) |
| AUTH-004 | Auth | Login | Wrong-role login UX message | `src/lib/auth/auth-context.tsx:222-233` | No role check/rejection at sign-in; silent redirect to the correct role's home happens later in that role's `_layout.tsx` | Web shows "This account isn't registered as a client..." immediately on wrong-role login | IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW | Deliberate architecture choice — unified login screen for 3 roles (documented, commit `6a42a6f` reverted the web-matching behavior because it broke coach/admin login) | `login.tsx` | `signInWithPassword` | `profiles.role` | None | Low (UX-only, security boundary intact) |
| AUTH-005 | Auth | Profile / Password reset | Password minimum length | `src/app/(client)/profile.tsx:99,268`; `src/app/(auth)/reset-password.tsx:50` | Enforces `length < 6` as the rejection threshold (i.e., accepts 6-7 char passwords) | Web requires ≥8 chars for password change, same as signup; mobile's own signup (`signup.tsx:57`) also uses 8 | WORKING BUT INCORRECT | Inconsistent constant across 3 password-entry surfaces | `profile.tsx`, `reset-password.tsx` | `supabase.auth.updateUser` | `auth.users` | None | Low-Medium |
| AUTH-006 | Onboarding | Onboarding form | Measurement unit labels | `src/app/(client)/onboarding.tsx:153-157` | Waist/Chest/Hip/Arms/Thigh fields labeled "(cm)" | Web spec: these are inches (§11, §13) | WORKING BUT INCORRECT | Placeholder text mismatch vs. spec's stated unit; DB column semantics not independently re-verified in this pass | `onboarding.tsx` | `submitOnboarding` (`onboarding.ts`) | `client_onboarding`, `progress_logs` | Cross-check with Progress module (subsystem 4) for consistent unit assumption | Medium (data-quality risk: values entered under the wrong assumed unit skew trend charts) |
| AUTH-007 | Post-purchase | Activate Plan → next step | Post-activation routing | `src/app/(client)/activate.tsx:41` | Unconditionally `router.replace('/onboarding')` after activation succeeds | Should route based on recomputed journey stage: first-time → onboarding, renewal → renewal-checkin | WORKING BUT INCORRECT | Hardcoded navigation instead of re-deriving `getClientJourneyStage()` post-activation | `activate.tsx` | `activateSubscription` (edge function) | `subscriptions` | Renewal flow (subsystem 2/3) | Medium |
| AUTH-008 | Onboarding | Onboarding re-entry after already submitted | Dead-end handling | `src/app/(client)/onboarding.tsx` (no guard); `src/lib/data/onboarding.ts:55-56` | If a client with existing onboarding lands on `/onboarding` (e.g., via AUTH-007), filling and submitting throws "already submitted" with no automatic redirect away | Screen should be unreachable once its underlying condition is no longer true (ClientPortal.md §22 "must not be reachable ... once its underlying condition is no longer true") | PARTIALLY IMPLEMENTED | No stage-check guard on mount | `onboarding.tsx` | `submitOnboarding` | `client_onboarding` | AUTH-007 | Low-Medium |
| AUTH-009 | Gates | Global gate precedence | Phone > Measurement > Sessions-low | `src/components/gates/global-gates.tsx:42-49` | Exact match to spec's precedence order | Same | WORKING CORRECTLY | N/A | `global-gates.tsx` | `gates.ts` | `progress_logs`, `subscriptions`, `bookings` | None | N/A |
| AUTH-010 | Journey | Dashboard hard-redirect gate | Missing `marketing` case in enrolled dashboard | `src/app/(client)/index.tsx:214-232` | Switch on journey stage has no case for `marketing`/`demo_booked`/`demo_completed`; falls to `default` → renders the enrolled dashboard's empty states instead of redirecting | Web: `marketing` → hard redirect to `/client/plans` from the dashboard | WORKING BUT INCORRECT | Switch statement omits 3 of 9 stage values (only reachable when a paused/inactive subscription row exists with nothing newer and no/lapsed demo — the §4.0 step-3 fallthrough case) | `index.tsx` | `getClientJourneyStage()` | `subscriptions`, `bookings` | AUTH journey state machine | Medium (edge case, but a real client-facing dead-state: no clear CTA to re-purchase) |
| AUTH-011 | Measurement gate | Server-side enforcement | `assertMeasurementsFresh` | `src/lib/data/measurement-status.ts:44-49` | Throws literal web-matching message; called from booking/join entry points (per its own doc comment) | Server-enforced, not just UI-disabled, matching web §10/§26.A | WORKING CORRECTLY (as implemented here; actual call-site coverage at every booking/join entry point is subsystem 2's responsibility to verify exhaustively) | N/A | N/A | N/A | `progress_logs` | Booking/Zoom join flows (subsystem 2) | N/A |
| AUTH-012 | Gates | Sessions-low display metric | `getSessionsUsedCount` | `src/lib/data/subscription.ts:59-67` | Counts only `status='completed'` bookings | Matches web's display-only `subscription_usage_view` semantics for this specific gate (not the stricter booking-time enforcement count) | WORKING CORRECTLY | N/A | `gates.ts` | N/A | `bookings` | Booking-time credit enforcement lives elsewhere (subsystem 2/3) — must NOT reuse this function for that purpose | Low, but flagged for cross-subsystem awareness |
| AUTH-013 | Auth | Forgot/reset password | New functionality vs. web | `src/app/(auth)/forgot-password.tsx`, `reset-password.tsx`, `auth-context.tsx:90-95,146-158,183-196,287-298` | Fully functional Supabase-recovery-email flow with deep-link handling | Web has no forgot-password functionality at all (button present, no handler) | IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW (deliberate addition, documented) | Product decision, cited explicitly in code comments | forgot-password.tsx, reset-password.tsx | Supabase Auth (`resetPasswordForEmail`, `updateUser`) | `auth.users` | None | Informational (not a defect) |
| AUTH-014 | Onboarding | Insert-once enforcement | App + DB layer | `src/lib/data/onboarding.ts:55-56,71-75`; `supabase/migrations/20260912090000_client_onboarding_unique_client.sql` | Pre-check + unique index on `client_id`, race-safe | Matches web's "insert-once enforced at both RLS layer and application code" | WORKING CORRECTLY | N/A | `onboarding.tsx` | N/A | `client_onboarding` unique index | None | N/A |
| AUTH-015 | Profile | Field editability matrix | Name/phone/password/photo/goals/equipment/medical-notes editable; email/height/weight not | `src/app/(client)/profile.tsx:316-410`, `src/lib/data/profile.ts` | Matches web's §13 table exactly, including emergency-contact hidden from client | Same | WORKING CORRECTLY | N/A | `profile.tsx` | N/A | `profiles`, `client_profiles` | None | N/A |
| AUTH-016 | Role routing | `getHomeRouteForRole` | Single source of truth for role→route | `src/lib/auth/role-routing.ts:12-22`; tested `__tests__/role-routing.test.ts` | Client/coach/admin/unknown all covered, unit-tested | Same as web's role-based routing intent | WORKING CORRECTLY | N/A | Used by all 4 `_layout.tsx` files | N/A | `profiles.role` | None | N/A |
| AUTH-017 | Gates | Coach pending-tasks gate | Role scope confirmation | `src/components/gates/coach-pending-tasks-gate-modal.tsx`; mounted only `src/app/(coach)/_layout.tsx:66` | Coach-only soft nudge for sessions missing attendance/notes; no web precedent | N/A — mobile-app-only addition per "New PRD.md §4.B", correctly scoped to coach role, does not leak into client gate stack | WORKING CORRECTLY (as a coach-scoped feature; full coach-module correctness is subsystem 5's scope) | N/A | `coach-pending-tasks-gate-modal.tsx` | N/A | `bookings` | Coach module (subsystem 5) | Informational |
| AUTH-018 | Auth | Phone OTP | Real MSG91 implementation (vs. web's currently-pending KYC) | `supabase/functions/phone-otp/index.ts` | Fully wired to MSG91 OTP v5 API; same "Skip for now" bypass reproduced regardless | Web's own MSG91 account is documented as KYC-pending (non-functional in practice); this mobile edge function is real but shares the same skip bypass | IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW (functionally more complete than web, bypass still present) | Documented explicitly in `phone-otp/index.ts:1-8` | `phone-otp.ts`, `phone-gate-modal.tsx`, `signup.tsx` | `phone-otp` edge function | None (no DB writes from this function) | Depends on `MSG91_AUTH_KEY` env var being provisioned | Low (skip bypass still means unverified phones are accepted, matching web's stated actual behavior) |
| AUTH-019 | Journey | `isRenewalSubscription` / renewal detection | Any other subscription row exists | `src/lib/data/journey.ts:37-45` | `count` query `neq('id', currentSubscriptionId)`, existence-only | Matches web's "not the client's first-ever subscription" definition | WORKING CORRECTLY | N/A | `journey.ts` | N/A | `subscriptions` | None | N/A |
| AUTH-020 | Journey | `slot_selection` check scope | First-time client, any active recurring slot (not filtered by subscription) | `src/lib/data/journey.ts:90-92`, `recurring-schedule.ts:86-98` | `getMyActiveRecurringSlots()` — status='active', no subscription filter | Matches web's literal wording: "no active recurring_slots at all" | WORKING CORRECTLY | N/A | `journey.ts` | N/A | `recurring_slots` | None | N/A |

**Total matrix rows: 20**
