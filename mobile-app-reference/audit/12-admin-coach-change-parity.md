# Audit Section 12: Admin Coach-Change Requests — Web Parity

Scope: `leanr-mobile-app`, Admin "Coach Change Requests" module. Reference: live web source at `LeanR-PT-main/src/lib/services/coachChange.service.ts` (+ `clients.service.ts`'s `reassignClientCoach`) and `LeanR-PT-main/src/components/admin/CoachChangeRequestsClient.tsx` — read directly, not via the `ClientPortal.md` spec doc (which, per finding CCR-001 below, turned out to describe this feature imprecisely). Cross-references prior audit `05-admin-coach-crossdeps-navigation.md` finding A3/ADM-006.

---

## CCR-001 — Admin approve-with-coach: wrong mechanism, now fixed

**Prior audit's framing (A3/ADM-006) was itself imprecise.** It stated web spec §12.4 requires *"cancels all active recurring_slots with the old coach and cancels their still-upcoming bookings"* for coach-change completion generally, and flagged both the admin approve-with-coach path and the client self-serve path for not doing this. Reading the live web source directly:

- **Client self-serve completion** (`coachChange.service.ts:147-197` `completeCoachChange`, reached after admin approves *blank* and the client independently picks a **new day/time pattern**) — *does* cancel the old coach's `recurring_slots` (scoped `.eq("coach_id", request.current_coach_id)`) and their still-`upcoming` bookings (scoped `.in("recurring_slot_id", slotIds)`), then creates a fresh pattern. Cancel-and-recreate is correct here because the schedule itself is changing.
- **Admin approve-with-coach (fast path)** (`coachChange.service.ts:82-121` `resolveCoachChangeRequest` → `clients.service.ts:320-383` `reassignClientCoach`, admin picks the new coach directly, **same day/time**) — does **not** cancel anything. It **repoints** `coach_id` on the existing `recurring_slots` and `bookings` rows in place (scoped to `fromCoachId`), guarded by an availability check (blocks if the new coach has no availability on a day the client is already booked, no force override in the UI). Web's own success-modal copy confirms this: *"Active recurring slots and upcoming bookings have been moved to the new coach"* (`CoachChangeRequestsClient.tsx:147`) — moved, not cancelled/recreated.

**Mobile's actual bug**, confirmed by `git log` — the `GAP-03` fix applied in commit `13ad41b` (earlier today, after the prior audit was written) implemented the *cancel-and-recreate* shape for the admin fast path too: it cancelled **all** of the client's active `recurring_slots` and **all** upcoming bookings (unscoped by old coach — could have caught bookings with an unrelated coach, e.g. a demo session), then recreated only 4 new bookings per slot via `generate_bookings_from_recurring_slot`. This was the wrong mechanism for this specific path (destroys booking-row continuity/history, silently drops bookings beyond the first 4, no availability guard) even though it accidentally satisfied the letter of the prior audit's (imprecise) framing.

- **Status: FIXED.** `src/lib/data/admin-coach-change.ts` `approveCoachChangeRequestWithCoach` (`:124-206`) rewritten to repoint `recurring_slots`/`bookings` in place, scoped to `current_coach_id`, with the same availability-uncovered-days guard `transferClientCoach` (`admin-clients.ts`) already uses for the equivalent manual-transfer action — logic duplicated inline rather than importing cross-file (that file is owned by a parallel audit pass), kept in lockstep intentionally per the new header comment.

## CCR-002 — Client self-serve completion: over-broad booking cancellation, now fixed

`supabase/functions/coach-change-actions/index.ts`'s `complete` action (the edge-function counterpart to web's `completeCoachChange`, needed because a plain client has no UPDATE RLS on `coach_change_requests`/`conversations`) had the same `GAP-03` commit applied, but scoped incorrectly: it cancelled **all** of the client's active `recurring_slots` (any coach) and **all** upcoming bookings (any coach, any slot) via `.eq("client_id", clientId).eq("status","upcoming")` with no coach/slot scoping. Web's `completeCoachChange` scopes both cancellations specifically to `request.current_coach_id`'s slots (`.eq("coach_id", request.current_coach_id)` for slots, `.in("recurring_slot_id", slotIds)` for bookings).

- **Status: FIXED.** `supabase/functions/coach-change-actions/index.ts:77-124` now fetches the old coach's active slot ids first (`current_coach_id`, added to the request select), cancels only those, and scopes the booking cancellation to `recurring_slot_id in oldSlotIds` — matching web exactly. No-op (skips both cancellations) if `current_coach_id` is somehow null, same as the admin-side fix.

## CCR-003 — Missing client photo on request cards

Web's pending-request card shows the client's avatar photo (`CoachChangeRequestsClient.tsx:74-76`, `<Image src={r.clientPhoto} .../>`) next to their name. Mobile's `RequestCard` (`coach-change-requests.tsx`) rendered name-only, no avatar — `AdminCoachChangeRequest` didn't select `photo_url` at all.

- **Status: FIXED.** `admin-coach-change.ts`'s `listCoachChangeRequests` now selects `profiles(full_name, photo_url)` and returns `clientPhotoUrl`; the screen renders it via the existing `LightAvatar` component (same pattern already used on the Clients list screen).

## CCR-004 — List/filter structure: intentional mobile adaptation, not a gap

Web shows Pending and Resolved as two always-visible sections on one page (`CoachChangeRequestsClient.tsx:65,97`). Mobile uses a segmented-control tab (Pending/Resolved) to switch between the same two queries (`coach-change-requests.tsx:33,39-46`, `listCoachChangeRequests(status)`). Same underlying data and filter (`status='pending'` vs `status!='pending'`), different single-screen-at-a-time layout — an acceptable mobile-platform adaptation per the task's UI/UX-parity rules (functionality/data/logic identical; only presentation differs for the smaller viewport). **Status: WORKING CORRECTLY (adapted).**

## CCR-005 — Resolved-list detail: matches web

Web's resolved rows show name + status badge only (`CoachChangeRequestsClient.tsx:101-106`). Mobile's resolved rows render the same `RequestCard` (name, badge, current-coach line, reason, date) — a strict superset of web's resolved-row fields, not a gap. **Status: WORKING CORRECTLY (mobile is a superset).**

## CCR-006 — Approve-blank / reject / notifications: matches web

- Reject (`admin-coach-change.ts:65-77`) and approve-blank (`:80-98`) match web's `resolveCoachChangeRequest` non-fast-path branch (`:107-118`) — same status transitions, same client-only notification (`coach_change_request_rejected_client` / `_approved_client`).
- Approve-with-coach notifications (client `coach_changed_client`, old coach `client_transferred`, new coach `new_client_assigned`) match web's `reassignClientCoach` (`clients.service.ts:378-382`) exactly — same three template keys, same three recipients. **Status: WORKING CORRECTLY.**

## CCR-007 — Coach picker: matches web

Web's approve modal offers a `<select>` of all coaches except the client's current one, with "Let client choose after approval" as the blank/no-coach option (`CoachChangeRequestsClient.tsx:118-132`). Mobile's `showCoachPicker` panel offers the same coach set (`coach-change-requests.tsx:113-117`, filtered `c.id !== request.currentCoachId`) via a two-button split (plain "Approve" = blank, "Approve & Pick New Coach" = picker) rather than one button + inline select — same two outcomes, same coach set, different control layout (mobile adaptation). **Status: WORKING CORRECTLY (adapted).**

---

## Matrix Rows

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Root Cause | Frontend | Backend/API | Database | Dependencies | Severity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CCR-001 | Coach-change | Admin approve-with-coach completion mechanism | Repoint (not cancel+recreate) existing slots/bookings onto new coach | `src/lib/data/admin-coach-change.ts:124-206` | Fixed: repoints `recurring_slots`/`bookings` scoped to old coach, with availability guard | Match web's `reassignClientCoach` repoint behavior exactly | FIXED | Earlier same-day fix (commit 13ad41b) implemented the wrong mechanism for this specific path | Admin app | Direct Supabase writes | `recurring_slots`, `bookings`, `coach_availability` | transferClientCoach (admin-clients.ts, pattern reference only) | High |
| CCR-002 | Coach-change | Client self-serve completion booking cleanup scope | Cancel only old-coach slots/bookings, not all of client's | `supabase/functions/coach-change-actions/index.ts:77-124` | Fixed: scoped to `current_coach_id`'s slot ids | Match web's `completeCoachChange` scoping exactly | FIXED | Earlier same-day fix over-scoped the cancellation (any coach, any slot) | Client app (edge fn) | Edge function (service-role) | `recurring_slots`, `bookings`, `coach_change_requests` | — | Medium |
| CCR-003 | Coach-change | Request card client photo | Avatar shown next to client name | `src/lib/data/admin-coach-change.ts` (query), `src/app/(admin)/coach-change-requests.tsx` | Fixed: `photo_url` selected and rendered via `LightAvatar` | Match web's client photo display | FIXED | Field never selected/rendered | Admin app | — | `profiles.photo_url` (read) | — | Low |
| CCR-004 | Coach-change | List layout (pending/resolved) | Tabs vs. two always-visible sections | `src/app/(admin)/coach-change-requests.tsx:33-46` | Segmented-control tab switch | Same data, mobile-appropriate single-screen layout | WORKING CORRECTLY (adapted) | — | Admin app | — | — | — | Info |
| CCR-005 | Coach-change | Resolved row fields | Mobile shows more fields than web's resolved row | `src/app/(admin)/coach-change-requests.tsx` `RequestCard` | Superset of web's resolved fields | — | WORKING CORRECTLY | — | Admin app | — | — | — | Info |
| CCR-006 | Coach-change | Reject/approve-blank/approve-with-coach notifications | 2 vs 3 notification templates per outcome | `src/lib/data/admin-coach-change.ts:65-98,193-204` | Matches web's `resolveCoachChangeRequest`/`reassignClientCoach` template keys and recipients exactly | — | WORKING CORRECTLY | — | Admin app | Direct Supabase writes | `notifications` | — | Info |
| CCR-007 | Coach-change | Coach picker UI | Two-button split vs. inline select | `src/app/(admin)/coach-change-requests.tsx:102-126` | Same coach set (excludes current coach), same two outcomes | — | WORKING CORRECTLY (adapted) | — | Admin app | — | — | — | Info |

---

## Requires product/schema decision

None. All confirmed gaps were fixable within existing schema/conventions.
