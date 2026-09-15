# LEANR Mobile APP — Complete Client Portal Reverse-Engineering & Functionality Audit
### Engineering Source of Truth for comparing the mobile APP (`leanr-mobile-app`) against the WEB app's documented behavior

**Revision note**: this is the second, corrected pass of this synthesis. The first pass (written 2026-09-13) was produced before three of the five background subsystem audits (Sessions/Booking, Subscription/Payments, Admin/Nav) finished a deeper retry after an earlier interruption — those three source files were silently overwritten on disk with substantially more thorough content (13→36 rows, 10→32 rows, 16→25 rows respectively) after the first synthesis was already written. This revision re-reads all five source files in full and reflects the current, complete content. Auth/Journey/Profile (20 rows) and Chat/Concerns/Notifications/Progress (11 rows) were unchanged between passes.

**Purpose of this document**: This is the master synthesis of a full, independent reverse-engineering audit of the mobile APP's client-facing portal (plus the admin/coach functionality the client portal structurally depends on). It is intended to be handed to an AI or engineer working on the WEB application, so they can see exactly where the mobile APP matches, deviates from, improves on, or fails to implement the WEB app's documented business logic.

**Source of truth for "intended" behavior**: `mobile-app-reference/ClientPortal.md` (871 lines) — an independently produced, code-cited reverse-engineering audit of the WEB app's client portal (Next.js + Supabase). Every claim in that document is cited to WEB app source files that do **not** exist in this repository (the WEB app is a separate codebase). This document does not re-litigate that doc's findings — it takes them as given and compares the APP against them. Two of the five subsystem passes also cross-checked findings against this repo's own `LEANR_PT_MOBILE_PRD.md` and `mobile-app-reference/New PRD.md`, which occasionally surfaced APP behavior that contradicts not just the WEB spec but the APP's **own** written PRD — those cases are flagged explicitly below since they are the highest-confidence class of finding (not a web-vs-mobile judgment call, but the APP disagreeing with its own spec).

**Source of truth for "actual" APP behavior**: direct reading of `leanr-mobile-app/src/**`, `leanr-mobile-app/supabase/**` (5 local migrations + 9 edge functions), and git history, performed by five parallel, independent audit passes, each producing a detailed subsystem report with file:line citations. Those five reports are the primary evidence base for this document and remain on disk for deeper reference:

| Subsystem report | Scope | Rows |
|---|---|---|
| `mobile-app-reference/audit/01-auth-journey-profile.md` | Signup/login/OAuth, `ClientJourneyStage` machine, 3 global gates, onboarding, activation, profile | AUTH-001…020 |
| `mobile-app-reference/audit/02-sessions-booking-coach.md` | Session booking, cancel/reschedule/rate, recurring schedule, coach matching, Zoom join | SES-001…036 |
| `mobile-app-reference/audit/03-subscription-payments-plans.md` | Razorpay purchase/verify, activation, pause/resume, renewal, plans, demo booking | SUB-001…032 |
| `mobile-app-reference/audit/04-chat-concerns-notifications-progress.md` | Chat, concerns/escalations, notifications, push, progress/measurements, milestones | COM-001…010 (COM-003 split a/b = 11 findings) |
| `mobile-app-reference/audit/05-admin-coach-crossdeps-navigation.md` | Admin/coach actions the client portal depends on, nav shell, duplicate UI systems, security, dead code | ADM-001…013, NAV-001…012 |

**Total: 124 matrix rows** across all five reports (§26 reproduces every one).

**Method discipline applied throughout**: every finding below is either **Observed** (cited to a file:line in one of the five subsystem reports, ultimately to APP or WEB source), or explicitly marked **UNKNOWN — REQUIRES VERIFICATION**. Nothing here is invented. Where an APP behavior could not be conclusively traced (frequently because the logic lives inside a Postgres RPC whose body is not defined in any local migration — it exists only in the live, shared Supabase project), that is stated plainly. Note one internal tension worth flagging to the reader: subsystem 2's report asserts the session-credit enforcement RPC (`confirm_booking`) is **WORKING CORRECTLY** based on architectural inference (the mobile client never duplicates or pre-computes a credit check, consistent with correct full delegation to the server) — this is a stronger claim than the RPC body itself being read, since that body is still not present in this repo. Treat this as the audit's own best assessment, not a live-database-confirmed fact — see §24.

**Architecture confirmed**: the APP talks to Supabase **directly** (no server-action/API intermediary), using RLS for reads and a set of 9 privileged Supabase Edge Functions (`razorpay`, `razorpay-webhook`, `subscription-lifecycle`, `coach-change-actions`, `zoom-meeting`, `phone-otp`, `create-assessment-booking`, `admin-provisioning`, `send-push`) for writes that need a service-role trust boundary. This is exactly the architecture `ClientPortal.md` §23 predicted a mobile rebuild would need. Security review (subsystem 5, Part B) found **no service-role key or secret anywhere in the client bundle** — confirmed by grep (`SERVICE_ROLE` has zero hits in `src/`), and every edge function independently re-verifies the caller's JWT/role before performing a privileged write, not just trusting a client-supplied id. This is a genuinely positive, well-executed security posture.

---

## 1. Executive Summary

The mobile APP is a substantial, largely faithful reproduction of the WEB app's client portal — the `ClientJourneyStage` state machine (the single most load-bearing piece of business logic per `ClientPortal.md` §4) is a **line-for-line correct port**, the payment trust boundary (Razorpay signature verification) is **correctly server-side-only** with the key secret never reaching the client bundle, the client bundle carries **no service-role secrets anywhere**, and several individual mechanisms (the escalation call-gate DB trigger, the recurring-schedule shortfall warning, the Zoom join participant check, the `mark_missed_bookings` permission-fix migration) are **more robust than what `ClientPortal.md` documents for the WEB app** — genuine improvements, not just parity.

However, the following findings materially change what should be told to the WEB-side AI, ranked by severity:

1. **CRITICAL — `progress.tsx` hard-gates measurement logging behind an active subscription** (COM-001). `ClientPortal.md` §6 states progress logging must work pre-purchase because it is *the* prerequisite for booking a free demo. On the APP, a brand-new prospect who has never logged a measurement cannot log one and therefore cannot pass the measurement-freshness check that blocks demo booking — **a new prospect can purchase a paid plan directly but cannot ever complete the free-demo funnel.** Self-inflicted, no WEB equivalent.
2. **HIGH — Coach-authored session notes never reach the client, at all** (ADM-003). This is a full, confirmed-absent feature, not a partial one: `workout_notes` is never queried by any client-facing file, and the `Booking` type has no notes field. Web treats "Coach notes" as a core, always-expected read-only artifact on both Sessions and Progress.
3. **HIGH, upgraded from "gap" to a confirmed cross-cutting defect — Coach-change completion never cancels the client's still-upcoming bookings with the old coach**, in **both** the client self-serve path and the admin approve-with-coach path (SES-030, ADM-006). Notably, the codebase's own separate `transferClientCoach` admin tool *does* do this correctly — proving the team knows how, but the two coach-*change-request* completion code paths were built without it. Old and new coach both keep stale/duplicate sessions.
4. **HIGH — "Book a Session" remains fully reachable and functional for already-subscribed clients, and this contradicts not only the WEB spec but the APP's own PRD documents** (SES-004). `LEANR_PT_MOBILE_PRD.md` and `New PRD.md` both independently state this screen should be hidden/redirect once subscribed; it isn't — a subscribed client can book real, paid ad-hoc regular sessions entirely outside the recurring-schedule mechanism.
5. **HIGH — Shadow-coach coverage is fully built on the backend (admin) side but has zero client-facing UI** (SES-019, ADM-009). The scoring/cascade algorithm is a thorough, verbatim port of the web spec; the client "Covering for {coach}" banner the whole feature exists to produce does not exist anywhere in the client app.
6. **HIGH — Chat conversations are never auto-created on ordinary schedule setup** (COM-002). The only code path in the entire repo that creates a `conversations` row is the coach-change-completion edge function; a first-time or renewal client gets no conversation at all until an admin manually intervenes.
7. **HIGH — No session-reminder mechanism exists at all** (ADM-012, confirmed by exhaustive grep — no cron, no scheduled function, no `reminder_sent_at` column anywhere), and **no notification fires when a client books a regular or demo session** (COM-003a).
8. **HIGH — Razorpay webhook reconciliation is code-complete but not deployed/configured** (SUB-007), and, self-documented in this repo's own `README.md`, **the live Razorpay keys currently configured have never been exercised end-to-end** (SUB-029) — a real, present-tense operational risk given real money is in play.
9. **HIGH — Renewal's atomic old-subscription-retirement is not actually transactional and its error is silently swallowed** (SUB-011) — a crash between the two sequential updates could leave a client with two simultaneously `active` subscriptions with no surfaced error. This directly contradicts `ClientPortal.md` §26.C's explicit "MUST NOT CHANGE" rule for this exact mechanic.

Beyond these, a recurring architectural pattern appears across multiple independent subsystems: **the reschedule weekly cap, the reschedule same-day conflict check, the session-rating weekly cap, and the progress-log weekly cap are enforced only in client-side TypeScript**, with no RPC/trigger backstop — bypassable by any caller that talks to Supabase without going through this app's own pre-checks. The team has already solved this exact class of problem correctly elsewhere (the escalation call-gate DB trigger, whose own migration comment explicitly names the risk of "mobile writes directly to Supabase with no trusted server layer in front of it"), so the unguarded rate limits read as inconsistency, not a blind spot.

Two genuinely new, well-built capabilities exist with no WEB precedent and are worth evaluating as candidates to port back: a full working forgot-password/reset-password flow (AUTH-013), and a complete push-notification pipeline that automatically mirrors every in-app notification trigger via a DB trigger (COM-010).

One clear, high-confidence finding of the credit-enforcement question from the earlier synthesis pass has now been **resolved, with a caveat**: subsystem 2's deeper pass concludes the session-count enforcement is correctly and entirely delegated to the server-side `confirm_booking` RPC, with no client-side duplication or pre-check anywhere — a correct architecture. This is a confidence upgrade from "unknown" but is still not the same as reading the RPC body itself (not present in this repo); treat as high-confidence, not certainty (§24).

Test coverage remains thin relative to the stakes: the entire journey-stage state machine, all three gates, and every file in `subscription.ts`/`payments.ts`/`plans.ts` (the highest financial-risk code in the app) have zero automated tests.

---

## 2. Complete Client Portal Functionality Inventory

Aggregated from all five subsystem reports (each carries its own detailed per-function inventory table with preconditions/dependencies/status — see those files for full detail). At a high level:

**Authentication & Account** (Fork 1 — 21 functions, 20 matrix rows): manual signup, Google OAuth, email OTP, phone OTP (real MSG91), forgot/reset password (net-new), unified login, role routing, session persistence/logout, role-escalation protection.

**Journey State & Gates** (Fork 1): the `ClientJourneyStage` machine, global gates orchestrator, phone/measurement/sessions-low gates, coach-side pending-tasks gate (not client-facing), onboarding, plan activation, profile view/edit/password/photo.

**Sessions, Booking, Schedule, Coach** (Fork 2 — 17 functions, 36 matrix rows): booking lists + missed-sweep, cancel, reschedule (3 modes), rate session, ad-hoc booking wizard, recurring schedule setup/change/renewal-carryover, coach matching (utilization-ranked + simplified preference pass), My Coach + coach-change request lifecycle, Zoom join, demo booking (authenticated + anonymous), coach-profile field completeness.

**Subscription, Payments, Plans** (Fork 3 — ~25 functions, 32 matrix rows): plan listing (marketing + 2 logged-in variants), native-SDK Razorpay purchase, signature verification, renewal-exception purchase gate (TOCTOU-safe, 3 enforcement points), webhook reconciliation (inert), payment history (unfiltered by status — a display gap), activation, renewal old-subscription retirement (non-atomic — a real gap), pause/resume, subscription display, demo booking (2 variants, both correctly bypass payment), renewal check-in/scheduling, admin-only audit-log "refund request" (no money movement), 3 relevant migrations.

**Communication, Notifications, Progress** (Fork 4 — 14 functions, 11 matrix rows): real-time chat, image attachments, read receipts, closed/past conversations, concerns/escalations (DB-enforced call-gate), in-app notifications + tap-routing, push registration + DB-trigger-driven send, progress/measurement logging (weekly cap, and the critical purchase-gate defect), milestones/streak (mobile-only).

**Admin/Coach dependencies surfaced to (or missing from) the client** (Fork 5, Part A — 13 matrix rows): attendance marking → booking completion, session-notes written but **never surfaced to the client**, coach-change approval/rejection/completion (with the booking-cleanup gap), escalation resolution (DB-enforced), shadow-coach assignment (fully built backend, **zero client UI**), leave-cascade, account provisioning (role-safe), renewal-opportunity thresholds (narrower than WEB intends), session-reminder cron (confirmed absent), various admin client/session ops (all correct).

**App shell / cross-cutting** (Fork 5, Part B — 12 matrix rows): root layout & role routing (tested, safe fallback), 2 tab-bar implementations (1 live, 1 fully dead), a 14-of-17-dead `ui/*` component tree with exactly one live, jarring dark-theme screen branch remaining (`EnrolledPlansScreen`), an intentional dark-modal-overlay design pattern (rating sheet/celebration overlay — not a bug), encrypted session storage, tested deep-link parsing, a clean security review (no service-role leakage, no TODO/FIXME markers, only 3 deliberate "coming soon" placeholders), and a 7-file test suite covering a small fraction of the app's logic.

---

## 3. Client Portal Architecture

```
Expo Router app (leanr-mobile-app), 5 route groups: (marketing) (auth) (client) (coach) (admin)
  │
  ├─ src/app/<group>/_layout.tsx   — role/session gate: !session → Redirect '/welcome';
  │                                   profile.role !== expected → Redirect to
  │                                   getHomeRouteForRole(profile.role) [role-routing.ts, unit-tested]
  │     │
  │     └─ src/app/<group>/*.tsx   — screens; call src/lib/data/*.ts functions directly (no server-
  │             │                     action layer — this app talks to Supabase directly, unlike WEB)
  │             │
  │             └─ src/lib/data/*.ts  — thin wrappers around supabase.from()/.rpc()/.functions.invoke();
  │                     │               most THROW raw Postgrest errors; src/lib/data/use-async.ts is the
  │                     │               app-wide hook that catches these for screens that use it — not a
  │                     │               universal non-throwing boundary the way WEB's runAction()/
  │                     │               ActionResult<T> is.
  │                     │
  │                     ├─ Supabase Postgres — RLS-scoped reads; RPCs (create_temporary_booking,
  │                     │    confirm_booking, cancel_booking, reschedule_booking,
  │                     │    generate_bookings_from_recurring_slot, mark_missed_bookings,
  │                     │    assign_shadow_coach, ...) whose BODIES ARE NOT DEFINED IN ANY LOCAL
  │                     │    MIGRATION — they exist only in the live, shared Supabase project. This
  │                     │    remains this audit's central limitation: several high-stakes rules
  │                     │    (credit enforcement, cutoff re-derivation) could only be verified by
  │                     │    their CALLERS' behavior, not the RPC body itself.
  │                     │
  │                     └─ 9 Supabase Edge Functions (service-role, privileged writes):
  │                          razorpay, razorpay-webhook, subscription-lifecycle, coach-change-actions,
  │                          zoom-meeting, phone-otp, create-assessment-booking, admin-provisioning,
  │                          send-push — each independently re-verifies caller ownership rather than
  │                          trusting RLS alone; confirmed zero service-role secrets in the client
  │                          bundle (grep-verified).
  │
  ├─ 5 local Postgres migrations (this repo only): client_onboarding unique constraint,
  │    mark_missed_bookings permission fix (a genuine bug fix — an unrelated overdue booking
  │    anywhere in the table could previously break booking confirmation for ALL clients),
  │    escalation call-gate triggers (2), push-token send-trigger, role-sync-on-metadata-update.
  │
  ├─ Razorpay React Native SDK (native modal via `react-native-razorpay`, NOT a WebView — requires a
  │    dev build, not Expo Go) — live keys configured, self-documented as never end-to-end tested.
  ├─ Zoom Server-to-Server OAuth (lazy meeting creation via zoom-meeting edge function)
  ├─ Expo push notifications (via send-push edge function, DB-trigger-fired on every notifications INSERT)
  └─ MSG91 (phone OTP, real implementation — WEB's own MSG91 account is documented as KYC-pending)
```

**Two parallel UI/theme systems coexist, but the migration is nearly complete**: `src/components/light/*` (21 files) is the canonical, live design system — confirmed by 67 real importers of `light-screen-scaffold.tsx` alone, all 4 tab-bar layouts, all 5 auth screens. `src/components/ui/*` (17 files) is **14/17 fully dead** (zero importers, safe to delete: `auth-shell`, `avatar`, `badge`, `bottom-sheet`, `chat-thread`, `chip`, `chip-grid`, `floating-tab-bar`, `menu-row`, `profile-menu`, `section-header`, `segmented-control`, `stat-card`, `text-field`). The remaining 3 (`button.tsx`, `glass-card.tsx`, `star-rating.tsx`) plus 2 siblings (`screen-scaffold.tsx`, `tappable.tsx`) are still live for two distinct reasons: (a) an **intentional** dark-modal-overlay pattern shared by the rating sheet and celebration overlay — documented, not a bug; (b) **one confirmed, un-migrated screen branch**, `(client)/plans.tsx`'s `EnrolledPlansScreen` — reachable by every client who has ever purchased anything, including via the renewal "Renew Now" path — which still renders the full legacy dark theme, a jarring inconsistency sandwiched inside an otherwise fully light-themed app (NAV-005).

---

## 4. Complete User Lifecycle

The APP reproduces the WEB app's two-layered lifecycle model **exactly** in structure. `ClientJourneyStage` (`src/lib/data/journey.ts:68-100`) is confirmed line-for-line faithful to `ClientPortal.md` §4.0's 9-state, first-match-wins evaluation order. **Status: WORKING CORRECTLY.**

**Consumption of the stage differs architecturally but not (mostly) functionally** from WEB: WEB's `/client/dashboard` server component does the hard-redirect; the APP does it inside `EnrolledHomeScreen` (`src/app/(client)/index.tsx:211-232`), a client-side switch, missing a case for `marketing`/`demo_booked`/`demo_completed` (AUTH-010).

**Lifecycle stages observed** (identical set to WEB, confirmed): visitor → registered client → pre-purchase (marketing/demo_booked/demo_completed) → checkout (Razorpay order) → payment (signature-verified fulfillment) → post-purchase (awaiting_activation → onboarding/renewal-checkin → slot_selection/renewal-scheduling → active) → active subscription → paused (reversible) → "expired" (derived label only, no DB value on either app) → renewal (parallel path back through activation, with a real non-atomicity risk at the old-subscription-retirement step — SUB-011). No plan-cancellation function exists on either APP or WEB.

---

## 5. All Discovered User States

### 5.1 `ClientJourneyStage` (9 values, routing-authoritative)
`marketing | demo_booked | demo_completed | awaiting_activation | onboarding | renewal_checkin | renewal_scheduling | slot_selection | active` — see `audit/01-auth-journey-profile.md` for the full evaluation-order trace.

### 5.2 `subscriptions.status` (4 values, confirmed identical to WEB)
`awaiting_activation → active ⇄ paused`, with `inactive` reachable only via the renewal-supersede side effect — confirmed non-transactional and error-unchecked (SUB-011). No `cancelled`/`expired` DB value exists.

### 5.3 `bookings.status` (4 values)
`upcoming → completed` (coach-only, confirmed no client write path) · `upcoming → cancelled` (client via `cancel_booking` RPC, or coach/admin) · `upcoming → missed` (opportunistic `mark_missed_bookings()` sweep, or explicit coach "Absent") · `upcoming → upcoming` (reschedule, same status, fields mutated).

### 5.4 `payments.status` (4 values, confirmed identical to WEB)
`created → paid | failed | paid_unfulfilled` — the `paid_unfulfilled` no-silent-loss/no-auto-refund path is faithfully reproduced. **However**, all 4 raw values (including `created`/`failed`/`paid_unfulfilled`) are directly exposed to the client in the payment-history list with an unmapped, ugly-cased badge — a display gap (SUB-015).

### 5.5 `coach_change_requests.status` (3 values)
`pending → approved | rejected`, sub-branching on `new_coach_id` client-side — correctly rendered in all 4 UI states (SES-029), but **completion never cleans up old bookings** (SES-030/ADM-006).

### 5.6 `escalations.status` (3 values)
`open → in_progress → resolved`, gated by the DB-enforced `called_client_at` trigger — a positive finding, stronger than what `ClientPortal.md` documents for WEB (ADM-004/COM-009).

### 5.7 `conversations.status` (2 values)
`active → closed` (one-way; only writer found is the coach-change-completion edge function — COM-002, the critical gap: nothing else in the repo ever creates a new `active` conversation).

### 5.8 `shadow_coach_assignments.status`, `coach_leave.status`, `recurring_slots.status`
Confirmed to exist and drive backend effects (schedule generation, booking reassignment) — the shadow-assignment backend is described as "arguably over-built relative to what the client UI consumes" (ADM-009), since its client-facing payoff was never built.

---

## 6. Complete Workflow Documentation

Full, detailed, file:line-cited workflow traces for every discovered workflow live in the five subsystem reports' **Workflow Traces** sections. Index of the highest-value ones (consult the linked file for the complete chain):

| Workflow | Full trace location | One-line verdict |
|---|---|---|
| Manual signup → account creation | `audit/01-...md` | WORKING CORRECTLY — role never client-settable |
| Google OAuth signup/login | `audit/01-...md` | WORKING CORRECTLY |
| Forgot/reset password | `audit/01-...md` | New vs. WEB — WORKING CORRECTLY |
| Onboarding (one-time intake) | `audit/01-...md` | WORKING CORRECTLY, one unit-label bug (AUTH-006) |
| Activate Plan | `audit/01-...md` + `audit/03-...md` | Date-floor/one-time-lock WORKING CORRECTLY; **renewal-retirement side effect not atomic** (SUB-011) |
| Profile view/edit | `audit/01-...md` | WORKING CORRECTLY, one password-length inconsistency (AUTH-005) |
| Ad-hoc booking (hold→confirm, regular) | `audit/02-...md` §A | Race-safety WORKING CORRECTLY; credit enforcement now assessed WORKING CORRECTLY (architectural inference, not RPC-body-verified) |
| "Book a Session" reachable post-subscription | `audit/02-...md` Gap #1 | **WORKING BUT INCORRECT — contradicts WEB spec AND the app's own PRD (SES-004, High)** |
| Assessment/demo booking (authenticated) | `audit/02-...md` §B | WORKING CORRECTLY |
| Recurring schedule setup | `audit/02-...md` §C | WORKING CORRECTLY, improvement over WEB (shortfall warning, SES-023) |
| Cancellation | `audit/02-...md` §D | Enforcement WORKING CORRECTLY; UX cutoff-countdown absent (SES-007, Medium) |
| Reschedule (3 modes) | `audit/02-...md` §E | Core WORKING CORRECTLY; weekly cap/same-day check client-JS-only (SES-009/010, matches live RPC scope); client not notified of own reschedule (SES-012, Medium) |
| Coach-change request + completion | `audit/02-...md` §F + `audit/05-...md` A3 | Request lifecycle WORKING CORRECTLY; **completion never cancels old-coach upcoming bookings — BROKEN (SES-030/ADM-006, High)** |
| Zoom join | `audit/02-...md` §G | WORKING CORRECTLY, defensible UX difference (button stays enabled, error on tap — SES-017) |
| Purchase → verify → fulfill | `audit/03-...md` | WORKING CORRECTLY — the app's most safety-critical workflow, done right, all the way to the success screen reading back the DB record |
| Webhook reconciliation | `audit/03-...md` | Code correct, **not deployed/configured** (SUB-007, High); **live keys never end-to-end tested** (SUB-029, High) |
| Activation | `audit/03-...md` | Date-floor + one-time-lock WORKING CORRECTLY; **retirement side effect not atomic** (SUB-011, High) |
| Pause / Resume | `audit/03-...md` | WORKING CORRECTLY; `pause_days_used` never computed (SUB-013, Low) |
| Renewal (full cycle) | `audit/03-...md` | WORKING CORRECTLY except SUB-011; check-in correctly bypasses the weekly rate cap |
| Chat messaging | `audit/04-...md` | WORKING CORRECTLY, DB-enforced |
| Chat conversation creation | `audit/04-...md` | **NOT IMPLEMENTED for the ordinary path (COM-002, High)** |
| Raise a concern | `audit/04-...md` | WORKING CORRECTLY |
| Escalation call-gate | `audit/04-...md` + `audit/05-...md` A2 | WORKING CORRECTLY, exceeds WEB |
| Push notifications | `audit/04-...md` | WORKING CORRECTLY, new capability, well executed |
| Progress/measurement logging | `audit/04-...md` | **BROKEN — breaks the pre-purchase demo funnel (COM-001, CRITICAL)** |
| Attendance → completion (coach-driven) | `audit/05-...md` A1 | WORKING CORRECTLY |
| "Coach notes" reaching the client | `audit/05-...md` A1 | **NOT IMPLEMENTED at all — confirmed absent, not partial (ADM-003, High)** |
| Escalation resolution (admin-driven) | `audit/05-...md` A2 | WORKING CORRECTLY, DB-enforced |
| Shadow-coach assignment (admin) | `audit/05-...md` A5 | Backend WORKING CORRECTLY; **client banner NOT IMPLEMENTED (ADM-009, High)** |
| Leave approval → client schedule impact | `audit/05-...md` A7 | PARTIALLY IMPLEMENTED — reassignment + generic notification work, no in-session visual continuity |
| Session-reminder cron | `audit/05-...md` A9 | **NOT IMPLEMENTED — confirmed definitively absent by exhaustive grep (ADM-012, High)** |
| Account provisioning | `audit/05-...md` A4 | WORKING CORRECTLY, role-safe |

---

## 7. Complete Business Logic

### 7.1 Rules confirmed genuinely server/DB-enforced (robust against a modified or direct-API client)
- Role never client-settable (signup, OAuth, admin provisioning) — AUTH-001/002, ADM-007.
- Payment signature verification, `paid_unfulfilled` failure path, TOCTOU-safe renewal-exception purchase gate (checked identically at create-order, verify-payment, AND the webhook) — SUB-003/005/006/008.
- Activation one-time lock + ≥tomorrow date floor, independently re-derived server-side regardless of client `minDate` — SUB-009.
- Pause only from `active`, resume only from `paused` — SUB-012.
- **Session-credit/count enforcement** — assessed as entirely and correctly delegated to the server-side `confirm_booking` RPC with zero client-side duplication (SES-001) — high confidence, not RPC-body-verified (§24).
- Reschedule/cancel **cutoff-hours** (not the weekly cap or same-day check — see 7.2) — RPC-enforced.
- Measurement-freshness gate (`assertMeasurementsFresh`) — server-independent-of-modal.
- One-active-conversation-per-client, message-send restricted to active-conversation participants — RLS-enforced.
- Escalation call-gate (`called_client_at` must be set before any status/note mutation) — DB trigger, exceeds WEB.
- Onboarding insert-once — app pre-check + DB unique index.
- Zoom join — edge function independently re-verifies the caller is the booking's actual client/coach.
- `mark_missed_bookings` permission fix — a genuine DB-trigger bug fix ensuring one overdue booking anywhere doesn't break booking confirmation for every client (SUB-031).

### 7.2 Rules enforced ONLY in client-side TypeScript, with no confirmed RPC/trigger backstop
- Reschedule weekly cap (max 2/week, approximated via `was_rescheduled`+`updated_at`, can undercount by 1 — SES-009) — client-JS-only, **confirmed to match the live RPC's actual (narrower) scope**, not merely an assumption this time.
- Reschedule same-day conflict check (SES-010) — same pattern, confirmed matching RPC scope.
- Session-rating global 7-day cap (SES-015) — client-side, correctly checks across all bookings.
- Progress-log weekly cap (COM-007 in the original numbering) — client-side only.
- 30-day reschedule window — UI-only bound, not server-enforced (confirmed to mirror, not invent, the RPC's narrower actual enforcement).

### 7.3 Notable business-rule deviations / defects confirmed this pass
- **Renewal old-subscription retirement is non-atomic and its error is unchecked** (SUB-011) — the audit's clearest violation of an explicit WEB "MUST NOT CHANGE" rule.
- **Coach-change completion never cancels old-coach upcoming bookings**, in both completion paths, despite the codebase having a correct reference implementation elsewhere (`transferClientCoach`) — SES-030/ADM-006.
- **"Book a Session" is not hidden/redirected post-subscription**, contradicting both WEB and the app's own PRD twice over — SES-004.
- **Client is not notified of their own reschedule** — SES-012, an explicit WEB requirement.
- **Payment history is unfiltered by status**, surfacing raw `created`/`failed`/`paid_unfulfilled` rows with unmapped badges — SUB-015.
- Staff-facing renewal-opportunity threshold is hardcoded to `5` (same as the client's own trigger) instead of WEB's documented wider `10` — ADM-011/006 (numbering per report), staff lose early-warning lead time.
- Session rating's optional text note is never actually collected — the UI has no text field despite the type/DB column supporting it (SES-013).
- Coach profile card omits `languages[]`, `years_experience`, `review_count` even though these columns exist and are used elsewhere in the same codebase (SES-028).

---

## 8. Complete State Transition Map

See §5 for the enumerated states. Full per-state detail lives in each subsystem report's own state-machine section — notably `audit/02-...md`'s "Booking State Machine (as implemented)" table (with server-op column citing the exact RPC per transition) and `audit/03-...md`'s "Subscription State Machine (as implemented)" section (which is where the SUB-011 non-atomicity finding originates).

---

## 9. Database / Data Model

**Material audit limitation, stated plainly**: only 5 Postgres migrations exist in this repo. The rest of the schema, RLS policies, and RPC function bodies live only in the shared, live Supabase project and are **not versioned in this repository**. Every DB-level claim in this audit is one of: (a) directly read from a local migration, (b) inferred from exact field/RPC names referenced in code (never invented), or (c) cited from a code comment claiming to quote a live introspection pass.

**Confirmed identical to WEB**: no `expired`/`cancelled` value exists at the DB level for `subscriptions.status`; the display-only `sessions_used`/`sessions_remaining` figure (completed-count-only) is confirmed **never** fed into any client-side booking-allow/deny decision (SES-002) — the distinction `ClientPortal.md` §10/§26.A flags as highest-risk is preserved correctly.

**Columns confirmed to exist but go unused by the client UI that should show them**: `coach_profiles.languages`/`years_experience`/`review_count` (SES-028); `workout_notes.*` entirely (ADM-003); `bookings.rating_note` (written but always empty — SES-013).

**New mobile-only tables/concepts with no `ClientPortal.md` equivalent**: `assessment_sessions` (anonymous demo booking, SES-035/SUB-019), `push_tokens`, `client_timeline_events` (admin-only audit log, including the non-money-moving "refund request" entry, SUB-027).

---

## 10. API / Service / Backend Map

**No REST/GraphQL API layer exists — by design.** All client-portal logic runs through direct Supabase client calls plus 9 Edge Functions:

| Edge Function | Purpose | Trust model | Status |
|---|---|---|---|
| `razorpay` | Order creation + payment-signature verification | Service-role; only publishable `keyId` ever returned; HMAC via Web Crypto `crypto.subtle`, secret never leaves the function | WORKING CORRECTLY (SUB-003/005) |
| `razorpay-webhook` | Server-to-server payment reconciliation | HMAC-verified over raw body; code correct, always returns 200 | **NOT OPERATIONALLY ACTIVE** — secret unset, undeployed, unregistered with Razorpay (SUB-007) |
| `subscription-lifecycle` | Activate / pause / resume | Service-role, re-verifies ownership, re-validates all rules server-side | Activate/pause/resume WORKING CORRECTLY; **retirement side effect on activate is non-atomic** (SUB-011) |
| `coach-change-actions` | Client-self-serve coach-change completion | Service-role (client has no RLS grant to touch another party's rows) | Cascades `recurring_slots`+`conversations` correctly; **does not cancel old upcoming bookings** (SES-030) |
| `zoom-meeting` | Lazy Zoom meeting creation/join-link | Explicit participant-ownership check layered on RLS, confirmed a deliberate defense-in-depth choice | WORKING CORRECTLY |
| `phone-otp` | MSG91 phone verification | Real implementation; shares WEB's documented "Skip for now" bypass | WORKING |
| `create-assessment-booking` | Anonymous/no-account demo booking | Public-callable, own server-side coach matching, own re-validation before insert | WORKING CORRECTLY, new functionality |
| `admin-provisioning` | Admin-created client/coach accounts | Service-role, `auth.admin.createUser`, role via `app_metadata` only, caller-JWT-verified admin | WORKING CORRECTLY |
| `send-push` | Expo push delivery | DB-trigger-invoked, `verify_jwt:false` (acceptable — only Postgres calls it) | WORKING CORRECTLY |

**Backend functionality without client UI (the audit's clearest "backend outran frontend" pattern)**: shadow-coach client banner (ADM-009), coach session-notes display (ADM-003), `pause_days_used` derivation (SUB-013), coach profile's languages/experience/review-count fields (SES-028), session rating's text-note field (SES-013).

---

## 11. Authentication & Authorization

Confirmed structurally equivalent to WEB's security boundary despite a different mechanism (per-`_layout.tsx` role check vs. WEB's `middleware.ts` + login-time rejection). Role is confirmed **never client-settable** through every audited app-layer and edge-function code path, including admin-driven provisioning (`app_metadata`-only, caller-JWT-verified — ADM-007). The client bundle carries **zero service-role secrets** (grep-confirmed), and every privileged edge function independently re-verifies caller ownership rather than trusting a client-supplied id — a clean security review with no CRITICAL findings (NAV-010).

Gate precedence (phone > measurement > sessions-low) is confirmed byte-for-byte identical to WEB's documented order. The measurement gate **is** independently server-enforced — except the APP's own Progress-screen gate (COM-001) now blocks the only way to *satisfy* that enforcement for a brand-new prospect, the audit's top finding.

---

## 12. UI / Navigation Map

- **Live navigation**: `LightTabBar` is the sole live tab bar across all 4 role-group layouts (confirmed by real-import grep); `ui/floating-tab-bar.tsx` is confirmed fully dead — zero importers anywhere (NAV-003).
- **Role routing**: centralized, unit-tested (4 branches including `undefined`), safely falls back to a non-crashing `unsupported-role.tsx` screen with a sign-out affordance (NAV-001/002).
- **Session persistence**: AES-encrypted session blob with only the small AES key in Keychain/Keystore via `expo-secure-store`, SSR-safe guards throughout, documented as fixing a real observed crash (NAV-008).
- **Deep-link parsing**: `parseAuthCallback`/`parseRecoveryLink`, covered by a 9-case regression suite, correctly distinguishes an OAuth token pair from a password-recovery session (NAV-009).
- **Dead UI components**: 14 of 17 `ui/*` components confirmed zero-importer dead code (NAV-004). The 3 still-live ones plus 2 siblings (`screen-scaffold.tsx`, `tappable.tsx`) remain wired into exactly one un-migrated screen branch, `(client)/plans.tsx`'s `EnrolledPlansScreen` — a genuine, live, visible theme inconsistency reachable by every previously-subscribed client, notably via the renewal "Renew Now" flow (NAV-005). `star-rating.tsx`'s continued use is a **deliberate, documented** dark-modal-overlay pattern (rating sheet, celebration overlay), not a migration gap (NAV-006).
- **Deep-link / redirect behavior**: `activate.tsx` unconditionally routes to `/onboarding` after activation regardless of whether the client is a renewal client (AUTH-007); its own hint copy ("You can reschedule later if needed") directly contradicts the correctly-enforced one-time lock (SUB-010).

---

## 13. Integrations & External Dependencies

Confirmed present and traced: **Supabase** (Auth/DB/Storage/Realtime), **Razorpay** (native React Native SDK — `react-native-razorpay`, requires a dev build, not Expo Go — a deliberate, correct mobile-appropriate substitution for WEB's Checkout.js), **Zoom Server-to-Server OAuth**, **MSG91** (phone OTP — real, working, unlike WEB's KYC-pending account), **Expo push notifications**. **Resend (email)** was not independently confirmed present or absent — **UNKNOWN — REQUIRES VERIFICATION**.

Two self-documented operational risk notes belong here: (1) this repo's own `README.md` (lines 408-413) states neither the `razorpay` nor `zoom-meeting` edge function has been exercised end-to-end by a logged-in user, and the currently-configured Razorpay keys are **live** (`rzp_live_...`) keys (SUB-029); (2) the Razorpay webhook — the standard safety net for exactly this kind of unverified-in-production risk — is not deployed (SUB-007).

---

## 14. Notifications / Events / Background Processes

- **Confirmed present and working**: plan purchased/activated, subscription paused/resumed, session cancelled (client-initiated), reschedule (to coach/admins, **not the client themselves** — SES-012), new chat message, progress updated (to coach), escalation raised/resolved.
- **Confirmed absent (exhaustively verified by grep, not merely unobserved)**: session-booked notification on regular/demo booking (COM-003a); the entire session-reminder mechanism — no cron function, no `reminder_sent_at` column anywhere in the repo's migrations or types, no scheduler config of any kind (ADM-012, ~6 independent grep patterns all came back empty).
- **Confirmed missing at the coach-change-completion step specifically**: no timeline event, no explicit "schedule/coach changed" notification dispatched from either completion path (SES-032).
- **New, no-WEB-precedent capability, well executed**: the full push pipeline (register → DB trigger on every `notifications` INSERT → `send-push` edge function → Expo push API), automatically inheriting every trigger above.

**Background/scheduled processes inventory**: `mark_missed_bookings()` — opportunistic, fires on every booking-list read, matches WEB exactly, and its own permission model was fixed by a dedicated migration (SUB-031) after a bug that could break booking confirmation app-wide. **No true cron/scheduled job of any kind exists in this repository.**

---

## 15. Functionality Audit — Status Classification Summary

Across all 124 matrix rows (§26):

| Status | Approx. count | Representative examples |
|---|---|---|
| WORKING CORRECTLY | ~65 | Journey machine, payment trust boundary, credit enforcement (high-confidence), activation date/lock, pause/resume, escalation call-gate, Zoom join, push pipeline, role assignment everywhere, security posture, role routing, session persistence, deep-link parsing |
| WORKING BUT INCORRECT | ~10 | "Book a Session" reachable post-subscription, cancel-cutoff UX absent, client not notified of own reschedule, renewal non-atomicity, misleading activation copy, reschedule-cap approximation |
| PARTIALLY IMPLEMENTED | ~6 | Coach profile field completeness, session-rating text note, subscription display's missing pause-days-used, leave→client visual continuity, onboarding re-entry guard |
| NOT IMPLEMENTED | ~10 | Chat auto-creation, session-booked notification, session-reminder cron, coach-notes-to-client, shadow-coach client banner, pause-days-used, webhook (operationally), demo re-booking guard |
| BROKEN | 2 | Progress screen's purchase gate (COM-001); coach-change completion's booking-orphan gap (SES-030, upgraded from "gap" to BROKEN this pass) |
| IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW | ~12 | Forgot-password (deliberate addition), staff renewal threshold, payment-history status exposure, unified login, renewal gender "no preference" option, simplified coach-matching ladder, admin refund-request audit log |
| DUPLICATED/CONFLICTING | 2 | One un-migrated dark-theme screen branch, two tab-bar implementations (one dead) |
| UNUSED/DEAD | ~15 | 14 dead `ui/*` components, dead tab bar, dormant web-only demo-payment code path never even ported |
| UNKNOWN — REQUIRES VERIFICATION | ~2 | Coach-utilization query pagination at scale, Resend/email usage |

(Counts approximate — several rows are "Info"-severity confirmations of correct behavior rather than gaps; see §26 for the authoritative per-row classification across all 124 rows.)

---

## 16. Broken Functionalities

Two findings meet the strict "BROKEN" bar this pass (up from one in the prior synthesis):

- **COM-001 — Progress/measurement logging is hard-gated behind an active-ever subscription**, eliminating the only way a brand-new prospect can satisfy the measurement-freshness gate that independently blocks demo booking. Net effect: a new prospect can buy a paid plan outright but can never complete the free-demo funnel.
- **SES-030 / ADM-006 — Coach-change completion (both the client self-serve edge function and the admin approve-with-coach path) never cancels the client's still-upcoming bookings with the old coach.** Upgraded to BROKEN status this pass because the newer audit pass confirms it against **both** completion code paths and contrasts it directly with a third, correct implementation (`transferClientCoach`) already present in the same codebase — this is not a missing feature, it's an inconsistently-applied one, which is a stronger and more actionable finding than "gap."

---

## 17. Incorrect Implementations

- Password minimum length inconsistent across 3 surfaces (AUTH-005).
- Onboarding measurement fields labeled "(cm)" when WEB's spec states inches (AUTH-006).
- `activate.tsx` unconditionally routes to `/onboarding` regardless of renewal status (AUTH-007); its own hint copy also misrepresents the one-time lock (SUB-010).
- `EnrolledHomeScreen`'s stage-redirect switch has no case for `marketing`/`demo_booked`/`demo_completed` (AUTH-010).
- **"Book a Session" is not hidden/redirected for subscribed clients — contradicts WEB spec and both of the app's own PRD documents** (SES-004, High).
- **Cancellation has no client-visible cutoff countdown or proactive disable**, unlike reschedule, which does pre-filter (SES-007, Medium).
- **Client is not notified of their own reschedule action** (SES-012, Medium) — an explicit WEB requirement, omitted per an explicit (incorrect) code comment.
- **Renewal old-subscription retirement is not transactional; its error is unchecked** (SUB-011, High).
- **Payment-history rows expose raw internal payment-lifecycle status with unmapped, ugly-cased badges** (SUB-015, Medium), and **`awaiting_activation` subscriptions are directly viewable/displayed** contrary to WEB's redirect-first behavior (SUB-016, Low).
- Renewal's "No, Change It" path incorrectly offers a "no preference" gender option that WEB explicitly says should not exist on renewal (SES-026).
- Staff-facing renewal-opportunity threshold hardcoded to 5 instead of WEB's documented wider 10 (ADM-011).
- Reschedule weekly-cap approximation can undercount by 1 in a same-week double-reschedule edge case (SES-009, Low, documented limitation).

---

## 18. Partially Implemented Functionalities

- Coach profile card omits `languages[]`, `years_experience`, `review_count` despite the columns existing and being used elsewhere in the codebase (SES-028).
- Session rating's optional text note is never collected in the UI — always submitted empty (SES-013).
- `pause_days_used` is never computed anywhere client-side, only the static allowance is shown (SUB-013, low business impact since WEB itself treats it as informational-only).
- Leave-approval cascades reassign bookings and fire a generic notification correctly, but there is no in-session visual continuity for the client beyond that (ADM-010).
- Onboarding has no guard preventing re-entry once already submitted (AUTH-008).
- Coach-change completion cascades `recurring_slots` and chat correctly but no timeline event or explicit "coach changed" notification fires (SES-032).

---

## 19. Missing Functionalities

- **Coach session notes never surface to the client anywhere** — confirmed absent, not partial; `workout_notes` is unread by every client-facing file (ADM-003, High).
- **Shadow-coach client-facing banner** — the entire backend (scoring, cascading leave, booking repoint) is built and correct; the client UI payoff does not exist (ADM-009/SES-019, High).
- **Chat conversation auto-creation on ordinary schedule setup** — COM-002, High.
- **Session-booked notification** (regular or demo) — COM-003a, High.
- **Session-reminder scheduled job** — ADM-012/COM-003b, confirmed entirely absent by exhaustive grep, High.
- **Razorpay webhook reconciliation**, operationally — SUB-007, High.
- **`pause_days_used`** — SUB-013, Low.
- **Demo re-booking guard** at the page level (mitigated by nav, bypassable via deep link) — SES-033.

---

## 20. Duplicate / Conflicting / Dead Functionality

- **One confirmed live theme inconsistency**: `(client)/plans.tsx`'s `EnrolledPlansScreen` renders the full legacy dark theme for every previously-subscribed client — NAV-005, Medium, the audit's clearest remaining UI-consistency defect.
- **14 of 17 `ui/*` components are fully dead code**, safe, zero-risk cleanup candidates — NAV-004.
- **`ui/floating-tab-bar.tsx`** is fully dead, superseded by `LightTabBar` — NAV-003.
- **`star-rating.tsx`+dark modal overlays** are a deliberate, documented exception, not duplication to resolve — NAV-006.
- **Web's dormant demo-payment code path (`createDemoSessionOrder`) was not even ported to mobile** — confirmed absent, not just unreachable (SUB-020) — arguably cleaner than WEB in this one respect.
- No TODO/FIXME/XXX markers anywhere in the app source (NAV-011); all "coming soon" markers found are deliberate, correctly-labeled gaps matching known WEB-spec absences (NAV-012).

---

## 21. Edge Cases & Failure Handling

Notable edge cases confirmed handled well: idempotent payment verification; the payment-success screen reads the persisted DB record rather than trusting the client-side Razorpay callback object (SUB-023); double-tap purchase protection at the UI layer backstopped by the real server-side TOCTOU check; hold-slot expiry UX; `getOpenSlotsForCoachOnDate`'s advisory-only nature is safe because `confirm_booking` always re-validates; recurring-schedule setup failure partway through is non-atomic but explicitly disclosed in code and surfaced to the UI via the `{requested, confirmed}` result rather than silently under-reported.

Notable edge cases confirmed **not** handled, or handled differently than WEB:
- Renewal-activation crash between the two sequential subscription updates can leave two simultaneously `active` subscriptions with no surfaced error (SUB-011).
- A client with a paused/inactive-with-nothing-newer subscription and no live demo has no clear re-purchase path in the enrolled dashboard (AUTH-010).
- A demo-only client could, via a direct deep link (no in-app path produces this URL), reach the full coach-change-request UI against their temporary demo coach — low likelihood, not hard-gated.
- Payment retried after an app-killed-mid-checkout leaves an orphaned `created` payment row visible (unfiltered) in payment history.

---

## 22. Workflow Dependencies

- **Attendance + session notes (coach) → booking completion + (intended, but missing) "Coach notes" visibility (client)**: the completion half of this dependency is confirmed correct; the client-visible payoff half is confirmed absent (ADM-001/002/003).
- **Escalation resolution (admin, DB-gated) → Concerns screen resolution callout (client)**: dependent on the DB trigger holding — confirmed present and correctly scoped (ADM-004).
- **Coach-change approval (admin) → My Coach screen states + chat conversation switch (client)**: fully cascades correctly for `recurring_slots` and `conversations`; **does not cascade to `bookings`**, the audit's clearest cross-system inconsistency, since a third code path in the same repo (`transferClientCoach`) proves the correct behavior is known and implementable (SES-030/ADM-006).
- **Shadow-coach assignment (admin, leave-cascade) → Sessions screen (client)**: the dependency exists at the data layer (`bookings.coach_id` is genuinely repointed) but the client-facing half of the dependency — the banner explaining *why* — was never built (ADM-009).
- **Session-rules config (admin `system_settings`) → cutoff enforcement (client)**: confirmed the client never even fetches `cancellation_cutoff_hours` for its own UX purposes (relying entirely on server rejection), which is functionally safe but UX-incomplete (SES-007); reschedule cutoff IS read live client-side (`booking-wizard.ts:130`).
- **`ClientJourneyStage` is the upstream dependency for nearly every other module** — its correctness (confirmed WORKING CORRECTLY) is what makes the rest of the app's stage-aware behavior reliable.

---

## 23. APP Implementation Risks

The audit's central, cross-cutting risk theme: **because the APP has no server-action/API intermediary layer, any business rule that isn't pushed down into a Postgres RPC, trigger, or edge function is enforced only by convention.** This pass sharpened the picture:

- **Correctly hardened at the DB/edge-function layer**: payment verification, subscription activation/pause/resume (except the retirement-atomicity gap), escalation call-gate, onboarding insert-once, Zoom join ownership, cutoff-hours, session-credit enforcement (high confidence), `mark_missed_bookings` permission scoping.
- **Not hardened — client-side-only, confirmed bypassable, confirmed to match the live RPC's actual (narrower) scope rather than a documentation gap**: reschedule weekly cap, reschedule same-day conflict, rating weekly cap, progress-log weekly cap, 30-day reschedule window.
- **Non-atomic where WEB explicitly requires atomicity**: the renewal old-subscription-retirement side effect (SUB-011) — the clearest single instance in this audit of the APP's architecture actively violating one of WEB's stated "MUST NOT CHANGE" rules, not just failing to replicate a nice-to-have.
- **Backend-complete, frontend-incomplete** is a distinct, recurring pattern this pass surfaced clearly: shadow-coach banners, coach notes display, coach profile field completeness, and the session-rating text note all show correct/thorough backend or data-layer work with no corresponding client UI — worth flagging to the WEB-side AI as a specific APP development pattern (backend built ahead of frontend) rather than a uniform gap.

---

## 24. Items Requiring Verification

1. **Whether `confirm_booking`'s actual RPC body enforces the credit rule exactly as inferred** — subsystem 2's newer pass raises confidence to "architecturally correct by delegation," but the RPC body itself remains unread (not in this repo). Given the financial stakes, a live-DB read of this function is still the single highest-value verification action available.
2. **Coach-utilization query pagination at scale** (SES-036) — fetches all `active` coaches and all `upcoming` bookings unconditionally; not observed to fail today, but no explicit limit exists.
3. **Whether Resend (email) is used anywhere in the APP**, or whether in-app + push is the sole notification surface.
4. **Column-level RLS protection on `profiles.role`** against a direct-table-write bypass (carried over from the first pass, not re-addressed by the newer subsystem reports).
5. **Whether `p_enforce_cutoff` is trusted verbatim by `cancel_booking`/`reschedule_booking` or re-derived server-side from caller role** — the newer pass frames the weekly-cap/same-day-check gap as "confirmed to match the live RPC's actual scope" rather than leaving this specific sub-question open, but an explicit confirmation of the cutoff-trust question itself was not restated in the newer report and should be re-verified directly.

---

## 25. Recommended Priority Order for Fixing Gaps

Ordered by (severity × blast radius), not ease of fix — no fixes were made as part of this audit:

1. **COM-001** (Progress purchase-gate breaks the demo funnel) — CRITICAL, single-screen fix, highest client-acquisition impact.
2. **SUB-011** (renewal retirement non-atomic, error swallowed) — HIGH, directly violates an explicit WEB "must not change" rule; wrap in a transaction/RPC and surface the error.
3. **SES-030 / ADM-006** (coach-change completion orphans old bookings) — HIGH, a known-correct reference implementation (`transferClientCoach`) already exists in the same codebase to copy from.
4. **ADM-003** (coach notes never reach the client) — HIGH, straightforward to build (select + render `workout_notes.notes`), high perceived-value fix.
5. **ADM-009 / SES-019** (shadow-coach client banner) — HIGH, backend is complete; this is purely a client-rendering task.
6. **SES-004** ("Book a Session" reachable post-subscription) — HIGH, but needs a product decision first since it contradicts the app's own PRD twice over — confirm intent before "fixing."
7. **COM-002** (chat never auto-created) — HIGH, makes "My Chats" unusable for most clients.
8. **SUB-007 / SUB-029** (webhook inert + live keys never tested) — HIGH, operational/ops task, should be fast.
9. **COM-003a / ADM-012** (no booking notification, no reminder cron) — HIGH, clear scope, no ambiguity.
10. **SES-002/... rate-limit client-side-only pattern** — MEDIUM-HIGH as a batch; replicate the escalation call-gate trigger pattern.
11. **SES-012** (client not notified of own reschedule) — MEDIUM, single-line fix (remove the incorrect omission).
12. **NAV-005 / SUB-009 (Plans dark-theme leak)** — MEDIUM, cosmetic but visible, part of finishing the theme migration.
13. **ADM-011** (staff renewal threshold) — MEDIUM, single-constant fix.
14. **SES-028 / SES-013** (coach profile fields, rating text note) — LOW-MEDIUM, straightforward additive fixes, columns already exist.
15. **AUTH-005/006/007/008/010, SUB-010/015/016** — LOW-MEDIUM individually, batch-fixable.
16. **NAV-003/004** (dead code cleanup) — LOW, zero-risk, do opportunistically once NAV-005 is resolved (so `ui/*` can be fully deleted rather than partially).
17. **Test coverage** — ongoing investment; prioritize the journey-stage machine and `subscription.ts`/`payments.ts`/`plans.ts` first.

---

## 26. Master Functionality & Gap Matrix

All 124 rows from the five subsystem audits. IDs are preserved exactly as produced by each subsystem pass. This is the complete inventory required by the audit brief — WORKING CORRECTLY rows are included alongside every gap, not filtered out.

### AUTH — Authentication, Journey, Gates, Onboarding, Profile (source: `audit/01-auth-journey-profile.md`, unchanged from first pass)

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Severity |
|---|---|---|---|---|---|---|---|---|
| AUTH-001 | Auth | Signup | Role assignment | `auth-context.tsx:242-247` | `signUp()` never sends role | Server-derived only | WORKING CORRECTLY | Low |
| AUTH-002 | Auth | Role sync | `sync_role_on_auth_user_metadata_update` trigger | migration `20260912110000` | Re-syncs role from `raw_app_meta_data` on admin follow-up UPDATE | Server-only role source | WORKING CORRECTLY | Low |
| AUTH-003 | Auth | Direct-write role escalation | Column-level RLS protection | Not present in this repo | Cannot confirm from this repo | Should be structurally blocked (as WEB's migrations 0051/0055 do) | UNKNOWN — REQUIRES VERIFICATION | Medium |
| AUTH-004 | Auth | Login | Wrong-role login UX message | `auth-context.tsx:222-233` | Silent redirect, no rejection message | WEB shows an explicit rejection message | IMPLEMENTED BUT DIFFERENT (deliberate) | Low |
| AUTH-005 | Profile | Password change/reset | Minimum length | `profile.tsx:99,268`; `reset-password.tsx:50` | Accepts 6-7 chars | Should require ≥8, matching signup | WORKING BUT INCORRECT | Low-Medium |
| AUTH-006 | Onboarding | Measurement unit labels | Waist/Chest/Hip/Arms/Thigh | `onboarding.tsx:153-157` | Labeled "(cm)" | WEB spec: inches | WORKING BUT INCORRECT | Medium |
| AUTH-007 | Post-purchase | Activate → next step routing | Post-activation navigation | `activate.tsx:41` | Unconditional `/onboarding` | Should branch first-time vs renewal | WORKING BUT INCORRECT | Medium |
| AUTH-008 | Onboarding | Re-entry after submission | Dead-end handling | `onboarding.tsx` | No guard; throws "already submitted" | Screen should be unreachable once condition is false | PARTIALLY IMPLEMENTED | Low-Medium |
| AUTH-009 | Gates | Global gate precedence | Phone > Measurement > Sessions-low | `global-gates.tsx:42-49` | Exact match to spec | Same | WORKING CORRECTLY | — |
| AUTH-010 | Journey | Dashboard hard-redirect | Missing `marketing`/`demo_*` cases | `index.tsx:214-232` | Falls to default, no redirect | WEB: hard-redirect to Plans | WORKING BUT INCORRECT | Medium |
| AUTH-011 | Gates | Measurement server enforcement | `assertMeasurementsFresh` | `measurement-status.ts:44-49` | Server-independent throw | Matches WEB | WORKING CORRECTLY | — |
| AUTH-012 | Gates | Sessions-low display metric | `getSessionsUsedCount` | `subscription.ts:59-67` | Completed-only count | Matches WEB's display-only semantics for this gate | WORKING CORRECTLY | Low |
| AUTH-013 | Auth | Forgot/reset password | New vs. WEB | `forgot-password.tsx`, `reset-password.tsx` | Fully functional | WEB has none | NEW (deliberate) | Info |
| AUTH-014 | Onboarding | Insert-once enforcement | App + DB layer | `onboarding.ts:55-56,71-75` + unique index | Race-safe | Matches WEB | WORKING CORRECTLY | — |
| AUTH-015 | Profile | Field editability matrix | Name/phone/password/photo/etc. | `profile.tsx` | Matches WEB §13 exactly | Same | WORKING CORRECTLY | — |
| AUTH-016 | Auth | Role→route mapping | `getHomeRouteForRole` | `role-routing.ts:12-22` | Tested, all roles covered | Same intent as WEB | WORKING CORRECTLY | — |
| AUTH-017 | Gates | Coach pending-tasks gate | Role scope confirmation | `coach-pending-tasks-gate-modal.tsx` | Coach-only, correctly scoped | New, no WEB precedent | WORKING CORRECTLY | Info |
| AUTH-018 | Auth | Phone OTP | Real MSG91 vs. WEB's KYC-pending | `supabase/functions/phone-otp` | Fully wired, same skip bypass | More functionally complete than WEB | IMPLEMENTED BUT DIFFERENT | Low |
| AUTH-019 | Journey | Renewal detection | `isRenewalSubscription` | `journey.ts:37-45` | Existence-only check | Matches WEB | WORKING CORRECTLY | — |
| AUTH-020 | Journey | `slot_selection` scope | Any active recurring slot | `journey.ts:90-92` | Matches WEB's literal wording | Same | WORKING CORRECTLY | — |

### SES — Sessions, Booking, Recurring Schedule, Coach Matching (source: `audit/02-sessions-booking-coach.md`, expanded pass)

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Severity |
|---|---|---|---|---|---|---|---|---|
| SES-001 | Booking | Regular session confirm | Credit/session-count enforcement | `booking-wizard.ts:278-299` | Delegates entirely to RPC `confirm_booking`; no client-side pre-check or duplication | Server-side count of `upcoming+completed` vs `sessions_total` (migration 0053 parity) | WORKING CORRECTLY | — |
| SES-002 | Subscription display | Sessions Remaining figure | Display-only usage count, distinct from enforcement | `subscription.ts:59-67`, `subscription.tsx:151-164` | Counts `status='completed'` only; never fed into a booking gate | Same distinction as web's `subscription_usage_view` | WORKING CORRECTLY | — |
| SES-003 | Booking | Assessment vs regular session typing | First-real-session-is-assessment rule | `demo-booking.ts`, `booking-wizard.ts:290` | `confirmHold` defaults `session_type='regular'`; assessment path explicitly passes `'assessment', amountPaid:0` | Matches web's free/first-ever vs paid/regular split | WORKING CORRECTLY | — |
| SES-004 | Booking | Post-subscription ad-hoc booking access | "Book a Session" nav/CTA visibility | `sessions.tsx:219`, `index.tsx:331`, `book-session.tsx:178-193` | Visible and fully functional for subscribed clients; performs real paid regular-session booking | Hidden once subscribed; `/client/book` should redirect to schedule (web spec + both mobile PRDs agree) | WORKING BUT INCORRECT | High |
| SES-005 | Booking state machine | Missed-session detection | Opportunistic sweep on every list read | `bookings.ts:24-30,33,49` | `mark_missed_bookings` RPC fired fire-and-forget before every list query | Matches web's "not a cron, runs on every booking-list read" | WORKING CORRECTLY | — |
| SES-006 | Booking state machine | Client cannot self-complete a session | Attendance-then-notes gating | Whole `(client)` scope + `bookings.ts` | No code path writes `status='completed'` from client code | Client cannot self-complete (coach-only, two-step) | WORKING CORRECTLY | — |
| SES-007 | Cancellation | Cancel cutoff UX | Cutoff enforcement vs. UI signal | `sessions.tsx:70-86,142-158`, `bookings.ts:78-98` | Cancel always enabled; server RPC rejects past cutoff with generic error alert | Button disabled past cutoff, exact cutoff timestamp shown | WORKING BUT INCORRECT | Medium |
| SES-008 | Reschedule | 3-mode reschedule (own/fastest/substitute) | Full reschedule workflow | `reschedule/[id].tsx` | All 3 modes implemented, substitute correctly leaves `recurring_slot_id` untouched | Matches ClientPortal.md §10 | WORKING CORRECTLY | — |
| SES-009 | Reschedule | Weekly cap (2/week) | Approximated via `was_rescheduled`+`updated_at`, not exact event log | `bookings.ts:110-133` | Can undercount by 1 if the same booking is rescheduled twice in 7 days | Web counts from `session_rescheduled` timeline events | WORKING BUT INCORRECT | Low |
| SES-010 | Reschedule | Same-day no-double-booking | IST calendar-day conflict check | `bookings.ts:136-148` | Correctly implemented, client-JS-only (matches live RPC's actual scope) | Matches web | WORKING CORRECTLY | — |
| SES-011 | Reschedule | Substitute-coach single-session override | `p_new_coach_id` 5-arg RPC form | `bookings.ts:160-211` | Updates `bookings.coach_id` only, `recurring_slot_id` untouched | Matches web exactly | WORKING CORRECTLY | — |
| SES-012 | Notifications (cross-boundary) | Reschedule self-notification | Client notified of own reschedule | `bookings.ts:199-210` | Client is NOT notified of their own reschedule | ClientPortal.md §10/§15: client always notified of own session moving | WORKING BUT INCORRECT | Medium |
| SES-013 | Rating | Optional text note | Note field on rate-session sheet | `rate-session-sheet.tsx:16-48` | No text input rendered; `note` hardcoded to `''` | Optional free-text note per rating | PARTIALLY IMPLEMENTED | Medium |
| SES-014 | Rating | Two required dimensions, 1-5 stars | Quality + trainer rating | `rate-session-sheet.tsx:32-36` | Both required, 1-5 stars, blocks submit otherwise | Matches spec | WORKING CORRECTLY | — |
| SES-015 | Rating | Global once/7-days cap | `canRateThisWeek()` across all bookings | `bookings.ts:233-242`, `sessions.tsx:200-204` | Checks most recent `rated_at` across ALL client bookings | Matches web's global weekly cap | WORKING CORRECTLY | — |
| SES-016 | Zoom | Lazy meeting creation | First-join creates the Zoom meeting | `zoom.ts:43-48`, `zoom-meeting/index.ts` | Idempotent; reuses existing `zoom_join_url`; participant re-verified server-side | Matches web exactly | WORKING CORRECTLY | — |
| SES-017 | Zoom | Join-window gating | Countdown-based join state | `zoom.ts:27-40` | Time-window only; measurement staleness checked at tap-time (throws), not pre-disabled | Web: stays disabled unless countdown OK AND URL exists AND measurements fresh | IMPLEMENTED BUT DIFFERENT | Low |
| SES-018 | Zoom | Coach-side join gate | `coach_joined_at` not used client-side | `types.ts:29` | Field exists in type but not read/used by any client screen | Web: coach-only gate, correctly N/A for client | WORKING CORRECTLY (N/A) | — |
| SES-019 | Coach continuity | Shadow-coach banner | Temporary coverage notice on Sessions | `sessions.tsx` (absent) | No shadow-coach awareness anywhere in client scope | ClientPortal.md §10/§22: one-time acknowledgeable banner on `/client/sessions` | NOT IMPLEMENTED | High |
| SES-020 | Recurring schedule | Pattern picker | Standard/pair/custom 2-5, Sunday excluded | `my-schedule.tsx:64-112`, `recurring-schedule.ts:63-76` | Sunday never selectable; 3 pattern types implemented | Matches web | WORKING CORRECTLY | — |
| SES-021 | Coach matching | First-time/no-preference matching | Least-utilization-first | `coach-utilization.ts:14-39` | Ascending sort by upcoming-booking count, shared by all matching call sites | Matches ClientPortal.md §10 `findAvailableCoach` | WORKING CORRECTLY | — |
| SES-022 | Coach matching | Known-preference fallback ladder | 4-step ladder simplified to a single pass | `recurring-schedule.ts:182-213` | No alternate day-pairing fallback | Web's `matchRecurringPattern` 4-step ladder | IMPLEMENTED BUT DIFFERENT | Low |
| SES-023 | Recurring generation | Shortfall signal | `{requested, confirmed}` reporting + warning UI | `recurring-schedule.ts:215,268,321`, `my-schedule.tsx:210-243` | Explicitly surfaces shortfall to client with a warning banner | Web silently under-delivers with no signal (§29 gap) | WORKING CORRECTLY (improvement) | Info (positive) |
| SES-024 | Recurring generation | Leave-agnostic pattern match | `computeCommonHours` only reads `coach_availability` | `recurring-schedule.ts:110-136` | Never checks `coach_leave`; matches web's same documented gap | ClientPortal.md §29 confirmed gap, same on both platforms | WORKING CORRECTLY (matches web gap intentionally) | Info |
| SES-025 | Renewal | "Keep My Schedule" shortcut | One-click carryover to new subscription | `recurring-schedule.ts:227-271`, `renewal-scheduling.tsx` | Re-inserts most-recent pattern against new subscription id, regenerates bookings | Matches web | WORKING CORRECTLY | — |
| SES-026 | Renewal | Gender "no preference" on renewal change | Renewal reuses ordinary schedule wizard | `renewal-scheduling.tsx:76-78`, `my-schedule.tsx:304-311` | "No preference" gender option present on renewal | Web: no "no preference" option on renewal | IMPLEMENTED BUT DIFFERENT | Low |
| SES-027 | Coach profile | Pre-purchase coach states | No-coach / demo-simplified / full-card | `coach.tsx:57-113` | Correctly implements all 3 states, gated on `coach.source` | Matches ClientPortal.md §12 exactly | WORKING CORRECTLY | — |
| SES-028 | Coach profile | Full coach card fields | certifications/languages/years-experience/review_count | `coach.ts:18-37`, `types.ts:48-58` | Only `bio, specialization, secondary_specializations, rating` surfaced | Web full card includes languages[], years experience, review_count (columns exist, used elsewhere in this repo) | PARTIALLY IMPLEMENTED | Medium |
| SES-029 | Coach change | Request lifecycle banners | pending/approved-needs-completion/approved-complete/rejected | `my-coach.tsx:102-194` | All 4 states correctly rendered | Matches ClientPortal.md §12 | WORKING CORRECTLY | — |
| SES-030 | Coach change | Completion cascading effects — bookings | Cancel old-coach still-upcoming bookings | `coach-change-actions/index.ts:94-124`, `admin-coach-change.ts:113-148` | Cancels `recurring_slots` only; upcoming `bookings` with old coach are left untouched | ClientPortal.md §12 step 4: "cancels their still-upcoming bookings" | **BROKEN** | **High** |
| SES-031 | Coach change | Completion cascading effects — chat | Close old conversation, open new one | `coach-change-actions/index.ts:122-124` | Correctly closes old, opens new | Matches web | WORKING CORRECTLY | — |
| SES-032 | Coach change | Timeline/notification on completion | `coach_changed` event + notification | `coach-change-actions/index.ts`, `admin-coach-change.ts` | No timeline event logged, no explicit notification dispatched | ClientPortal.md §15: "Schedule changed / coach changed" notification required | PARTIALLY IMPLEMENTED | Medium |
| SES-033 | Demo booking | Re-booking guard while a demo is upcoming | Stage-aware block | `demo-booking.tsx:208-212` | Shows informational note only; does not block re-booking; no page-level stage self-guard | Web: `demo_booked` shows "already booked" blocking card | NOT IMPLEMENTED | Low |
| SES-034 | Booking wizard | Slot advisory / server re-validation | Hold→confirm with server-side re-check | `booking-wizard.ts:15-27,278-299` | Correctly advisory client-side, real conflict check happens in `confirm_booking` | Matches web's "a stale client view can never over-book" | WORKING CORRECTLY | — |
| SES-035 | Anonymous demo | Prospect (no-account) booking | Separate `assessment_sessions` mechanism | `create-assessment-booking/index.ts`, `anonymous-demo-booking.ts`, `(auth)/book-free-demo.tsx` | Fully wired, distinct table/RPC-free implementation, server-side re-validation before insert | Matches web's dual demo-booking mechanism | WORKING CORRECTLY | — |
| SES-036 | Recurring schedule | Coach-utilization query scale | No pagination on `bookings`/`coach_profiles` fetch | `coach-utilization.ts:14-39` | Fetches all rows unconditionally | Not specified by web reference | UNKNOWN — REQUIRES VERIFICATION | Low |

### SUB — Subscription, Payments, Plans, Demo Booking (source: `audit/03-subscription-payments-plans.md`, expanded pass)

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Severity |
|---|---|---|---|---|---|---|---|---|
| SUB-001 | Plans | Marketing browsing | Logged-out plan browsing, no purchase | `(marketing)/plans.tsx` | Public tab shows plans read-only, "View Details"→`/signup`; auto-redirects if session exists | Plans visible pre-login; purchase requires account | WORKING CORRECTLY | — |
| SUB-002 | Plans | Logged-in browsing/purchase | Dual pre-purchase/enrolled themed plan screens | `(client)/plans.tsx:54-187` | Branches purely on subscription existence for theme, not gating; both call same `purchasePackage()` | One purchase entry point post-login | WORKING CORRECTLY | — |
| SUB-003 | Payments | Order creation | Razorpay order created server-side | `razorpay/index.ts:130-188` | Auth/role/purchase-gate checked, secret server-only, `payments` row inserted before checkout UI | Same | WORKING CORRECTLY | — |
| SUB-004 | Payments | Checkout | Native Razorpay SDK (not WebView) | `payments.ts:12,50-59`; `package.json:38` | `react-native-razorpay` native module, requires dev build | Native SDK preferred per §22/§26.B | WORKING CORRECTLY | — |
| SUB-005 | Payments | Fulfillment | Server-side HMAC-SHA256 signature verification | `razorpay/index.ts:74-79,190-275` | Idempotent, ownership-checked, mismatch → hard fail, no subscription without valid signature | Only trusted fulfillment path | WORKING CORRECTLY | — |
| SUB-006 | Payments | Fulfillment failure | `paid_unfulfilled` path | `razorpay/index.ts:226-262`, `razorpay-webhook/index.ts:108-149` | Captured payment marked `paid_unfulfilled` on any post-signature failure; no auto-refund, support-reference message | Same | WORKING CORRECTLY | — |
| SUB-007 | Payments | Webhook reconciliation | Server-to-server safety net | `razorpay-webhook/index.ts` | Code correct but undeployed and unregistered per its own header comment | Webhook active in production | PARTIALLY IMPLEMENTED | **HIGH** |
| SUB-008 | Payments | Purchase gate | Block 2nd purchase unless `sessions_remaining<=5` | `razorpay/index.ts:44-72,142-147,236-242`; webhook `:113-132` | Consistently enforced at create-order, verify-payment (TOCTOU), and webhook, identical counting | Same rule everywhere | WORKING CORRECTLY | — |
| SUB-009 | Subscription | Activation | Start date >= tomorrow (IST), one-time lock | `activate.tsx`, `subscription-lifecycle/index.ts:102-131` | Server independently re-validates regardless of client `minDate` | Same | WORKING CORRECTLY | — |
| SUB-010 | Subscription | Activation | UI copy says "You can reschedule later if needed." | `activate.tsx:93` | Misleading hint; actual behavior is a hard one-time lock | Copy should not contradict the one-time-lock rule | WORKING BUT INCORRECT | Low |
| SUB-011 | Subscription | Renewal | Atomic old-subscription retirement on new activation | `subscription-lifecycle/index.ts:115-127` | Two sequential, non-transactional updates; retirement error never checked | Must happen atomically with activation (§26.C, MUST NOT CHANGE) | WORKING BUT INCORRECT | **HIGH** |
| SUB-012 | Subscription | Pause/Resume | Client self-service pause/resume + notifications | `subscription.tsx:69-95`, `subscription-lifecycle/index.ts:134-171` | Correct status-guard transitions; notifies client + coach; no booking writes on pause | Same | WORKING CORRECTLY | — |
| SUB-013 | Subscription | Pause days | `pause_days_used` derivation | N/A | Only allowance shown; no used/consumed figure | Web derives live from timeline events, informational | NOT IMPLEMENTED | Low |
| SUB-014 | Subscription | Display | Subscription screen field set | `subscription.tsx:140-183` | Matches §9's field list except `pauseDaysUsed` | Match §9's `MySubscriptionView` field list | PARTIALLY IMPLEMENTED | Low |
| SUB-015 | Subscription | Payment history | Raw payment statuses shown to client | `payments.ts:25-36`, `subscription.tsx:185-200`, `light-badge.tsx:27-44` | No status filter; unmapped gray badge, ugly under-capitalized label ("Paid_unfulfilled") | Should show successful purchases only (web's `sales_view`) | IMPLEMENTED BUT DIFFERENT | Medium |
| SUB-016 | Subscription | Display | Raw `awaiting_activation` status shown on Subscription screen | `subscription.tsx:145,168` | Mobile allows viewing while awaiting activation; badge shows unmapped raw enum | Web never shows this state here — journey redirect happens first | IMPLEMENTED BUT DIFFERENT | Low |
| SUB-017 | Sessions-low gate | Renewal nudge | `SESSIONS_LOW_THRESHOLD=5` gate | `gates.ts:10,18-32` | Correctly derived, matches server-side purchase-gate threshold | Same threshold everywhere | WORKING CORRECTLY | — |
| SUB-018 | Demo booking | Authenticated demo | Free, no Razorpay | `demo-booking.ts`, `demo-booking.tsx:107` | `confirmHold(..., {sessionType:'assessment', amountPaid:0})`, no payment call | Fully bypasses Razorpay | WORKING CORRECTLY | — |
| SUB-019 | Demo booking | Anonymous demo | Free, no Razorpay, no account | `anonymous-demo-booking.ts`, `book-free-demo.tsx` | Calls `create-assessment-booking` edge function only | Fully bypasses Razorpay | WORKING CORRECTLY | — |
| SUB-020 | Demo booking | Dormant paid-demo code | Razorpay demo-payment path (`createDemoSessionOrder`) | N/A | No such function exists in mobile repo (only `Payment.purpose` enum retains `'demo_session'`) | Web has this as unreachable dead code; mobile didn't even port the dead code | UNUSED-DEAD (N/A — not ported) | — |
| SUB-021 | Renewal | Check-in | Fresh baseline, bypasses weekly rate limit | `renewal-checkin.tsx:63-79` | Correctly bypasses the normal 7-day cap | Same | WORKING CORRECTLY | — |
| SUB-022 | Renewal | Scheduling | Keep/Change schedule choice | `renewal-scheduling.tsx` | "Keep" → carryover; "Change" → `/my-schedule` | Matches §9 | WORKING CORRECTLY | — |
| SUB-023 | Payment trust | Success screen | Payment-success data source | `payment-success.tsx`, `plans.tsx:30-42` | Reads back persisted `payments` row after server verification; never trusts client-side callback for display | Consistent with the trust rule extended to UI | WORKING CORRECTLY | — |
| SUB-024 | Not implemented | Coupons/discounts | — | N/A | Confirmed absent | Matches web (none) | NOT IMPLEMENTED (parity) | — |
| SUB-025 | Not implemented | Subscription cancellation | — | N/A | Confirmed absent | Matches web (none) | NOT IMPLEMENTED (parity) | — |
| SUB-026 | Not implemented | Client-facing refunds | — | N/A | Confirmed absent | Matches web (none) | NOT IMPLEMENTED (parity) | — |
| SUB-027 | Additive | Admin "Log Refund Request" | Audit-log-only, no money movement | `admin-clients.ts:337-355`, `admin-clients/[id].tsx:243-246,486-501` | Writes a `client_timeline_events` row; UI discloses "does not move money" | Web has no refund concept at all, even audit-only | IMPLEMENTED BUT DIFFERENT (additive, admin-scope) | Low |
| SUB-028 | Not implemented | Invoice/receipt download | — | N/A | Confirmed absent | Matches web (none) | NOT IMPLEMENTED (parity) | — |
| SUB-029 | Ops risk | Live payment keys, unverified end-to-end | `README.md:408-413` (self-documented) | Live Razorpay keys configured; README states neither `razorpay` nor Zoom function exercised end-to-end | Test-mode keys / verified end-to-end test before real-money exposure | UNKNOWN — REQUIRES VERIFICATION | **HIGH** |
| SUB-030 | Migration | `client_onboarding` uniqueness | DB-level one-row-per-client guarantee | migration `20260912090000` | Unique index closes a race the app-code-only check couldn't | Matches web's one-time-insert guarantee | WORKING CORRECTLY | — |
| SUB-031 | Migration | `mark_missed_bookings` permission fix | Fixes a blanket-UPDATE trigger permission bug that could break booking confirmation for ALL clients | migration `20260912100000` | Adds a transaction-local flag so the system sweep bypasses the per-row trigger check | Booking confirm must not fail for unrelated clients | WORKING CORRECTLY (bug fix) | — |
| SUB-032 | Migration | Role sync on auth metadata update | Not payments/subscription-relevant | migration `20260912110000` | Fixes coach/admin provisioning role-sync race; no payments/subscriptions interaction | N/A | N/A (out of scope) | — |

### COM — Chat, Concerns, Notifications, Push, Progress (source: `audit/04-chat-concerns-notifications-progress.md`, unchanged from first pass)

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Severity |
|---|---|---|---|---|---|---|---|---|
| COM-001 | Progress | Purchase gate on logging | Blocks pre-purchase measurement logging | `progress.tsx:142-151` | Hard-gated behind active-ever subscription | Must work pre-purchase (demo-booking prerequisite) | **BROKEN** | **Critical** |
| COM-002 | Chat | Conversation auto-creation | Missing for ordinary schedule setup | `recurring-schedule.ts` (absence) | Only `coach-change-actions` creates conversations | Should auto-create on any coach assignment | NOT IMPLEMENTED | High |
| COM-003a | Notifications | Session-booked notification | Missing | `booking-wizard.ts` | No notify call in hold/confirm | WEB: client+coach notified | NOT IMPLEMENTED | High |
| COM-003b | Notifications | Session reminder (~6h) | Entire mechanism absent | — | No cron/scheduled job exists | WEB's only time-triggered notification | NOT IMPLEMENTED | High |
| COM-004 | Notifications | Several triggers unverifiable | Coach/admin-side firing points | Out of section scope | Unknown | Should exist per WEB §15 | UNKNOWN — REQUIRES VERIFICATION | Medium |
| COM-005 | Push | Token not cleared on logout | Stale-device risk | `auth-context.tsx` | No `push_tokens` delete on sign-out | Should clear/rotate | PARTIALLY IMPLEMENTED | Low-Medium |
| COM-006 | Progress | Weekly rate-limit no DB backstop | Client-side only | `progress.ts:53-65` | No trigger found | Should be DB-enforced (team's own precedent exists) | WORKING BUT INCORRECT | Medium |
| COM-007 | Chat | Coach session-notes visibility | `workout_notes` not referenced anywhere in traced client code | `bookings.ts`, `sessions.tsx` | No coach-notes display found | WEB: client sees `workout_notes.notes` read-only | (Now confirmed by ADM-003, see below) | Medium |
| COM-008 | Chat | Message-send RLS enforcement | DB-level restriction | `chat.ts` RLS | Enforced at DB layer | Matches WEB | WORKING CORRECTLY | — |
| COM-009 | Concerns | Escalation call-gate | DB trigger enforcement | migration `20260907120000` | Enforced at DB layer | Exceeds WEB's documented enforcement | WORKING CORRECTLY (exceeds WEB) | — |
| COM-010 | Notifications | Push send pipeline | DB-trigger → edge fn → Expo | `send-push/index.ts` | Fully wired, mirrors every trigger | New capability, correctly designed | WORKING CORRECTLY | — |

*(Note: COM-007's "unknown/possible missing feature" framing from the first pass is now superseded and confirmed by ADM-003 below, which independently re-traced the same question with a definitive NOT IMPLEMENTED verdict — treat ADM-003 as the authoritative finding on this specific question.)*

### ADM / NAV — Admin/Coach Cross-Dependencies, Navigation, Security, Dead Code (source: `audit/05-admin-coach-crossdeps-navigation.md`, expanded pass)

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Severity |
|---|---|---|---|---|---|---|---|---|
| ADM-001 | Coach session workflow | Attendance marking | present/late/absent → booking status | `coach-portal.ts:207-240`, `(coach)/session/[id].tsx` | Correctly upserts `attendance`, flips `bookings.status` to `missed` on absent | Same as web §10 | WORKING CORRECTLY | Info |
| ADM-002 | Coach session workflow | Session notes → completion | `submitSessionNotes()` sets `bookings.status='completed'` | `coach-portal.ts:247-273` | Correct; client cannot self-complete | Same as web §10 | WORKING CORRECTLY | Info |
| ADM-003 | Client session view | "Coach notes" display | Client sees coach's session write-up | `sessions.tsx`, `progress.tsx`, `bookings.ts`, `progress.ts` | `workout_notes` never queried by any client-facing file; `Booking` type has no notes field | Read-only "Coach notes" shown on Sessions + Progress (web §11/§22) | **NOT IMPLEMENTED** | **High** |
| ADM-004 | Admin escalations | Call-gate before resolution | DB trigger blocks status/note mutation until `called_client_at` set | migration `20260907120000`, `admin-escalations.ts` | DB trigger correctly enforces; a code comment overstates client-side enforcement (cosmetic doc mismatch only) | Must-call-before-resolve gate (web §16) | WORKING CORRECTLY | Info |
| ADM-005 | Coach-change | Request lifecycle (pending/reject/approve) | Reject + approve-blank + approve-with-coach | `admin-coach-change.ts:43-168` | Correct notifications, correct recurring-slot repoint | web §12 | WORKING CORRECTLY | Info |
| ADM-006 | Coach-change | Old-coach booking cleanup on completion | Client-self-serve + admin approve-with-coach paths | `coach-change.ts:67-78`, `coach-change-actions/index.ts:94-124`, `admin-coach-change.ts:100-148` | Neither path cancels the old coach's still-`upcoming` bookings, though a 3rd path (`transferClientCoach`) does it correctly | "cancels their still-upcoming bookings" (web §12.4) | **IMPLEMENTED BUT DIFFERENT (cross-referenced as BROKEN via SES-030)** | Medium-High |
| ADM-007 | Admin provisioning | Role assignment on account creation | `app_metadata.role`, never client-declarable | `admin-provisioning/index.ts:47-186` | Correct — caller-JWT-verified admin, role set via service-role `app_metadata` | web §4.2/§26 "role never client-settable" | WORKING CORRECTLY | Info |
| ADM-008 | Shadow coaching | Assignment + reassignment mechanics | Scoring, cascade, RPC repoint of bookings | `admin-shadow.ts` (606 lines) | Fully correct, verbatim-ported scoring algorithm, cascades correctly on chained leave | web §10 backend mechanics | WORKING CORRECTLY | Info |
| ADM-009 | Shadow coaching | Client-visible "Covering for X" banner | One-time acknowledgeable notice on Sessions | `sessions.tsx` (full file, no shadow reference) | No banner, no badge, no acknowledgment UI anywhere in client app | Banner + one-time ack on `/client/sessions` (web §10/§25) | **NOT IMPLEMENTED** | **High** |
| ADM-010 | Leave management | Coach leave → client schedule impact | Cascade reassigns bookings; client gets generic notification only | `admin-leave.ts:56-89`, `admin-shadow.ts:474-494` | Reassignment + notification work; no in-session visual continuity | Same effect as ADM-008/009 | PARTIALLY IMPLEMENTED | Low |
| ADM-011 | Renewal opportunities | Staff-side early-warning threshold | Admin + coach renewal lists | `admin-renewals.ts:11`, `coach-renewals.ts:20` | Both hardcode `SESSIONS_LOW_THRESHOLD=5`, same as client's own gate | Wider staff threshold of 10 (web §9, `RENEWAL_OPPORTUNITY_THRESHOLD`) | IMPLEMENTED BUT DIFFERENT | Low-Medium |
| ADM-012 | Notifications infra | Session reminder ~6h before session | Time-triggered email to client+coach | N/A — searched entire `supabase/functions/`, all migrations, all of `src/` | No cron/scheduled function, no `reminder_sent_at` column, no config anywhere | `/api/cron/session-reminders` equivalent (web §10/§15/§33) | **NOT IMPLEMENTED — confirmed definitively** | **High** |
| ADM-013 | Admin session/client ops | Cancel/reschedule/pause/resume/transfer/adjust-sessions | Various client-visible subscription/session mutations | `admin-clients.ts`, `admin-sessions.ts` | All correctly notify affected client/coach, admin bypasses cutoffs correctly | web §9/§10/§17 (admin overrides) | WORKING CORRECTLY | Info |
| NAV-001 | Role routing | Session→home-route dispatch | `getHomeRouteForRole()` single source of truth | `role-routing.ts:12-22`, all 5 group `_layout.tsx` files | Correct, unit-tested (4 branches incl. undefined) | Standard client/coach/admin/unsupported routing | WORKING CORRECTLY | Info |
| NAV-002 | Role routing | Unrecognized-role fallback | `unsupported-role.tsx` | `src/app/unsupported-role.tsx` | Safe non-crashing screen + sign-out; uses legacy dark theme (cosmetic mismatch only) | Defensive fallback | WORKING CORRECTLY | Info |
| NAV-003 | Tab bar | Which implementation is live | `LightTabBar` vs `FloatingTabBar` | `light-tab-bar.tsx` (4 real importers) vs `ui/floating-tab-bar.tsx` (0) | `FloatingTabBar` has zero live importers anywhere | One canonical tab bar | UNUSED-DEAD | Low |
| NAV-004 | Duplicate UI system | `ui/*` component tree overall | 17 files audited individually | `src/components/ui/*` | 14/17 fully dead (0 importers); 3/17 still live via narrow usages | Full migration to `light/*` | UNUSED-DEAD (14/17), DUPLICATED-CONFLICTING (3/17) | Low, except NAV-005 |
| NAV-005 | Duplicate UI system | `(client)/plans.tsx` `EnrolledPlansScreen` branch | Dark stack, live for every subscribed client | `plans.tsx:124-181`, `screen-scaffold.tsx`, `tappable.tsx`, `ui/glass-card.tsx`, `ui/button.tsx` | Renders full dark theme, jarring vs. the rest of the app, reached via renewal purchase flow | Should be migrated to `Light*` equivalents like `PrePurchasePlansScreen` in the same file | DUPLICATED-CONFLICTING | Medium |
| NAV-006 | Duplicate UI system | `star-rating.tsx` + dark modal overlays | `RateSessionSheet`/`CelebrationOverlay` intentionally stay dark | `ui/star-rating.tsx`, `rate-session-sheet.tsx`, `celebration-overlay.tsx` | Dark floating overlay on top of light pages, by design | Intentional exception, not a defect | WORKING CORRECTLY (intentional exception) | Info |
| NAV-007 | Gate composition | `GlobalGates` precedence/mounting | Phone → Measurement → Sessions-low, mounted once outside `Tabs` | `global-gates.tsx` | Correct precedence, single-active-at-a-time, fail-open on fetch error | web §4.7/§4.9 precedence order | WORKING CORRECTLY | Info |
| NAV-008 | Session persistence | Encrypted token storage | AES + SecureStore-wrapped-key pattern | `large-secure-store.ts` | Correct, SSR-safe, matches Supabase's documented Expo pattern | Keychain/Keystore-backed session storage (PRD §26) | WORKING CORRECTLY | Info |
| NAV-009 | Deep linking | Auth callback / recovery link parsing | `parseAuthCallback`/`parseRecoveryLink` | `auth-context.tsx`, tested (9 cases) | Correct; OAuth token pair never mistaken for recovery session | Correct deep-link routing for OAuth + password recovery | WORKING CORRECTLY | Info |
| NAV-010 | Security | Anon key / service-role separation | `supabase/client.ts` vs `supabase/functions/*` | `client.ts:15-37`; grep confirms zero `SERVICE_ROLE` references in `src/` | Correct — anon key only in client bundle, service-role confined to edge functions, each verifying caller JWT/role first | No privileged secrets in mobile bundle | WORKING CORRECTLY | Info (no CRITICAL findings) |
| NAV-011 | Dead code sweep | TODO/FIXME/XXX markers | Whole `src/` tree | — | Zero matches | — | WORKING CORRECTLY (clean) | Info |
| NAV-012 | Dead code sweep | "Not implemented"/"coming soon" markers | 4 hits, all deliberate | `(client)/coach.tsx:229`, `(client)/index.tsx:188`, `(client)/progress.tsx:169` | All correctly gap already-known web-spec absences (chat, diet, progress photos) | — | WORKING CORRECTLY (honest gap markers) | Info |

**Total: 124 matrix rows** (AUTH 20 + SES 36 + SUB 32 + COM 11 [COM-003 split a/b] + ADM 13 + NAV 12).

---

## Appendix: Positive Findings Worth Porting Back to WEB

- **Escalation call-gate as a genuine DB trigger** (ADM-004/COM-009) rather than a service-layer-only check.
- **Recurring-schedule generation shortfall is surfaced to the client** (SES-023) — WEB's own audit flags its equivalent as a silent, unresolved gap.
- **Zoom join's explicit participant-ownership check layered on top of RLS** (SES-016 area).
- **A working forgot-password/reset-password flow** (AUTH-013).
- **A well-designed push-notification pipeline** (COM-010).
- **The `mark_missed_bookings` permission-scoping fix** (SUB-031) — closes a real bug class (one overdue booking anywhere breaking booking confirmation for every client) that, per its own migration comment, is a risk inherent to any direct-to-Postgres trigger design — worth checking whether WEB's equivalent trigger has the same latent issue.
- **TOCTOU-safe purchase gate checked identically at 3 separate enforcement points** (create-order, verify-payment, webhook) using one shared counting rule (SUB-008) — a clean piece of defense-in-depth engineering.
- **Payment-success screen reads back the persisted DB record rather than ever trusting the client-side payment-gateway callback object for display** (SUB-023) — extends the "never trust client-reported success" principle further into the UI layer than the letter of the WEB spec strictly requires.
- **Clean security posture overall**: zero service-role secrets in the client bundle, zero TODO/FIXME markers, every "coming soon" placeholder is a deliberate, correctly-labeled, spec-consistent gap rather than an abandoned feature (NAV-010/011/012).
