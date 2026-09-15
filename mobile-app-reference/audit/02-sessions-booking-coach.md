# Audit Section 2: Sessions, Booking, Recurring Schedule, Coach Matching

Scope: `leanr-mobile-app` — session booking (assessment/regular), booking state machine, recurring
schedule + coach matching, coach-utilization ranking, coach profile/coach-change (client side),
cancellation/reschedule, attendance-then-notes gating, missed-session detection, Zoom join, shadow-coach
banner, credit/session-count enforcement, session rating. Compared against
`mobile-app-reference/ClientPortal.md` §10, §12, §17, §26.A, §29 and the repo's own
`LEANR_PT_MOBILE_PRD.md` / `New PRD.md` citations.

All file paths below are relative to `C:\Users\91790\Downloads\Mobile LeanR  PT\leanr-mobile-app\` unless
given in full.

---

## Functionality Inventory

| # | Function | File(s) |
|---|---|---|
| 1 | Ad-hoc hold→confirm booking (regular + assessment) | `src/lib/data/booking-wizard.ts` |
| 2 | Assessment/demo booking (authenticated) | `src/lib/data/demo-booking.ts`, `src/app/(client)/demo-booking.tsx` |
| 3 | Anonymous prospect demo booking | `supabase/functions/create-assessment-booking/index.ts`, `src/lib/data/anonymous-demo-booking.ts`, `src/app/(auth)/book-free-demo.tsx` |
| 4 | Booking reads / cancel / reschedule / rate | `src/lib/data/bookings.ts` |
| 5 | Recurring weekly pattern setup/renewal-carryover | `src/lib/data/recurring-schedule.ts` |
| 6 | Coach-utilization ranking (least-busy-first) | `src/lib/data/coach-utilization.ts` |
| 7 | Client's coach lookup (recurring → demo → null) | `src/lib/data/coach.ts` |
| 8 | Coach-change request + client-side completion | `src/lib/data/coach-change.ts`, `supabase/functions/coach-change-actions/index.ts` |
| 9 | Zoom lazy meeting creation + join gating | `src/lib/data/zoom.ts`, `supabase/functions/zoom-meeting/index.ts` |
| 10 | Sessions screen (list/cancel/rate) | `src/app/(client)/sessions.tsx` |
| 11 | Book a Session wizard | `src/app/(client)/book-session.tsx` |
| 12 | My Schedule (recurring setup wizard) | `src/app/(client)/my-schedule.tsx` |
| 13 | Renewal scheduling ("keep as-is" vs change) | `src/app/(client)/renewal-scheduling.tsx` |
| 14 | Coach profile screens | `src/app/(client)/coach.tsx` (pre-purchase + chat), `src/app/(client)/my-coach.tsx` (post-purchase + change-request) |
| 15 | Reschedule screen (3 modes) | `src/app/(client)/reschedule/[id].tsx` |
| 16 | Session rating sheet | `src/components/rate-session-sheet.tsx` |
| 17 | Home dashboard next-session/Join card | `src/app/(client)/index.tsx` |

Note: the task brief names `src/app/(client)/reviews.tsx` as the rating screen — it is not. That file is a
pre-purchase-only marketing testimonials list (redirects home once subscribed). The actual session-rating
UI is the shared `RateSessionSheet` component invoked from `sessions.tsx` and `book-session.tsx`.

---

## Booking State Machine (as implemented)

`bookings.status ∈ { upcoming, completed, cancelled, missed }` (`src/lib/data/types.ts:8`).
`bookings.session_type` is free text, `'assessment' | 'regular'` (`types.ts:17`).

| Transition | Trigger | Location | Server op |
|---|---|---|---|
| (none) → `upcoming` | Client confirms a hold (ad-hoc regular or assessment) | `booking-wizard.ts:278-299` `confirmHold()` | RPC `confirm_booking` |
| (none) → `upcoming` (×N) | Recurring pattern setup/renewal/coach-change | `recurring-schedule.ts:263-267,316-320`; `coach-change-actions/index.ts:119`; `admin-coach-change.ts:138` | RPC `generate_bookings_from_recurring_slot` |
| `upcoming` → `cancelled` | Client taps Cancel | `bookings.ts:78-98` `cancelBooking()` | RPC `cancel_booking(p_enforce_cutoff=true)` |
| `upcoming` → `upcoming` (new time) | Client reschedules (3 modes) | `bookings.ts:160-211` `rescheduleBooking()`; UI `reschedule/[id].tsx` | RPC `reschedule_booking` (4-arg or 5-arg w/ `p_new_coach_id`) |
| `upcoming` → `missed` | Time passed, no attendance | `bookings.ts:24-30` `sweepMissedBookings()`, fired on every list read | RPC `mark_missed_bookings` |
| `upcoming` → `missed` | Coach marks "Absent" | Coach-side only, out of scope; no client write path found | — |
| `upcoming` → `completed` | Coach attendance→notes workflow | Coach-side only, out of scope; **no client write path exists** (verified: no `status: 'completed'` write anywhere under `(client)` or `src/lib/data/bookings.ts`/`booking-wizard.ts`/`demo-booking.ts`) | — |
| `completed` → (rated) | Client submits rating | `bookings.ts:252-266` `rateSession()` (direct column UPDATE, not RPC) | `bookings.quality_rating/trainer_rating/rating_note/rated_at` |

Client-side writes are correctly restricted to `cancelled`/reschedule-new-`upcoming`; there is no code path
anywhere in the client scope that sets `status='completed'`, confirming the attendance-then-notes gate
(client cannot self-complete) is intact.

---

## Workflow Traces

### A. Regular session booking (ad-hoc, post-subscription)
`book-session.tsx` → pick coach (if none assigned)/date/slot → `holdSlot()` (`booking-wizard.ts:256-268`,
RPC `create_temporary_booking`) → review (10-min countdown) → `onConfirm()` → `confirmHold(holdId,
subscription.id)` (`booking-wizard.ts:278-299`, RPC `confirm_booking`, 5-arg form, `p_session_type:
'regular'`) → success screen → `/sessions`.
**Credit gate**: enforced entirely server-side inside `confirm_booking`; the mobile client never
recomputes or pre-checks a session-count limit itself (see Business Rules below).

### B. Assessment/demo booking (authenticated, in-app)
`demo-booking.tsx` → `findDemoMatch()` (`demo-booking.ts:38-50`, wraps
`getActiveCoachesByUtilization()` + `getOpenSlotsForCoachOnDate()`, first least-utilization coach with an
open slot) → `holdSlot()` → `confirmHold(holdId, null, {sessionType:'assessment', amountPaid:0})`
(`demo-booking.tsx:107`) → RPC `confirm_booking` 6-arg overload, `p_subscription_id=null` (credit check
skipped — matches ClientPortal.md §10 "skipped entirely when no subscription is attached").

### C. Recurring schedule setup (first-time / change)
`my-schedule.tsx` → pick pattern type (standard Mon/Wed/Fri, pair-any-2, custom 2-5) → pick gender/trainer
preference → `findCoachForSchedule()` (`recurring-schedule.ts:188-213`) computes common available hours
across all selected days for a ranked coach candidate list → pick hour → `onConfirm()` →
`setUpRecurringSchedule()` (`recurring-schedule.ts:273-325`): cancels existing active `recurring_slots`,
inserts one row per selected weekday, calls RPC `generate_bookings_from_recurring_slot(p_count=4)` per
row, and returns `{dayOfWeek, requested, confirmed}[]` which the UI renders verbatim, including an explicit
shortfall warning banner when `confirmed < requested` (`my-schedule.tsx:210-243`).

### D. Cancellation
`sessions.tsx` Cancel link (both pre- and post-purchase branches, `sessions.tsx:70-86,142-158`) →
confirmation `Alert` → `cancelBooking(bookingId, null)` (`bookings.ts:78-98`) → RPC `cancel_booking` with
`p_enforce_cutoff=true` → on success, notifies coach (`session_cancelled_coach`) + all admins
(`session_cancelled_admin`); the cancelling client is not notified of their own action (matches
ClientPortal.md §15).

### E. Reschedule
`reschedule/[id].tsx` — three coach-mode tabs: **My Coach** (own coach's open-slot calendar grid, filtered
by `isAfterRescheduleCutoff`), **Fastest Available** (scans utilization-ranked coaches × next 30 days for
the first eligible slot), **Substitute Coach** (up to 3 utilization-ranked alternates, excluding the
current coach, with open slots on the chosen date). All three funnel into `onPickSlot()` →
`rescheduleBooking(bookingId, newStart, duration, true, coachId?)` (`bookings.ts:160-211`) → RPC
`reschedule_booking` (4-arg, or 5-arg with `p_new_coach_id` for the substitute path, which updates
`bookings.coach_id` directly while leaving `recurring_slot_id` untouched — matches ClientPortal.md §10's
"later occurrences revert to the original coach" mechanic).

### F. Coach-change request + completion
`my-coach.tsx` → "Request change" → `requestCoachChange()` (`coach-change.ts:45-65`, plain client INSERT
into `coach_change_requests`, status defaults `pending`). Admin resolves (out of scope). Client sees
banners keyed off `status`/`new_coach_id` (`my-coach.tsx:142-156`). If `approved` with no coach picked yet
(`new_coach_id == null`), `CoachChangeCompletionCard` renders: pick ≥2 days → `findCoachForSchedule(...,
'new', 'no_preference')` → pick hour → `completeCoachChange()` (`coach-change.ts:67-78`) → edge function
`coach-change-actions` (service-role): cancels old active `recurring_slots`, inserts new ones + generates
bookings, closes old `conversations` row and opens a new one, sets `new_coach_id` on the request
(`coach-change-actions/index.ts:94-130`). **Does not cancel the client's still-`upcoming` `bookings` under
the old coach** — see Gaps below.

### G. Zoom join
`index.tsx` `EnrolledJoinRow` (`index.tsx:154-180`) computes `getJoinState(booking)` (`zoom.ts:31-40`,
purely time-window based: opens 10 min before `scheduled_start`, closes at `scheduled_start +
duration`) → if `joinable`, renders a button whose `onPress` calls `openZoomLink(booking)`
(`zoom.ts:50-54`): `assertMeasurementsFresh()` (throws if stale) → reuse `booking.zoom_join_url` if present,
else `ensureZoomMeeting(booking.id)` (invokes edge function `zoom-meeting`, which lazily creates the Zoom
meeting via Server-to-Server OAuth and writes `zoom_join_url/zoom_start_url/zoom_meeting_id` back onto the
row) → `Linking.openURL(joinUrl)`.

---

## Business Rules (cutoffs, rate limits, credit enforcement)

### Credit / session-count enforcement — THE critical check
- **Enforcement point**: entirely server-side, inside RPC `confirm_booking` (`booking-wizard.ts:296`,
  called from `confirmHold()`). The mobile client passes `p_temp_booking_id`, `p_subscription_id`,
  `p_session_type`, and (for assessment bookings) `p_amount_paid`; it does **not** pre-compute or
  duplicate a "sessions remaining" check anywhere before calling this RPC. This correctly delegates to the
  web's migration-`0053` logic (count of `upcoming + completed` bookings against `sessions_total`).
- **Display figure**: `getSessionsUsedCount()` (`src/lib/data/subscription.ts:59-67`) counts only
  `status='completed'` bookings for the subscription — deliberately the *weaker*, display-only computation,
  matching `subscription_usage_view`'s semantics. Used on `subscription.tsx:151-164` ("Sessions
  Remaining" = `sessions_total - sessionsUsed`) and `index.tsx:249` (dashboard). **This value is never fed
  back into a client-side booking-allow/deny decision** — confirmed by grep: no caller of
  `getSessionsUsedCount` gates `confirmHold`/`holdSlot`.
- **Verdict: WORKING CORRECTLY.** The mobile app preserves exactly the distinction ClientPortal.md §10/§26.A
  flags as the highest-risk item — enforcement is server-side and stricter (upcoming+completed), the
  display figure is separate and looser (completed-only), and the two are never conflated.

### Cancellation cutoff
- Default 12h, admin-configurable (`system_settings.cancellation_cutoff_hours`,
  `src/lib/data/admin-settings.ts:57,66`). **Never read by any client-facing session screen** —
  `sessions.tsx`'s Cancel action (`sessions.tsx:70-86,142-158`) calls `cancelBooking(id, null)` with the
  default `enforceCutoff=true` and lets the RPC reject past-cutoff attempts; the UI shows a generic
  `Alert.alert('Could not cancel', ...)` on rejection. No pre-computed "X hours left to cancel" chip, no
  proactive button-disable near the cutoff — contradicts ClientPortal.md §22 ("disabled past their
  respective cutoffs, with the exact cutoff timestamp shown"). Functional enforcement is intact (server
  rejects), but the UX signal described in the reference spec is absent.

### Reschedule cutoff / caps
- Default 1h, admin-configurable (`booking-wizard.ts:130` fallback `1`), correctly read live from
  `system_settings.reschedule_cutoff_hours`.
- **Weekly cap (2/week)**: computed client-side in `countReschedulesThisWeek()` (`bookings.ts:123-133`) as
  bookings with `was_rescheduled=true` AND `updated_at >= now-7d` — an explicitly-documented approximation
  (own comment: "rescheduling the exact same booking twice in one week would undercount by one"), not an
  exact timeline-event count the way ClientPortal.md §10 describes web's own implementation. This mirrors
  what the file's own comment says about the live RPC too: **the cap and same-day check are NOT enforced by
  the RPC at all** — both are client-JS-only guards, re-derived before calling `reschedule_booking`,
  exactly matching the pattern this codebase uses elsewhere ("PRD itself notes these are web-JS-only
  checks, not DB-enforced").
- **Same-day no-double-booking**: `hasAnotherUpcomingBookingOnDate()` (`bookings.ts:136-148`), IST
  calendar-day comparison against the client's other `upcoming` bookings. Client-JS-only, matching web.
- **30-day window**: UI-only bound (`RESCHEDULE_WINDOW_DAYS = 30`, `reschedule/[id].tsx:55`), not itself
  server-enforced — consistent with the file's own comment that this mirrors, not invents, the live RPC's
  actual (narrower) enforcement.
- **Substitute-coach fallback**: up to 3 alternates, correctly scoped to a single-session `coach_id`
  override that doesn't touch `recurring_slot_id` (`reschedule/[id].tsx:118-153`).

### Session rating
- Two required dimensions (quality + trainer, 1-5 stars, `RateSessionSheet.submit()` rejects if either is
  0 — `rate-session-sheet.tsx:32-36`). Matches spec.
- **Optional text note is documented but not exposed in the UI**: `RateSessionSheet` has no text input at
  all; `onSubmit({..., note: ''})` is hardcoded (`rate-session-sheet.tsx:40`), so `rating_note` is always
  written as an empty string regardless of user intent. This is a real functional gap against
  ClientPortal.md §10 ("plus an optional text note").
- **Weekly global cap**: `canRateThisWeek()` (`bookings.ts:233-242`) correctly checks the client's most
  recent `rated_at` across ALL bookings (not per-booking), matching the web's global 7-day cap.
  `sessions.tsx:200-204` calls this once per screen load and gates the "Rate session" action with an
  `Alert` if exceeded — matches spec.

### Recurring-pattern matching / generation gaps (ClientPortal.md §29)
- **Shortfall signal**: unlike web (silent under-delivery), the mobile app surfaces `{requested,
  confirmed}` per day and renders an explicit warning when short (`my-schedule.tsx:211,238-243`) — a
  **deliberate improvement**, not a silent replication of the gap.
- **Leave-agnostic pattern match**: preserved by construction — `computeCommonHours()`
  (`recurring-schedule.ts:110-136`) only ever reads `coach_availability`, never `coach_leave`; the real
  per-occurrence conflict check happens later inside `generate_bookings_from_recurring_slot`. Matches
  web's documented gap exactly (same root cause, same mitigation point).
- **Simplified fallback ladder**: the mobile app replaces web's 4-step ladder (exact pattern → exact
  pattern/any time → alternate day-pairing → alternate pairing/any time) with a single pass — "does any
  hour work across every selected day for this coach candidate" — and iterates coach candidates in
  utilization order instead of trying alternate day-pairings for the same coach. This is a documented,
  deliberate simplification (`recurring-schedule.ts:31-38`), not a bug, but it is a materially different
  algorithm from web's — see Gaps below.

---

## Coach-Matching Algorithm Trace

- **`getActiveCoachesByUtilization()`** (`coach-utilization.ts:14-39`): fetches all `active` coach_profiles
  and all `bookings` with `status='upcoming'` (no pagination/limit on either query), builds a per-coach
  count map, sorts ascending. This is the single shared implementation used by:
  - First-time demo matching (`demo-booking.ts:38-50` `findDemoMatch`)
  - First-time/no-preference recurring schedule matching (`recurring-schedule.ts:171-180`
    `listCandidateCoaches`, `recurring-schedule.ts:203-206`)
  - Reschedule "Fastest Available" and "Substitute Coach" modes (`reschedule/[id].tsx:128,183`)
  - Coach-change completion matching (`my-coach.tsx:220-226`, via `findCoachForSchedule(..., 'new', ...)`)
- Matches ClientPortal.md §10's "strict lowest-utilization-first search... first coach for whom every day
  is free... no second-best surfaced" description functionally, though the mobile app computes the
  common-availability check per selected-day-set rather than per single day/pattern slot.
- **Known-preference ladder** (`matchRecurringPattern` on web) is **not reproduced as a 4-step ladder** —
  see Business Rules above and Gaps below.
- **Gender preference**: applied as a simple filter on the ranked list (`listCandidateCoaches`,
  `recurring-schedule.ts:178`), correctly supports `male`/`female`/`no_preference`.
- **Trainer preference `'same'`**: never searches other coaches — a no-match is reported as such
  (`findCoachForSchedule`, `recurring-schedule.ts:197-201`), matching spec.

---

## Gaps vs Web Reference

1. **"Book a Session" is NOT hidden once subscribed — contradicts both the web reference AND both of this
   app's own PRDs.** `sessions.tsx:219` renders a "Book a session" primary button inside
   `EnrolledSessionsScreen` (i.e., shown to already-subscribed clients), and `index.tsx:331` does the same
   on the dashboard when there's no next booking. `book-session.tsx` itself *requires* an active
   subscription to proceed (`book-session.tsx:178-193` blocks only the *unsubscribed* case) and defaults
   `confirmHold(..., {sessionType: undefined})` → `'regular'` (`booking-wizard.ts:290`) — i.e., it performs
   real paid ad-hoc regular-session booking for subscribed clients via the hold→confirm mechanism.
   ClientPortal.md §10/§17 states unambiguously: "Once subscribed, `/client/book` redirects to
   `/client/schedule`... not just a hidden nav link." `LEANR_PT_MOBILE_PRD.md:139` ("Book a Session | ...
   | Nav (hidden once recurring plan exists)") and `:352-353` ("Only reachable pre-subscription (redirects
   to `/client/schedule` once `subscriptionId != null`)"), and `New PRD.md:55,333,1544` all independently
   state the same rule. **This is not a documented deliberate divergence — it actively contradicts the
   app's own PRD comments elsewhere in the same codebase.** Functionally this means a subscribed client can
   book ad-hoc *regular* sessions outside the recurring-schedule mechanism entirely, which the reference
   spec explicitly says should not be possible post-subscription.

2. **Coach-change completion never cancels the client's still-`upcoming` bookings under the old coach.**
   Both the client-facing edge function (`coach-change-actions/index.ts:94-100`) and the admin fast-path
   (`admin-coach-change.ts:113-121`) cancel `recurring_slots` but do not touch `bookings`. ClientPortal.md
   §12 step 4 explicitly requires: "cancels all active `recurring_slots` with the old coach **and cancels
   their still-`upcoming` bookings** (reason logged as 'Client changed coaches')." Net effect: after a
   completed coach change, the client's Sessions list can still show upcoming sessions with the old coach
   (who no longer has an active relationship with this client) alongside newly generated sessions with the
   new coach, with no de-duplication of overlapping days — the old coach also still sees those sessions on
   their own calendar.

3. **Shadow-coach banner is completely absent on the client side.** ClientPortal.md §10/§22 specifies a
   one-time acknowledgeable banner on `/client/sessions` ("Covering for {primaryCoachName} while they're
   away") when an active shadow-coach assignment covers a session's coach+date range. Grep across
   `src/app/(client)` and `src/components` for shadow-coach concepts (`shadow_coach`, "covering for") found
   **zero matches** — the feature exists only on the admin side (`src/app/(admin)/shadow.tsx`,
   `src/lib/data/admin-shadow.ts`). `sessions.tsx` has no awareness of shadow-coach assignments at all.

4. **Cancellation cutoff has no client-visible countdown or proactive disable.** Unlike Reschedule (which
   pre-filters slots via `isAfterRescheduleCutoff`), Cancel is a plain always-enabled link
   (`sessions.tsx:114-121,170-177`) that relies solely on the server RPC's rejection. ClientPortal.md §22
   describes cutoff-aware disabling with the exact cutoff timestamp shown — not implemented.

5. **Renewal "No, Change It" path offers a "no preference" gender option, which web reference says should
   not exist on renewal.** `renewal-scheduling.tsx:76-78` routes straight into the ordinary
   `my-schedule.tsx` wizard, which unconditionally offers `'male'/'female'/'no_preference'`
   (`my-schedule.tsx:304-311`). ClientPortal.md §9 states renewal's gender sub-step has "no 'no preference'
   option... unlike first-time setup." No renewal-specific variant of the gender picker exists.

6. **Coach profile card is missing fields the web reference lists as part of the "full coach card."**
   ClientPortal.md §12: "certifications[], languages[], years of experience, aggregate rating + review
   count." The mobile `CoachProfile` type (`types.ts:48-58`) and `getMyCoach()`/`getCoachProfileById()`
   (`coach.ts:18-37`) only select `id, profile_id, bio, specialization, secondary_specializations, rating`
   — no `languages`, `years_experience`, or `review_count`, even though all three columns are confirmed to
   exist on `coach_profiles` and are read elsewhere in this same codebase (`admin-coaches.ts:86,128,130`;
   `coach-performance.ts`). Neither `coach.tsx` nor `my-coach.tsx` render any of these fields.

7. **Session rating's optional text note field is never surfaced in the UI**, always submitted empty (see
   Business Rules above) — `rate-session-sheet.tsx:16-48`.

8. **Client is not notified of their own reschedule action.** `rescheduleBooking()` notifies the coach(es)
   and admins but not the client (`bookings.ts:199-210`, with an explicit comment claiming "the client
   already knows"). ClientPortal.md §10/§15 states explicitly: "The client is **always** notified of their
   own session moving, regardless of who initiated the change." This is a notification-trigger
   correctness gap directly inside a file in this audit's scope (though the broader notification system is
   subsystem 4's territory — flagged here since it's part of `rescheduleBooking()` itself).

9. **Demo re-booking has no stage-based guard.** `demo-booking.tsx:208-212` shows an informational note
   ("You already have an assessment session on record...") when `hasExistingAssessment()` is true, but does
   not block booking a second/third demo, and does not distinguish an `upcoming` demo (which web treats as
   "already booked, blocked") from a `completed`/`missed` one. In normal navigation this is mitigated
   because the CTAs that link here disappear once a demo exists (`coach.tsx:64-74`, `index.tsx:133-137`
   only show "Book Free Demo" when no coach/no next booking exists), but a direct deep-link to
   `/demo-booking` bypasses this entirely — no page-level stage check exists the way `activate.tsx`/
   `onboarding.tsx` self-guard elsewhere in this codebase.

10. **Coach-change completion (both client and admin paths) logs no `coach_changed` timeline event** and
    fires no explicit "schedule/coach changed" notification from within `coach-change-actions/index.ts` or
    `admin-coach-change.ts` beyond the conversation-switch side effect — ClientPortal.md §15 lists
    "Schedule changed / coach changed → Client, in-app + email + SMS" as a required trigger. (Notification
    dispatch is primarily subsystem 4's scope; flagged here because the missing timeline/DB-side trigger
    point lives in this audit's files.)

---

## Edge Cases Observed

- `getActiveCoachesByUtilization()` fetches **all** `bookings` rows with `status='upcoming'` with no
  limit/pagination (`coach-utilization.ts:17`) — a scale concern at high booking volume, not a correctness
  bug today.
- `getOpenSlotsForCoachOnDate()` is explicitly documented as advisory-only and does not see other clients'
  in-flight `temporary_bookings` holds (RLS-restricted); correctness is preserved because `confirm_booking`
  re-validates server-side and the UI surfaces the resulting error rather than a false success
  (`booking-wizard.ts:15-27`).
- `setUpRecurringSchedule()`/coach-change slot creation are **not atomic** across the per-day insert+
  generate loop — a mid-sequence failure can leave a partial pattern; this is disclosed in the file's own
  header comment (`recurring-schedule.ts:47-50`) rather than silently risked, and the UI reports exactly
  what succeeded via the `{requested, confirmed}` results.
- `countReschedulesThisWeek()`'s `was_rescheduled + updated_at` heuristic can undercount if the exact same
  booking is rescheduled twice within 7 days (documented limitation, `bookings.ts:110-121`).
- `my-coach.tsx` (the full profile + change-request card) is only reachable via nav once
  `hasEverPurchased` is true (`more.tsx:57-74`), correctly mirroring web's demo-coach-simplified vs.
  full-card split — but there is no independent page-level re-check the way `activate.tsx` self-guards;
  a demo-only client deep-linking directly to `/my-coach` would see the full change-request UI against
  their temporary demo coach. Low-likelihood (no in-app link produces this URL for such a client) but not
  hard-gated.
- Zoom join does not visibly disable for stale measurements the way ClientPortal.md §10 describes ("Join"
  button itself stays disabled); instead the button stays enabled and `openZoomLink()` throws inside
  `assertMeasurementsFresh()`, surfaced via `Alert.alert('Could not join', ...)` after a tap
  (`index.tsx:160-169`, `zoom.ts:50-54`). Functionally equivalent (still blocked) but a different UX pattern
  from an upfront-disabled button.
- `zoom-meeting` edge function correctly re-verifies caller participancy server-side even though RLS's
  `bookings_select_authenticated` is broad (`zoom-meeting/index.ts:93-102`) — a deliberate defense-in-depth
  check, not a gap.

---

## Matrix Rows

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Root Cause | Frontend | Backend/API | Database | Dependencies | Severity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SES-001 | Booking | Regular session confirm | Credit/session-count enforcement | `booking-wizard.ts:278-299` | Delegates entirely to RPC `confirm_booking`; no client-side pre-check or duplication | Server-side count of `upcoming+completed` vs `sessions_total` (migration 0053 parity) | WORKING CORRECTLY | — | `booking-wizard.ts` | RPC `confirm_booking` | `bookings`, `subscriptions` | — | — |
| SES-002 | Subscription display | Sessions Remaining figure | Display-only usage count, distinct from enforcement | `subscription.ts:59-67`, `subscription.tsx:151-164` | Counts `status='completed'` only; never fed into a booking gate | Same distinction as web's `subscription_usage_view` | WORKING CORRECTLY | — | `subscription.tsx` | — | `bookings`, `subscriptions` | — | — |
| SES-003 | Booking | Assessment vs regular session typing | First-real-session-is-assessment rule | `demo-booking.ts`, `booking-wizard.ts:290` | `confirmHold` defaults `session_type='regular'`; assessment path explicitly passes `'assessment', amountPaid:0` | Matches web's free/first-ever vs paid/regular split | WORKING CORRECTLY | — | `demo-booking.tsx`, `book-session.tsx` | RPC `confirm_booking` | `bookings` | — | — |
| SES-004 | Booking | Post-subscription ad-hoc booking access | "Book a Session" nav/CTA visibility | `sessions.tsx:219`, `index.tsx:331`, `book-session.tsx:178-193` | Visible and fully functional for subscribed clients; performs real paid regular-session booking | Hidden once subscribed; `/client/book` should redirect to schedule (web spec + both mobile PRDs agree) | WORKING BUT INCORRECT | Screen never checks `hasEverPurchased`/subscription before rendering the CTA | `sessions.tsx`, `index.tsx`, `book-session.tsx` | — | — | Contradicts app's own PRD | High |
| SES-005 | Booking state machine | Missed-session detection | Opportunistic sweep on every list read | `bookings.ts:24-30,33,49` | `mark_missed_bookings` RPC fired fire-and-forget before every list query | Matches web's "not a cron, runs on every booking-list read" | WORKING CORRECTLY | — | `bookings.ts` | RPC `mark_missed_bookings` | `bookings` | — | — |
| SES-006 | Booking state machine | Client cannot self-complete a session | Attendance-then-notes gating | Whole `(client)` scope + `bookings.ts` | No code path writes `status='completed'` from client code | Client cannot self-complete (coach-only, two-step) | WORKING CORRECTLY | — | — | — | `bookings` | — | — |
| SES-007 | Cancellation | Cancel cutoff UX | Cutoff enforcement vs. UI signal | `sessions.tsx:70-86,142-158`, `bookings.ts:78-98` | Cancel always enabled; server RPC rejects past cutoff with generic error alert | Button disabled past cutoff, exact cutoff timestamp shown | WORKING BUT INCORRECT | `cancellation_cutoff_hours` never fetched/used client-side | `sessions.tsx` | RPC `cancel_booking` | `system_settings` | — | Medium |
| SES-008 | Reschedule | 3-mode reschedule (own/fastest/substitute) | Full reschedule workflow | `reschedule/[id].tsx` | All 3 modes implemented, substitute correctly leaves `recurring_slot_id` untouched | Matches ClientPortal.md §10 | WORKING CORRECTLY | — | `reschedule/[id].tsx` | RPC `reschedule_booking` | `bookings` | — | — |
| SES-009 | Reschedule | Weekly cap (2/week) | Approximated via `was_rescheduled`+`updated_at`, not exact event log | `bookings.ts:110-133` | Can undercount by 1 if the same booking is rescheduled twice in 7 days | Web counts from `session_rescheduled` timeline events | WORKING BUT INCORRECT | No reschedule-event log table exists in this schema for the mobile app to read | `bookings.ts` | — | `bookings` | Documented in code | Low |
| SES-010 | Reschedule | Same-day no-double-booking | IST calendar-day conflict check | `bookings.ts:136-148` | Correctly implemented, client-JS-only (matches live RPC's actual scope) | Matches web | WORKING CORRECTLY | — | `bookings.ts` | — | `bookings` | — | — |
| SES-011 | Reschedule | Substitute-coach single-session override | `p_new_coach_id` 5-arg RPC form | `bookings.ts:160-211` | Updates `bookings.coach_id` only, `recurring_slot_id` untouched | Matches web exactly | WORKING CORRECTLY | — | `bookings.ts` | RPC `reschedule_booking` | `bookings` | — | — |
| SES-012 | Notifications (cross-boundary) | Reschedule self-notification | Client notified of own reschedule | `bookings.ts:199-210` | Client is NOT notified of their own reschedule | ClientPortal.md §10/§15: client always notified of own session moving | WORKING BUT INCORRECT | Deliberate omission per code comment, contradicts spec | `bookings.ts` | — | `notifications` | Overlaps subsystem 4 | Medium |
| SES-013 | Rating | Optional text note | Note field on rate-session sheet | `rate-session-sheet.tsx:16-48` | No text input rendered; `note` hardcoded to `''` | Optional free-text note per rating | PARTIALLY IMPLEMENTED | UI never built the note field despite header comment describing it | `rate-session-sheet.tsx` | — | `bookings.rating_note` | — | Medium |
| SES-014 | Rating | Two required dimensions, 1-5 stars | Quality + trainer rating | `rate-session-sheet.tsx:32-36` | Both required, 1-5 stars, blocks submit otherwise | Matches spec | WORKING CORRECTLY | — | `rate-session-sheet.tsx` | — | `bookings` | — | — |
| SES-015 | Rating | Global once/7-days cap | `canRateThisWeek()` across all bookings | `bookings.ts:233-242`, `sessions.tsx:200-204` | Checks most recent `rated_at` across ALL client bookings | Matches web's global weekly cap | WORKING CORRECTLY | — | `sessions.tsx` | — | `bookings` | — | — |
| SES-016 | Zoom | Lazy meeting creation | First-join creates the Zoom meeting | `zoom.ts:43-48`, `zoom-meeting/index.ts` | Idempotent; reuses existing `zoom_join_url`; participant re-verified server-side | Matches web exactly | WORKING CORRECTLY | — | `zoom.ts` | Edge fn `zoom-meeting` | `bookings` | — | — |
| SES-017 | Zoom | Join-window gating | Countdown-based join state | `zoom.ts:27-40` | Time-window only (10 min before start → scheduled end); measurement staleness checked at tap-time (throws), not pre-disabled | Web: "stays disabled unless countdown OK AND URL exists AND measurements fresh" | IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW | Button enabled, error surfaced on tap instead of upfront disable | `index.tsx`, `zoom.ts` | — | — | Functionally equivalent block | Low |
| SES-018 | Zoom | Coach-side join gate | `coach_joined_at` not used client-side | `types.ts:29` | Field exists in type but not read/used by any client screen | Web: coach-only gate, correctly N/A for client | WORKING CORRECTLY (N/A) | — | — | — | — | — | — |
| SES-019 | Coach continuity | Shadow-coach banner | Temporary coverage notice on Sessions | `sessions.tsx` (absent) | No shadow-coach awareness anywhere in client scope | ClientPortal.md §10/§22: one-time acknowledgeable banner on `/client/sessions` | NOT IMPLEMENTED | Feature only built admin-side | `sessions.tsx` | — | (shadow-coach tables, admin-only) | — | High |
| SES-020 | Recurring schedule | Pattern picker | Standard/pair/custom 2-5, Sunday excluded | `my-schedule.tsx:64-112`, `recurring-schedule.ts:63-76` | Sunday never selectable (WEEKDAYS excludes dow=0); 3 pattern types implemented | Matches web | WORKING CORRECTLY | — | `my-schedule.tsx` | — | `recurring_slots` | — | — |
| SES-021 | Coach matching | First-time/no-preference matching | Least-utilization-first | `coach-utilization.ts:14-39` | Ascending sort by upcoming-booking count, shared by all matching call sites | Matches ClientPortal.md §10 `findAvailableCoach` | WORKING CORRECTLY | — | multiple | — | `bookings`, `coach_profiles` | — | — |
| SES-022 | Coach matching | Known-preference fallback ladder | 4-step ladder (exact pattern → any time → alternate pairing → alternate/any time) | `recurring-schedule.ts:182-213` | Simplified to single "common hours across selected days" pass, no alternate day-pairing fallback | Web's `matchRecurringPattern` 4-step ladder | IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW | Deliberate simplification, documented in code | `recurring-schedule.ts` | — | `coach_availability` | Acceptable divergence per own comment | Low |
| SES-023 | Recurring generation | Shortfall signal | `{requested, confirmed}` reporting + warning UI | `recurring-schedule.ts:215,268,321`, `my-schedule.tsx:210-243` | Explicitly surfaces shortfall to client with a warning banner | Web silently under-delivers with no signal (§29 gap) | WORKING CORRECTLY (improvement) | — | `my-schedule.tsx` | RPC `generate_bookings_from_recurring_slot` | `recurring_slots`, `bookings` | Deliberate improvement over web | — |
| SES-024 | Recurring generation | Leave-agnostic pattern match | `computeCommonHours` only reads `coach_availability` | `recurring-schedule.ts:110-136` | Never checks `coach_leave`; matches web's same documented gap | ClientPortal.md §29 confirmed gap, same on both platforms | WORKING CORRECTLY (matches web gap intentionally) | Same root cause as web | `recurring-schedule.ts` | — | `coach_availability` | Parity with web, not a regression | — |
| SES-025 | Renewal | "Keep My Schedule" shortcut | One-click carryover to new subscription | `recurring-schedule.ts:227-271`, `renewal-scheduling.tsx` | Re-inserts most-recent pattern against new subscription id, regenerates bookings | Matches web | WORKING CORRECTLY | — | `renewal-scheduling.tsx` | RPC `generate_bookings_from_recurring_slot` | `recurring_slots` | — | — |
| SES-026 | Renewal | Gender "no preference" on renewal change | Renewal reuses ordinary schedule wizard | `renewal-scheduling.tsx:76-78`, `my-schedule.tsx:304-311` | "No preference" gender option present on renewal | Web: no "no preference" option on renewal | IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW | No renewal-specific gender picker variant built | `my-schedule.tsx` | — | — | — | Low |
| SES-027 | Coach profile | Pre-purchase coach states | No-coach / demo-simplified / full-card | `coach.tsx:57-113` | Correctly implements all 3 states, gated on `coach.source` | Matches ClientPortal.md §12 exactly | WORKING CORRECTLY | — | `coach.tsx` | — | `recurring_slots`, `bookings` | — | — |
| SES-028 | Coach profile | Full coach card fields | certifications/languages/years-experience/review_count | `coach.ts:18-37`, `types.ts:48-58` | Only `bio, specialization, secondary_specializations, rating` surfaced | Web full card includes languages[], years experience, review_count (columns exist, used elsewhere in this repo) | PARTIALLY IMPLEMENTED | `getCoachProfileById` select list omits these columns | `coach.tsx`, `my-coach.tsx` | — | `coach_profiles` | Columns exist, unused here | Medium |
| SES-029 | Coach change | Request lifecycle banners | pending/approved-needs-completion/approved-complete/rejected | `my-coach.tsx:102-194` | All 4 states correctly rendered | Matches ClientPortal.md §12 | WORKING CORRECTLY | — | `my-coach.tsx` | — | `coach_change_requests` | — | — |
| SES-030 | Coach change | Completion cascading effects — bookings | Cancel old-coach still-upcoming bookings | `coach-change-actions/index.ts:94-124`, `admin-coach-change.ts:113-148` | Cancels `recurring_slots` only; upcoming `bookings` with old coach are left untouched | ClientPortal.md §12 step 4: "cancels their still-upcoming bookings" | BROKEN | Edge function/admin action never issues a `bookings` cancel | `my-coach.tsx` | Edge fn `coach-change-actions` | `bookings` | Double-booking risk | High |
| SES-031 | Coach change | Completion cascading effects — chat | Close old conversation, open new one | `coach-change-actions/index.ts:122-124` | Correctly closes old, opens new | Matches web | WORKING CORRECTLY | — | — | Edge fn `coach-change-actions` | `conversations` | — | — |
| SES-032 | Coach change | Timeline/notification on completion | `coach_changed` event + notification | `coach-change-actions/index.ts`, `admin-coach-change.ts` | No timeline event logged, no explicit notification dispatched from this code | ClientPortal.md §15: "Schedule changed / coach changed" notification required | PARTIALLY IMPLEMENTED | Missing DB-side trigger point | — | Edge fn / admin action | `notifications` (not written) | Overlaps subsystem 4 | Medium |
| SES-033 | Demo booking | Re-booking guard while a demo is upcoming | Stage-aware block | `demo-booking.tsx:208-212` | Shows informational note only; does not block re-booking; no page-level stage self-guard | Web: `demo_booked` shows "already booked" blocking card | NOT IMPLEMENTED | No stage check inside the screen itself | `demo-booking.tsx` | — | `bookings` | Mitigated by nav (no CTA once booked) but deep-link bypasses it | Low |
| SES-034 | Booking wizard | Slot advisory / server re-validation | Hold→confirm with server-side re-check | `booking-wizard.ts:15-27,278-299` | Correctly advisory client-side, real conflict check happens in `confirm_booking` | Matches web's "a stale client view can never over-book" | WORKING CORRECTLY | — | `booking-wizard.ts` | RPC `confirm_booking` | `bookings`, `temporary_bookings` | — | — |
| SES-035 | Anonymous demo | Prospect (no-account) booking | Separate `assessment_sessions` mechanism | `create-assessment-booking/index.ts`, `anonymous-demo-booking.ts`, `(auth)/book-free-demo.tsx` | Fully wired, distinct table/RPC-free implementation, server-side re-validation before insert | Matches web's dual demo-booking mechanism | WORKING CORRECTLY | — | `book-free-demo.tsx` | Edge fn `create-assessment-booking` | `assessment_sessions` | — | — |
| SES-036 | Recurring schedule | Coach-utilization query scale | No pagination on `bookings`/`coach_profiles` fetch | `coach-utilization.ts:14-39` | Fetches all rows unconditionally | Not specified by web reference | UNKNOWN — REQUIRES VERIFICATION | Potential scale issue at high booking volume, not observed to fail today | multiple | — | `bookings`, `coach_profiles` | — | Low |

**Row count: 36**
