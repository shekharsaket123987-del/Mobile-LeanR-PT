# Audit Section 5: Admin/Coach Cross-Dependencies, Navigation Shell, Duplicate UI Systems, Dead Code

Scope: `leanr-mobile-app` (Expo/React Native). Reference: `mobile-app-reference/ClientPortal.md` (web spec, 872 lines, read in full). All line numbers are current as of this audit pass (2026-09-13).

---

## Part A: Admin/Coach → Client-Visible Effects Inventory

### A1. Coach attendance + session notes → booking status + "Coach notes" (ClientPortal.md §10, §11)

- **Attendance**: `src/lib/data/coach-portal.ts:207-240` `markAttendance()`. `present`/`late` → upserts `attendance` row, sets `bookings.attendance_overdue=false`, booking stays `upcoming`. `absent` → upserts `attendance.status='absent'` and sets `bookings.status='missed', no_show_party='client'` directly. Matches web spec exactly (§10 "Missed ... explicitly set when a coach marks attendance 'Absent'").
- **Notes → completion**: `src/lib/data/coach-portal.ts:247-273` `submitSessionNotes()` inserts a `workout_notes` row then sets `bookings.status='completed'`. Client cannot self-complete a session — confirmed no client-side write path to `bookings.status='completed'` anywhere in `src/lib/data/bookings.ts`. Matches spec.
- **Coach UI**: `src/app/(coach)/session/[id].tsx:39-117` implements Join → Present/Late/Absent → Notes → Complete, with stage re-derived from persisted `booking.status` + attendance row on every load (not stale local state) — `src/app/(coach)/session/[id].tsx:137-146`. The notes form (`:161-175`) only collects the single `notes` field; `homework`/`exercises_performed`/`performance_rating`/`improvements`/`additional_remarks` have no UI (submitted as `undefined`, `coach-portal.ts:258-268`) — this is inert since the client never sees those fields anyway (§11), so not flagged as a defect.
- **Client-side "Coach notes" surfacing — CONFIRMED ABSENT.** Grepped `workout_notes` across every `src/lib/data/*.ts` file: it appears only in `admin-sessions.ts`, `coach-clients.ts`, `coach-portal.ts`, and `identity.ts` (unrelated match) — **never** in `bookings.ts`, `progress.ts`, or any file consumed by a `(client)/*` screen. The `Booking` type (`src/lib/data/types.ts:10-35`) has no `coach_notes`/`notes` field at all. `src/app/(client)/sessions.tsx` (full file read) and `src/app/(client)/progress.tsx` render no coach-notes preview anywhere. Web spec §11/§22 explicitly requires "Coach notes" to be shown read-only on both the Sessions and Progress screens.
  - **Status: NOT IMPLEMENTED.** Attendance/completion state machine is correct; the client-visible artifact of a completed session (the coach's write-up) is simply never fetched or rendered anywhere in the client app.

### A2. Admin escalation resolution — "must call client" gate (ClientPortal.md §16)

- `supabase/migrations/20260907120000_escalation_call_gate_trigger.sql` — DB triggers `escalations_call_gate` (before update) and `escalation_notes_call_gate` (before insert) reject any status/assessment/note mutation until `called_client_at` is set. This is the **real trust boundary** (mobile writes Supabase directly, no server-action layer), correctly noted in the migration's own header as closing the gap a client-side-only check would leave open.
- `src/lib/data/admin-escalations.ts:121-128` `confirmCalledClient()` is the only mutation allowed before the gate opens; `:130-169` (`updateEscalationAssessment`, `addEscalationNote`, `markEscalationInProgress`, `resolveEscalation`) all rely on the DB trigger to reject premature calls — there is no explicit client-side `requireCalledClient()` pre-check inside this file itself (contrary to its own header comment at `:9-10` claiming client-side enforcement "here"); the guard is DB-only in the code actually read. Functionally equivalent (the trigger raises a Postgres exception the UI would need to catch/display), but the file's own doc-comment slightly overstates what it does.
- `resolveEscalation()` (`:151-169`) notifies the client (`notifyProfile(..., 'escalation_resolved_client')`) — matches §15/§16.
- **Status: WORKING CORRECTLY** (DB-enforced gate matches web's server-action equivalent; client sees resolution notes/status as documented).

### A3. Coach-change request resolution (ClientPortal.md §12)

- Reject: `src/lib/data/admin-coach-change.ts:65-77` — status→`rejected`, client notified. Correct.
- Approve-blank (client self-serves): `:80-98` — status→`approved`, client notified, matches spec's "approved + needsCompletion" path.
- Approve-with-coach (admin picks replacement immediately): `:101-168` — cancels old `recurring_slots`, inserts new ones, generates bookings, closes old `conversations` row and opens a new one, notifies client/old coach/new coach (3 template keys, matching §15's Gap Verification cross-check).
- Client self-serve completion (after approve-blank): `src/lib/data/coach-change.ts:67-78` → invokes edge function `supabase/functions/coach-change-actions/index.ts` (service-role, since `coach_change_requests`/`conversations` have no client UPDATE RLS). That function (`:94-124`) also only cancels old `recurring_slots` and opens/closes `conversations`.
- **Gap found — neither path cancels the client's still-`upcoming` bookings with the old coach.** Web spec §12.4 states explicitly: *"cancels all active recurring_slots with the old coach and cancels their still-upcoming bookings (reason logged as 'Client changed coaches')."* Grepped both `admin-coach-change.ts:100-148` and `coach-change-actions/index.ts:94-124` — neither touches the `bookings` table for the old coach's already-scheduled sessions. Contrast: `src/lib/data/admin-clients.ts:249-301` (`transferClientCoach`, the *manual admin transfer* tool) **does** correctly repoint `bookings` with `status='upcoming'` to the new coach (`:275-280`) — so the codebase knows how to do this correctly in one code path but omits it in the two coach-*change-request* completion paths.
  - **Status: IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW.** A client who completes a formal coach-change request keeps stale `upcoming` bookings pointed at their old (now-unassigned) coach — those sessions would still show in "My Sessions" and the old coach's queue, contradicting the web app's atomic old-pattern retirement.
- **Status (overall A3): WORKING BUT INCORRECT** for the bookings-orphan gap; everything else (chat switch, notifications, recurring-slot repoint) matches spec.

### A4. Admin provisioning — role never client-settable (ClientPortal.md §4.2, §26)

- `supabase/functions/admin-provisioning/index.ts:47-52` verifies caller is `role==='admin'` via the caller's own JWT before doing anything privileged.
- `handleCreateClient` (`:63-134`) / `handleCreateCoach` (`:137-187`) both call `admin.auth.admin.createUser({..., app_metadata: {role: "client"|"coach"}, ...})` — role is set via `app_metadata` (server-side, service-role only), **never** taken from client-suppliable `user_metadata` or request body directly as a role field. Matches the web app's `handle_new_user()` trigger discipline (§4.2) exactly — role is read from `raw_app_meta_data`, never client-declared.
- `src/lib/data/admin-provisioning.ts:38-51` is a thin `supabase.functions.invoke()` wrapper — no service-role key or privileged logic in the mobile bundle itself.
- **Status: WORKING CORRECTLY.** No re-verify-role-is-client-settable vulnerability found.

### A5. Shadow coaching → client-visible "Covering for X" banner (ClientPortal.md §10, §17, §25)

- Assignment mechanics (`src/lib/data/admin-shadow.ts`, 606 lines, fully read) are an unusually thorough, verbatim-scored port of the web's `scoreShadowCandidate`/leave-approval cascade: `assignShadowCoach()` (`:193-233`) calls RPC `assign_shadow_coach` (which per its own header comment both records the assignment AND repoints affected `upcoming` bookings' `coach_id`) and notifies both the client (`shadow_coach_assigned`) and shadow coach (`shadow_assignment_for_coach`). `runLeaveApprovalCascade()` (`:458-606`) auto-assigns shadow coverage on leave approval, cascades when a shadow coach is themselves going on leave, and alerts all admins on any uncovered occurrence. This is admin/backend-correct and matches §15's notification table precisely.
- **Client-side rendering — CONFIRMED ABSENT.** Grepped `shadow`/`covering`/`acknowledg` across every file under `src/app/(client)/` (content search, not filename): **zero matches**. Full read of `src/app/(client)/sessions.tsx` (258 lines) confirms no shadow-coach badge, no "Covering for {primaryCoachName}" banner, no acknowledgeable notice anywhere in the UI. The client only ever sees `booking.coach_name` (from whichever `coach_id` is currently on the row) with no indication that coach differs from their usual assigned coach.
  - **Status: NOT IMPLEMENTED (client side).** Backend/data-layer mechanics fully built (arguably over-built relative to what the client UI consumes); the client-visible artifact the whole feature exists to produce — the "Covering for X" banner with one-time acknowledge dismissal (web spec §10, §25) — has no corresponding screen code at all.

### A6. Admin renewals / coach renewals — threshold discrepancy (ClientPortal.md §9)

- `src/lib/data/admin-renewals.ts:11` and `src/lib/data/coach-renewals.ts:20` both hardcode `SESSIONS_LOW_THRESHOLD = 5` (with an explicit in-code citation to `LEANR_PT_MOBILE_PRD.md §13 rule 16`, not the web app).
- Web spec (`ClientPortal.md:278`) explicitly states staff should see a **wider, separate threshold**: *"Staff (admin/coach) also see a wider Renewal Opportunity flag at `sessions_remaining <= 10` (`RENEWAL_OPPORTUNITY_THRESHOLD`), deliberately wider than the client's own 5-session trigger so staff see it coming first."*
- Mobile's admin/coach Renewal Opportunities screens use the **same** threshold (5) as the client-facing `SessionsLowGateModal`, not a wider staff-side 10.
  - **Status: IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW.** Staff lose the early-warning window the web app deliberately provides (5 extra sessions' notice) — admins/coaches only see a renewal opportunity at the same moment the client does, not before. Low severity (functional, not broken), but a genuine intent deviation from the web reference, and internally consistent between admin/coach (both wrong the same way, so at least not admin/coach-inconsistent).

### A7. Leave management → client-visible schedule impact (ClientPortal.md, admin-side)

- `src/lib/data/admin-leave.ts:56-89` `resolveLeaveRequest()` — approve triggers `runLeaveApprovalCascade` (A5); reject notifies only the coach, no cascade (matches PRD "rejecting a leave never cascades").
- Client-visible effect is entirely mediated through A5's shadow-coach reassignment (bookings' `coach_id` repointed) — since A5's client banner is absent, a client whose coach goes on leave sees their session simply reassigned to a different coach with **no explanation UI**, only the generic `coach_on_leave_client` notification (`admin-shadow.ts:486-494`, in-app/email only, no distinct in-session badge).
- **Status: PARTIALLY IMPLEMENTED** (notification fires correctly; in-session visual continuity banner does not exist — same root cause as A5).

### A8. Other admin/coach files — skimmed, no direct client-visible effect beyond what's covered above

| File | Client-visible effect | Verdict |
|---|---|---|
| `admin-sales.ts` | None (staff-only `sales_view` reader) | admin-only, no client-portal effect traced |
| `admin-search.ts` | None (universal search UI) | admin-only, no client-portal effect traced |
| `admin-activity-log.ts` | None (read-only audit trail) | admin-only, no client-portal effect traced |
| `admin-scheduling.ts` | Read-only grouped view of the same `bookings` clients already see; no writes | admin-only, no client-portal effect traced |
| `admin-settings.ts` | Writes `package_tiers`/`system_settings` (cancellation/reschedule cutoffs) — these values are read live by client-side booking flows (covered by subsystem 2), so an admin changing them does change client-visible cutoff copy/enforcement, but the mechanism itself is just a settings table write | admin-only mechanism; client effect is indirect via subsystem-2-covered cutoff logic |
| `admin-availability.ts` | None (staff cross-coach day view) | admin-only, no client-portal effect traced |
| `admin-dashboard.ts` | None (staff KPIs) | admin-only, no client-portal effect traced |
| `admin-reports.ts` | None (CSV export via native Share sheet, replacing web's jsPDF) | admin-only, no client-portal effect traced |
| `admin-clients.ts` | `pauseClientSubscription`/`resumeClientSubscription` (`:224-240`), `adjustClientSessions`/`grantPauseDays` (`:193-201`), `transferClientCoach` (`:249-301`, correctly repoints upcoming bookings — see A3 contrast), `logMeasurement`/`logEscalation`/`logRefundRequest` — all client-visible via subscription/session/escalation state changes, each correctly paired with a `notifyProfile` call | WORKING CORRECTLY |
| `admin-sessions.ts` | `cancelSessionAsAdmin`/`rescheduleSessionAsAdmin` bypass client cutoffs (`p_enforce_cutoff: false`, matches §10 "admin overrides everything"), both notify the client | WORKING CORRECTLY |
| `admin-coaches.ts` | Read-only coach roster; reuses `transferClientCoach` from admin-clients.ts for the one mutating action | admin-only, no new client-portal effect |
| `admin-provisioning` (edge fn) | Creates client/coach accounts with initial subscription/schedule — see A4 | WORKING CORRECTLY |
| `coach-renewals.ts`, `coach-search.ts`, `coach-performance.ts`, `coach-availability.ts` | Read-only coach-side views; `coach-availability.ts` correctly enforces (client-side only, not DB — confirmed no CHECK/trigger exists for the 24h leave-request notice, per the file's own header comment at `:19-24`) the "coach is read-only on their own hours, only Request Leave" rule (RLS-backed: no coach INSERT/UPDATE policy on `coach_availability`) | Read-only reflections of state covered elsewhere; leave-request 24h-notice enforcement is client-side-only (same class of gap noted for the web app itself) |
| `coach-utilization.ts` | Shared lowest-utilization-first ranking used by demo-booking/recurring-schedule matching (subsystem 2 territory) — confirmed correctly shared between both call sites via one implementation, per its own header comment | WORKING CORRECTLY (cross-reference only) |

### A9. Session-reminder cron — DEFINITIVELY NOT IMPLEMENTED

Web spec (§10, §15, §33) requires `/api/cron/session-reminders`: emails client+coach ~6h before each `upcoming` session, deduped via a `reminder_sent_at` column, the one purely time-triggered notification in the app.

Exhaustive verification performed:
- `ls supabase/functions/*` → exactly 9 functions exist: `admin-provisioning`, `coach-change-actions`, `create-assessment-booking`, `phone-otp`, `razorpay`, `razorpay-webhook`, `send-push`, `subscription-lifecycle`, `zoom-meeting`. None is named/shaped like a reminders job.
- `grep -ril "reminder"` across `supabase/` and `src/` → only hit is `src/lib/data/notifications.ts:25`, which is just the `NotificationType` enum literal `'reminder'` (unused for this purpose) — no reminder-sending code.
- `grep -ril "cron"` across the repo → only hits are `supabase/migrations/20260912100000_fix_mark_missed_bookings_permission.sql` (an unrelated bug-fix migration for the missed-booking sweep, explicitly documents it is "Not a cron" — `src/lib/data/bookings.ts:24`) and the same `bookings.ts` comment.
- `grep -rn "reminder_sent_at"` across the entire repo (all file types) → **zero matches**. The column the web app uses to dedupe reminder sends does not exist anywhere in this codebase's migrations or types.
- No `supabase/config.toml`, no `.github/workflows/*`, no `eas.json` cron/schedule entries reference a reminders job.
- `send-push/index.ts` is event-triggered (fired by a Postgres trigger on every `notifications` INSERT via `pg_net.http_post`), not time-based — confirmed by its own header comment.

**Status: NOT IMPLEMENTED — CONFIRMED DEFINITIVELY**, corroborating the prior partial audit's flag. No session-reminder mechanism (cron, scheduled Edge Function, or otherwise) exists anywhere in `leanr-mobile-app`. This is a full feature gap, not a partial/differently-implemented one.

---

## Part B: Navigation & Role-Routing Architecture

- **Root shell** (`src/app/_layout.tsx:29-58`): loads fonts, wraps everything in `AuthProvider`, renders `<Slot/>` (Expo Router's group-delegation primitive) plus a `NotificationTapRouter` that must live inside `AuthProvider` (confirmed by comment `:21-23`). No role branching happens here — that's delegated entirely to each route group's own `_layout.tsx`.
- **Single source of truth for role→home routing**: `src/lib/auth/role-routing.ts:12-22`, `getHomeRouteForRole()`. `client`→`/(client)`, `coach`→`/(coach)`, `admin`→`/(admin)`, anything else (including `undefined`)→`/unsupported-role`. Used consistently by all 5 group layouts: `(auth)/_layout.tsx:29`, `(marketing)/_layout.tsx:25`, `(client)/_layout.tsx:62`, `(coach)/_layout.tsx:82`, `(admin)/_layout.tsx:45`. Unit-tested: `src/lib/auth/__tests__/role-routing.test.ts` covers all 4 branches including `undefined`.
- **`unsupported-role.tsx`** (`src/app/unsupported-role.tsx`): renders a safe, non-crashing fallback ("The {role} app isn't built yet") with a sign-out button — does not loop, does not throw. **Status: WORKING CORRECTLY.** Minor cosmetic note: it uses the legacy dark `Brand`/`DisplayFont` theme (`constants/theme`) rather than the app's now-standard `LightBrand` system — harmless since it's an edge-case screen, but inconsistent with the rest of the now-relit app.
- **`(client)/_layout.tsx`** (dual-branch): pre-purchase clients get a 4-tab bar (Home/Plans/Reviews/More); once `hasEverPurchased` (derived from `getLatestSubscription()`, `:42,65`) the 5-tab active-portal bar renders (Home/Schedule/My Plan/Chats/More). Both branches share one `LightTabBar` (`:26,72,133`) and one `LightBottomSheet`-based More sheet (`:122-124,193-195`). `GlobalGates` is mounted in both branches (`:70,131`), outside the `Tabs` navigator, so gate modals overlay every tab regardless of active screen. Auth/role gate is co-located in the same file (`:60-63`): no session→`/welcome`; wrong role→`getHomeRouteForRole`.
- **`(auth)/_layout.tsx`**: if a session exists, redirects via `getHomeRouteForRole`; explicitly does **not** redirect mid password-recovery or mid signup-phone-OTP-step (`:21-23`, checked via `recoveryInProgress`/`signupPhoneStepInProgress` from `AuthProvider`) — correct handling of a real Supabase quirk (a recovery deep link establishes a genuine session before the user has actually reset their password).
- **`(marketing)/_layout.tsx`**: unauthenticated shell; redirects an already-logged-in user who backs into `/welcome`.
- **Coach/admin layouts**: `(coach)/_layout.tsx` uses `LightTabBar` exclusively (Home/Clients/Schedule/Chats/More) — its own header comment (`:4-5`) documents this as "replacing the dark FloatingTabBar" (historical, not live code). `(admin)/_layout.tsx` likewise uses `LightTabBar` (Home/Clients/Coaches/Reports/More), documented in its own header as a reduced-scope mobile admin app (Escalations/Leave/Shadow Coverage — full admin parity stays web/tablet).
- **`welcome.tsx`**: top-level (outside all route groups), full-bleed splash with a "Get Started" CTA into `(marketing)`. Every role layout's "no session" branch redirects here, not straight to a login form — confirmed consistently across `(client)`, `(coach)`, `(admin)` layouts (all `!session → <Redirect href="/welcome"/>`, e.g. `(client)/_layout.tsx:61`).

**Status: WORKING CORRECTLY.** Role routing is centralized, tested, and safely handles the unrecognized-role edge case.

---

## Part B: Tab Bar Implementations — Actual Usage

Two files exist under `src/components/ui/floating-tab-bar.tsx` and `src/components/light/light-tab-bar.tsx`.

- `LightTabBar` (`components/light/light-tab-bar.tsx`) is imported and actively rendered by **all four** route-group layouts that show a tab bar: `(admin)/_layout.tsx`, `(client)/_layout.tsx`, `(coach)/_layout.tsx`, `(marketing)/_layout.tsx`.
- `FloatingTabBar` (`components/ui/floating-tab-bar.tsx`) — grepped for any real import (`from '@/components/ui/floating-tab-bar'`) across the whole `src/` tree: **zero matches**. The only reference anywhere is a doc-comment in `(coach)/_layout.tsx:4` explicitly describing it as having been *replaced*.
  - **Status: UNUSED-DEAD.** `src/components/ui/floating-tab-bar.tsx` is fully superseded by `LightTabBar` and has no live importer anywhere in the app.

"More" sheets: `more.tsx` (client), `coach-more.tsx`, `admin-more.tsx` are all live — each is rendered as content inside a `LightBottomSheet` triggered from its respective layout's `onMorePress` (e.g. `(client)/_layout.tsx:122-124`), not as standalone routes with their own chrome. All three are in active use, one per role.

---

## Part B: Duplicate UI System Verdict (`ui/*` vs `light/*` — definitive file-by-file usage table)

Method: for every file in `src/components/ui/`, grepped the whole `src/` tree for a real import of that exact module path (excluding the file's own self-reference), then manually traced every nonzero hit to confirm the importing file is itself live (not itself dead code, e.g. `chat-thread.tsx`, already confirmed dead by subsystem 4).

| `ui/*` file | Real importers found | Verdict |
|---|---|---|
| `auth-shell.tsx` | 0 | **UNUSED-DEAD** — fully superseded by `light/light-auth-shell.tsx` (used in all 5 auth screens: forgot-password, login, otp, reset-password, signup) |
| `avatar.tsx` | 0 | **UNUSED-DEAD** |
| `badge.tsx` | 0 | **UNUSED-DEAD** |
| `bottom-sheet.tsx` | 0 | **UNUSED-DEAD** — superseded by `light/light-bottom-sheet.tsx` |
| `button.tsx` | `(client)/index.tsx` (imports only `IconButton`, a small theme-neutral icon wrapper, `:27,94,280`), `(client)/plans.tsx` (imports `PrimaryButton` for the dark `EnrolledPlansScreen` branch, `:14,163`), `ui/chat-thread.tsx` (itself dead) | **STILL LIVE** — not dead, but usage is down to one small utility component (`IconButton`) plus one legacy full-screen branch (see `plans.tsx` finding below) |
| `chat-thread.tsx` | 0 real (previously confirmed dead by subsystem 4) | **UNUSED-DEAD** (reconfirmed) |
| `chip.tsx` | 0 | **UNUSED-DEAD** |
| `chip-grid.tsx` | 0 | **UNUSED-DEAD** |
| `floating-tab-bar.tsx` | 0 | **UNUSED-DEAD** (see tab-bar section above) |
| `glass-card.tsx` | `(client)/plans.tsx:15,159` (dark `EnrolledPlansScreen`), `components/screen-scaffold.tsx` (dark scaffold, itself only used by `plans.tsx`) | **STILL LIVE**, scoped entirely to the one legacy screen branch below |
| `menu-row.tsx` | 0 | **UNUSED-DEAD** — superseded by `light/light-menu-row.tsx` |
| `profile-menu.tsx` | 0 | **UNUSED-DEAD** |
| `section-header.tsx` | 0 | **UNUSED-DEAD** — superseded by `light/light-section-header.tsx` |
| `segmented-control.tsx` | 0 | **UNUSED-DEAD** — superseded by `light/light-segmented-control.tsx` |
| `star-rating.tsx` | `components/rate-session-sheet.tsx` (used live by `(client)/book-session.tsx` and `(client)/sessions.tsx`) | **STILL LIVE** — deliberately, per `sessions.tsx`'s own header comment (`:11-14`): "the rate-session bottom sheet stays the existing dark `RateSessionSheet` (a floating overlay surface, not page background — same precedent as reusing the dark `CelebrationOverlay` inside otherwise-light screens elsewhere)." This is a documented, intentional design choice (a dark modal overlay on top of light pages), not an oversight. |
| `stat-card.tsx` | 0 | **UNUSED-DEAD** — superseded by `light/light-stat-card.tsx` |
| `states.tsx` | `components/screen-scaffold.tsx` (used only by `plans.tsx`) | **STILL LIVE**, same single-screen scope as `glass-card.tsx` above |
| `text-field.tsx` | 0 | **UNUSED-DEAD** — superseded by `light/light-text-field.tsx` |

**Also checked, same tree, same verdict pattern:**
- `src/components/screen-scaffold.tsx` (dark `ScreenScaffold`/`EmptyState`/`ErrorState`/`LoadingState`, sibling to `ui/`, not inside it) — real importer: **only** `src/app/(client)/plans.tsx:12` (its `EnrolledPlansScreen` branch, `:148-179`). Superseded everywhere else by `light/light-screen-scaffold.tsx` (67 real importers across the app).
- `src/components/tappable.tsx` (dark `TextLink`) — real importer: **only** `src/app/(client)/plans.tsx:13`. Superseded everywhere else by `light/light-tappable.tsx`.

### The one confirmed remaining pocket of dark-theme UI: `(client)/plans.tsx`

`src/app/(client)/plans.tsx` is a dual-branch screen (its own header comment, `:1-6`, documents this as deliberate): `PrePurchasePlansScreen` (`:54-122`) is fully migrated to `LightScreenScaffold`/`LightCard`/`LightPrimaryButton`/`LightSegmentedControl`/`LightEmptyState` etc. `EnrolledPlansScreen` (`:124-181`) — rendered whenever `getLatestSubscription()` returns non-null (`:183-186`, i.e. **every client who has ever purchased anything**, including the renewal-purchase flow reached via the `SessionsLowGateModal`'s "Renew Now" CTA or the sessions-remaining-≤5 renewal exception) — still uses the fully dark `ScreenScaffold`/`GlassCard`/`PrimaryButton`/`TextLink` stack.

- **Status: DUPLICATED-CONFLICTING.** This is a genuine, live theme inconsistency, not dead code: any already-subscribed client who taps through to Plans (to renew) sees a jarring dark-themed screen sandwiched between an otherwise fully light-themed app shell (the tab bar, the More sheet, and every other screen they'd have just come from are all `Light*`). It is exactly the kind of "not yet migrated" pocket the task description anticipated.

### Overall verdict

`src/components/ui/*` is **13 of 17 files fully dead** (0 real importers anywhere): `auth-shell`, `avatar`, `badge`, `bottom-sheet`, `chat-thread`, `chip`, `chip-grid`, `floating-tab-bar`, `menu-row`, `profile-menu`, `section-header`, `segmented-control`, `stat-card`, `text-field` (14, not 13 — recount: auth-shell, avatar, badge, bottom-sheet, chat-thread, chip, chip-grid, floating-tab-bar, menu-row, profile-menu, section-header, segmented-control, stat-card, text-field = **14 of 17 dead**). The remaining 3 (`button.tsx`, `glass-card.tsx`, `star-rating.tsx`) plus 2 siblings outside `ui/` proper (`screen-scaffold.tsx`, `tappable.tsx`) are still live, but for exactly two reasons: (1) `star-rating.tsx` via `rate-session-sheet.tsx`/`celebration-overlay.tsx` is an **intentional, documented** dark-modal-on-light-page pattern used consistently app-wide, not a migration gap; (2) `button.tsx`'s `PrimaryButton`, `glass-card.tsx`, `screen-scaffold.tsx`, and `tappable.tsx` are an **unintentional** leftover — the single un-migrated `EnrolledPlansScreen` branch in `plans.tsx`. `button.tsx`'s `IconButton` sub-export is also used once in a small, theme-neutral way in `(client)/index.tsx`.

`src/components/light/*` (21 files) is the live, canonical design system for the entire app — confirmed by 67 real importers of `light-screen-scaffold.tsx` alone, plus all 4 tab-bar layouts, all 5 auth screens, and every other screen file checked. This corroborates the git history pattern ("Rebuild ... in the light theme" commits) and subsystem 4's `chat-thread.tsx` finding — `ui/*` was a superseded first-generation dark theme, migration is essentially complete except for the one documented screen branch above.

---

## Part B: Session Persistence / Logout / Deep-Link Behavior

- **Session storage**: `src/lib/supabase/large-secure-store.ts` — Supabase's documented Expo pattern: session blob AES-encrypted, only the (small) AES key goes into `expo-secure-store` (Keychain/Keystore); `AsyncStorage` holds only ciphertext. On web, falls back to plain `AsyncStorage` (documented as unavoidable — `expo-secure-store`'s web module is a stub). SSR-safe (`typeof window === 'undefined'` guards on every method, `:69,78,89`) — documented as fixing a real observed crash (`GoTrueClient` calling `_recoverAndRefresh()` at module-load time under Next-style static export). **Status: WORKING CORRECTLY.**
- **Deep-link / auth-callback parsing**: `src/lib/auth/auth-context.tsx` exports `parseAuthCallback`/`parseRecoveryLink`, both covered by a dedicated regression suite (`src/lib/auth/__tests__/auth-callback-parsing.test.ts`, 9 test cases) — covers hash-fragment vs query-string token extraction, PKCE `?code=` fallback, hash-over-query precedence, URL-decoding, malformed-percent-encoding non-crash, and (critically) that an OAuth token pair is never mistaken for a password-recovery session (`type` must explicitly equal `'recovery'`). **Status: WORKING CORRECTLY.**
- **Role-mismatch re-login**: every route group's `_layout.tsx` re-checks `profile.role` against the group and redirects via `getHomeRouteForRole` if mismatched (see Part B navigation section) — this runs on every mount, so switching accounts (logout → login as a different role) is safely handled without stale routing.
- **Logout**: `unsupported-role.tsx:34-40` and (traced via `useAuth()`) each role's More sheet exposes `signOut()` from `AuthProvider`; not independently re-traced end-to-end in this pass since it's a thin passthrough to `supabase.auth.signOut()` — no anomalies found in adjacent code.

---

## Part B: Security Findings (client-side privileged operations, anon-key misuse)

- **Anon key usage**: `src/lib/supabase/client.ts:15-37` — uses `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` exclusively, both correctly namespaced `EXPO_PUBLIC_*` (i.e., known-and-intended to ship in the client bundle) and documented as "safe to ship... it's the public, RLS-constrained key" (`:6-9`). Falls back to a syntactically-valid placeholder URL/key if env vars are missing rather than crashing (`:26-30`) — a developer-experience choice, not a security issue (the placeholder domain is non-functional).
- **Service-role key**: grepped `SERVICE_ROLE|service_role` across all of `src/` — **zero matches**. All service-role usage is correctly confined to `supabase/functions/*` (Deno edge functions, server-side only): `admin-provisioning`, `coach-change-actions`, `subscription-lifecycle`, `razorpay`, `razorpay-webhook`, `send-push`. Every edge function reviewed (`admin-provisioning/index.ts`, `coach-change-actions/index.ts`, `subscription-lifecycle/index.ts`) re-verifies the caller's own JWT/role via the anon-key client **before** switching to a service-role client for the privileged write — no function trusts a client-supplied role/id field for authorization.
- **No CRITICAL findings.** No privileged operation (payment verification, subscription activation, role assignment, coach-change completion) is performed client-side with the anon key alone; every one of those correctly routes through either an RLS-permitted admin-only table write (verified via each file's own RLS-policy citations, e.g. `admin-escalations.ts:5-7`, `admin-clients.ts:6-7`) or a service-role edge function.
- **Minor observation, not a vulnerability**: `src/lib/data/admin-escalations.ts:9-10`'s header comment claims the call-gate is enforced "client-side here... AND by a DB trigger" but the actual function bodies (`:121-169`) contain no client-side pre-check — enforcement is DB-trigger-only in the code as written. Not a security gap (the DB trigger is the real boundary and is present and correct — see A2), just a doc/code mismatch worth flagging for anyone reading the comment as a guarantee of a friendlier client-side error message.

---

## Part B: Dead Code / TODO Sweep

- **`TODO`/`FIXME`/`XXX`**: grepped all of `src/**/*.ts(x)` (excluding `__tests__`) — **zero matches**. No stray TODO/FIXME markers anywhere in the app source.
- **"not implemented" / "coming soon" markers** (grepped case-insensitive): all 4 hits are deliberate, documented UI-facing gap markers, not accidental dead ends:
  - `src/app/(client)/coach.tsx:229` — "Live support chat isn't available yet — coming soon. To raise an issue today, use My Concerns from More." (correctly redirects to a real, working alternative)
  - `src/app/(client)/index.tsx:188` — "Coming soon" badge (diet/workout-plan feature, correctly gapped per web spec §11 — no such feature exists on web either)
  - `src/app/(client)/progress.tsx:169` — "Progress photos aren't available yet — coming soon." (correctly matches web spec §11's own finding that the `photo_url` column exists but no UI writes it)
- **Confirmed dead files** (see Duplicate UI System table above for the full list): 14 of 17 `ui/*` components, plus `ui/floating-tab-bar.tsx` (tab bar section). All are genuinely zero-importer, not just low-traffic.
- **No commented-out code blocks** of meaningful size were found during the files read in this pass (spot-checked all files quoted above).

---

## Gaps vs Web Reference

1. **Coach session notes never surface to the client** (A1) — full feature gap, not partial. Web spec §11/§22 treats "Coach notes" as a core, always-expected read-only artifact on both Sessions and Progress; mobile has no fetch or render path for it anywhere.
2. **Shadow-coach client banner never renders** (A5) — the backend/admin machinery is arguably more complete than the web app's own documented behavior (full scoring algorithm, cascade-on-cascading-leave), but the one client-facing payoff (the "Covering for X" banner + acknowledgeable notice on `/sessions`, web spec §10/§25) does not exist in the client app at all.
3. **Coach-change-request completion leaves stale `upcoming` bookings with the old coach** (A3) — both the client self-serve edge function and the admin approve-with-coach path omit the booking-cancellation step web spec §12.4 requires, even though the codebase's own `transferClientCoach` (a different, admin-manual tool) does it correctly.
4. **Staff renewal-opportunity threshold matches the client's own threshold (5) instead of the wider staff-only 10** (A6) — a real, if low-severity, intent deviation from web spec §9.
5. **Session-reminder cron is completely absent** (A9) — definitively confirmed, not merely unconfirmed; no partial implementation exists to build on.
6. **One un-migrated dark-theme screen branch remains**: `(client)/plans.tsx`'s `EnrolledPlansScreen`, reachable by every previously-subscribed client (Part B Duplicate UI System section) — not a web-parity gap per se (web has no "theme" concept to violate), but a genuine internal-consistency defect worth fixing before ship.
7. **`ui/*` legacy component tree is ~82% dead** (14/17 files) — safe to delete outright except the 3 (`button.tsx`, `glass-card.tsx`, `star-rating.tsx`) plus `screen-scaffold.tsx`/`tappable.tsx` still wired into the one live dark branch above; once #6 is fixed, all of `ui/*` plus `screen-scaffold.tsx`/`tappable.tsx` become deletable except `star-rating.tsx` (intentionally kept for the dark-modal-overlay pattern shared with `celebration-overlay.tsx`).

---

## Matrix Rows

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Root Cause | Frontend | Backend/API | Database | Dependencies | Severity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ADM-001 | Coach session workflow | Attendance marking | present/late/absent → booking status | `src/lib/data/coach-portal.ts:207-240`, `src/app/(coach)/session/[id].tsx` | Correctly upserts `attendance`, flips `bookings.status` to `missed` on absent | Same as web §10 | WORKING CORRECTLY | — | Coach app | Direct Supabase writes | `attendance`, `bookings` | — | Info |
| ADM-002 | Coach session workflow | Session notes → completion | `submitSessionNotes()` sets `bookings.status='completed'` | `src/lib/data/coach-portal.ts:247-273` | Correct; client cannot self-complete | Same as web §10 | WORKING CORRECTLY | — | Coach app | Direct Supabase writes | `workout_notes`, `bookings` | — | Info |
| ADM-003 | Client session view | "Coach notes" display | Client sees coach's session write-up | `src/app/(client)/sessions.tsx`, `src/app/(client)/progress.tsx`, `src/lib/data/bookings.ts`, `src/lib/data/progress.ts` | `workout_notes` never queried by any client-facing file; `Booking` type has no notes field | Read-only "Coach notes" shown on Sessions + Progress (web §11/§22) | NOT IMPLEMENTED | Feature never built on client side despite coach side writing the data | Client app | — (missing) | `workout_notes` (unread) | ADM-001/002 | High |
| ADM-004 | Admin escalations | Call-gate before resolution | DB trigger blocks status/note mutation until `called_client_at` set | `supabase/migrations/20260907120000_escalation_call_gate_trigger.sql`, `src/lib/data/admin-escalations.ts` | DB trigger correctly enforces; client-side pre-check claimed in comments but not present in code | Must-call-before-resolve gate (web §16) | WORKING CORRECTLY | Doc/code comment slightly overstates client-side enforcement (cosmetic only) | Admin app | Postgres trigger | `escalations`, `escalation_notes` | — | Info |
| ADM-005 | Coach-change | Request lifecycle (pending/reject/approve) | Reject + approve-blank + approve-with-coach | `src/lib/data/admin-coach-change.ts:43-168` | Correct notifications, correct recurring-slot repoint | web §12 | WORKING CORRECTLY | — | Admin app | Direct Supabase writes | `coach_change_requests`, `recurring_slots`, `conversations` | — | Info |
| ADM-006 | Coach-change | Old-coach booking cleanup on completion | Client-self-serve + admin approve-with-coach paths | `src/lib/data/coach-change.ts:67-78`, `supabase/functions/coach-change-actions/index.ts:94-124`, `src/lib/data/admin-coach-change.ts:100-148` | Neither path cancels the old coach's still-`upcoming` bookings | "cancels their still-upcoming bookings" (web §12.4) | IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW | Booking-cancellation step omitted in 2 of 3 coach-transfer code paths (present in the 3rd, `transferClientCoach`) | Client + Admin app | Edge function + direct writes | `bookings` (orphaned rows) | — | Medium |
| ADM-007 | Admin provisioning | Role assignment on account creation | `app_metadata.role`, never client-declarable | `supabase/functions/admin-provisioning/index.ts:47-186` | Correct — caller-JWT-verified admin, role set via service-role `app_metadata` | web §4.2/§26 "role never client-settable" | WORKING CORRECTLY | — | Admin app | Edge function (service-role) | `profiles` (via `handle_new_user()`) | — | Info |
| ADM-008 | Shadow coaching | Assignment + reassignment mechanics | Scoring, cascade, RPC repoint of bookings | `src/lib/data/admin-shadow.ts` (606 lines) | Fully correct, verbatim-ported scoring algorithm, cascades correctly on chained leave | web §10 backend mechanics | WORKING CORRECTLY | — | Admin app | Direct Supabase writes + RPC | `shadow_coach_assignments`, `bookings` | — | Info |
| ADM-009 | Shadow coaching | Client-visible "Covering for X" banner | One-time acknowledgeable notice on Sessions | `src/app/(client)/sessions.tsx` (full file, no shadow reference) | No banner, no badge, no acknowledgment UI anywhere in client app | Banner + one-time ack on `/client/sessions` (web §10/§25) | NOT IMPLEMENTED | Client-side rendering never built despite complete backend | Client app | — (missing) | `shadow_coach_assignments` (unread by client) | ADM-008 | Medium |
| ADM-010 | Leave management | Coach leave → client schedule impact | Cascade reassigns bookings; client gets generic notification only | `src/lib/data/admin-leave.ts:56-89`, `admin-shadow.ts:474-494` | Reassignment + `coach_on_leave_client` notification work; no in-session visual continuity | Same effect as ADM-008/009 | PARTIALLY IMPLEMENTED | Same root cause as ADM-009 | Client + Admin app | Direct Supabase writes | `coach_leave`, `bookings` | ADM-009 | Low |
| ADM-011 | Renewal opportunities | Staff-side early-warning threshold | Admin + coach renewal lists | `src/lib/data/admin-renewals.ts:11`, `src/lib/data/coach-renewals.ts:20` | Both hardcode `SESSIONS_LOW_THRESHOLD=5`, same as client's own gate | Wider staff threshold of 10 (web §9, `RENEWAL_OPPORTUNITY_THRESHOLD`) | IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW | Mobile PRD used a different constant than the web reference | Admin + Coach app | — | `subscriptions`, `bookings`, `recurring_slots` | — | Low |
| ADM-012 | Notifications infra | Session reminder ~6h before session | Time-triggered email to client+coach | N/A — searched entire `supabase/functions/`, all migrations, all of `src/` | No cron/scheduled function, no `reminder_sent_at` column, no config anywhere | `/api/cron/session-reminders` equivalent (web §10/§15/§33) | NOT IMPLEMENTED | Feature never built; confirms prior partial audit's flag definitively | — | — (missing) | — (missing) | — | High |
| ADM-013 | Admin session/client ops | Cancel/reschedule/pause/resume/transfer/adjust-sessions | Various client-visible subscription/session mutations | `src/lib/data/admin-clients.ts`, `admin-sessions.ts` | All correctly notify affected client/coach, admin bypasses cutoffs correctly | web §9/§10/§17 (admin overrides) | WORKING CORRECTLY | — | Admin app | Direct Supabase writes + RPC | `subscriptions`, `bookings` | — | Info |
| NAV-001 | Role routing | Session→home-route dispatch | `getHomeRouteForRole()` single source of truth | `src/lib/auth/role-routing.ts:12-22`, all 5 group `_layout.tsx` files | Correct, unit-tested (4 branches incl. undefined) | Standard client/coach/admin/unsupported routing | WORKING CORRECTLY | — | Full app | — | — | — | Info |
| NAV-002 | Role routing | Unrecognized-role fallback | `unsupported-role.tsx` | `src/app/unsupported-role.tsx` | Safe non-crashing screen + sign-out; uses legacy dark theme (cosmetic mismatch only) | Defensive fallback | WORKING CORRECTLY | Minor: dark `Brand` theme instead of `LightBrand` | Full app | — | — | — | Info |
| NAV-003 | Tab bar | Which implementation is live | `LightTabBar` vs `FloatingTabBar` | `src/components/light/light-tab-bar.tsx` (4 real importers) vs `src/components/ui/floating-tab-bar.tsx` (0) | `FloatingTabBar` has zero live importers anywhere | One canonical tab bar | UNUSED-DEAD | Superseded by `LightTabBar`, per `(coach)/_layout.tsx:4-5`'s own comment | — | — | — | — | Low (cleanup) |
| NAV-004 | Duplicate UI system | `ui/*` component tree overall | 17 files audited individually | `src/components/ui/*` | 14/17 fully dead (0 importers); 3/17 (`button.tsx`, `glass-card.tsx`, `star-rating.tsx`) still live via narrow usages | Full migration to `light/*` (per git history "Rebuild ... in the light theme") | UNUSED-DEAD (14/17), DUPLICATED-CONFLICTING (3/17, see NAV-005/NAV-006) | Incomplete final cleanup pass after light-theme migration | — | — | — | — | Low (cleanup), except NAV-005 |
| NAV-005 | Duplicate UI system | `(client)/plans.tsx` `EnrolledPlansScreen` branch | Dark `ScreenScaffold`/`GlassCard`/`PrimaryButton`/`TextLink` stack, live for every subscribed client | `src/app/(client)/plans.tsx:124-181`, `src/components/screen-scaffold.tsx`, `src/components/tappable.tsx`, `src/components/ui/glass-card.tsx`, `src/components/ui/button.tsx` | Renders full dark theme, jarring vs. the rest of the now-light app, reached via the renewal purchase flow | Should be migrated to `LightScreenScaffold`/`LightCard`/`LightPrimaryButton`/`LightTextLink` like `PrePurchasePlansScreen` in the same file | DUPLICATED-CONFLICTING | Un-migrated screen branch left behind after the light-theme rebuild | Client app | — | — | Reached via `SessionsLowGateModal` "Renew Now" / renewal-exception purchase | Medium |
| NAV-006 | Duplicate UI system | `star-rating.tsx` + dark modal overlays | `RateSessionSheet`/`CelebrationOverlay` intentionally stay dark | `src/components/ui/star-rating.tsx`, `src/components/rate-session-sheet.tsx`, `src/components/celebration-overlay.tsx` | Dark floating overlay on top of light pages, by design (documented in `sessions.tsx:11-14`) | Intentional exception, not a defect | WORKING CORRECTLY (intentional exception) | — | Client app | — | — | — | Info |
| NAV-007 | Gate composition | `GlobalGates` precedence/mounting | Phone → Measurement → Sessions-low, mounted once outside `Tabs` | `src/components/gates/global-gates.tsx` | Correct precedence, correct single-active-at-a-time, correct fail-open on fetch error | web §4.7/§4.9 precedence order | WORKING CORRECTLY | — | Client app | — | — | — | Info |
| NAV-008 | Session persistence | Encrypted token storage | AES + SecureStore-wrapped-key pattern | `src/lib/supabase/large-secure-store.ts` | Correct, SSR-safe, matches Supabase's documented Expo pattern | Keychain/Keystore-backed session storage (PRD §26) | WORKING CORRECTLY | — | Full app | — | — | — | Info |
| NAV-009 | Deep linking | Auth callback / recovery link parsing | `parseAuthCallback`/`parseRecoveryLink` | `src/lib/auth/auth-context.tsx`, tested by `auth-callback-parsing.test.ts` (9 cases) | Correct; OAuth token pair never mistaken for recovery session | Correct deep-link routing for OAuth + password recovery | WORKING CORRECTLY | — | Full app | — | — | — | Info |
| NAV-010 | Security | Anon key / service-role separation | `src/lib/supabase/client.ts` vs `supabase/functions/*` | `src/lib/supabase/client.ts:15-37`; grep confirms zero `SERVICE_ROLE` references in `src/` | Correct — anon key only in client bundle, service-role confined to edge functions, each verifying caller JWT/role first | No privileged secrets in mobile bundle | WORKING CORRECTLY | — | Full app | Edge functions | — | — | Info (no CRITICAL findings) |
| NAV-011 | Dead code sweep | TODO/FIXME/XXX markers | Whole `src/` tree | — | Zero matches | — | WORKING CORRECTLY (clean) | — | — | — | — | — | Info |
| NAV-012 | Dead code sweep | "Not implemented"/"coming soon" markers | 4 hits, all deliberate | `(client)/coach.tsx:229`, `(client)/index.tsx:188`, `(client)/progress.tsx:169` | All correctly gap already-known web-spec absences (chat, diet, progress photos) | — | WORKING CORRECTLY (honest gap markers) | — | Client app | — | — | — | Info |
