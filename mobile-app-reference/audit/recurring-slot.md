# Plan Purchase → Activation → Recurring Schedule — Full Workflow Spec (for mobile app parity)

Source of truth: this is how the existing **web app** (Next.js + Supabase) implements the full journey from "client buys a package" through "client has a permanent weekly training slot with a coach," across the Client, Coach, and Admin portals. Replicate this exact logic in the mobile app — same states, same pattern-matching algorithm, same fallback ladder — not just the UI shape.

---

## 1. The big picture — five stages, one state machine

A client's post-signup journey is entirely driven by one server function, `getMyJourneyStateAction()` (`client-journey.actions.ts`), which computes a single `stage` enum every time the client portal loads. **Every screen (Dashboard, Book a Session, My Schedule) branches off this same stage**, not off ad-hoc local checks — this is the piece most likely to cause subtle bugs in a mobile port if approximated instead of ported exactly.

```
1. marketing            -- no subscription, no demo yet
2. demo_booked / demo_completed  -- pre-purchase waypoint (see demo_booking_workflow_brief.md)
3. awaiting_activation  -- plan purchased, start date not yet picked
4. onboarding           -- plan active, but the intake questionnaire isn't done
5. renewal_checkin | renewal_scheduling  -- ONLY for a renewing client, see §6
6. slot_selection       -- plan active, onboarding done, no recurring weekly slot yet
7. active               -- plan active + recurring slot exists -> normal dashboard
```

This document covers stages 3, 5, and 6 — **Activate → (Renewal steps) → Slot Selection** — plus the underlying recurring-slot engine that stage 6 (and renewals, and coach changes) all funnel through.

---

## 2. Stage 3 — Plan purchase & activation

### 2.1 Purchase (Razorpay checkout)
1. Client picks a package on `/client/plans`. `createPackagePurchaseOrderAction(packageId)` → `createPackagePurchaseOrder()`:
   - Rejects up front if the client already has a subscription with `status IN ('active', 'awaiting_activation')` — **one pending/active plan at a time**, checked *before* sending the client to checkout so a doomed purchase never gets that far.
   - Creates a Razorpay order + a local `payments` row (`status: 'created'`) tied to the order id, written *before* any money moves.
2. Client completes checkout in Razorpay's UI. On success, the client-side callback calls `verifyPaymentAction(orderId, paymentId, signature)` → `verifyAndFulfillPayment()`:
   - Verifies the Razorpay signature server-side. Mismatch → `payments.status = 'failed'`, hard error.
   - Idempotent: if `payments.status` is already `'paid'` (a retried callback), returns the existing result as a no-op success rather than double-fulfilling.
   - On first success, calls `purchaseMyPlan()` → `purchaseMyPlanForClient()` (§2.2), then marks the payment `paid`.
3. **Reliability fallback:** a server-to-server Razorpay webhook independently calls `fulfillPaymentByWebhook()`, which does the exact same `purchaseMyPlanForClient()` call, guarded by `if (payment.status !== 'created') return;` — so it's a no-op in the overwhelming majority of cases (the client-side callback already fulfilled it) and only matters if the browser tab died between payment capture and the callback firing. **Mobile port needs both paths**: an in-app post-checkout fulfillment call, AND a server-side webhook as the safety net — don't rely on the client callback alone.

### 2.2 What "purchase" actually creates (`purchaseMyPlanForClient`)
```
1. Reject if client has any subscription with status IN ('active', 'awaiting_activation')
   -- UNLESS the active one is "running low" (sessions_remaining <= SESSIONS_LOW_THRESHOLD = 5),
      in which case a second purchase (a renewal) is allowed to proceed.
2. Insert a new `subscriptions` row:
     status = 'awaiting_activation'
     sessions_total = package.sessions_count
     activated_at = null
3. Log timeline event `plan_purchased`.
4. Notify client: `plan_purchased_client` (plan name, sessions count).
```
No coach, no schedule, no session credits usable yet — the subscription exists but is inert until activated.

### 2.3 Activation (`/client/activate`, `activateMyPlanAction` → `activateMyPlan`)
The journey state machine only routes a client here when `stage === 'awaiting_activation'`.

**UI (`ActivatePlanClient.tsx`):** one field — Start Date, a date picker, minimum = tomorrow (IST). Copy: *"This can only be set once — your coach and session schedule will be set up right after."*

**Server rules (`activateMyPlan`):**
1. `subscriptions.activated_at` must currently be `null` — **activation is one-time and locked**; a second attempt on an already-activated subscription is rejected outright, not silently overwritten.
2. Start date must be **strictly after today, IST** (`startDate <= todayIST` → rejected) — same "no same-day" convention as every other booking/demo action in the platform.
3. On success:
   - `subscriptions.status → 'active'`, `activated_at = startDate` (stored as that date's midnight instant).
   - **Renewal cleanup:** if the client has another `subscriptions` row still `status = 'active'` (the one this purchase superseded per the §2.2 "running low" allowance), that old row is flipped to `status = 'inactive'` so it stops appearing in any `status = 'active'` filter anywhere in the app (client lists, renewal-opportunity reports, etc.). A genuinely first-time purchase has no such row — this is a no-op for it.
   - Timeline event `plan_activated` logged.
   - Notification `plan_activated_client` (start date) fires.

After activation, the journey state machine re-evaluates: no onboarding record yet → `stage = 'onboarding'`. Once onboarding is complete, it checks renewal-specific steps (§6) if this is a renewal, otherwise proceeds straight to `slot_selection` (§4) if the client has zero active `recurring_slots` rows.

---

## 3. The recurring-slot data model

One row in `recurring_slots` per **day of week** the client trains on — a client on a 3-day pattern has 3 separate rows, not one row with a days array:

```
recurring_slots
  id, client_id, coach_id, subscription_id (nullable)
  day_of_week   smallint  0=Sun .. 6=Sat
  start_time    time      "HH:MM:00", whole-hour only
  duration_minutes int    default 60 for recurring setup
  status        'active' | 'cancelled'
```

Each `recurring_slots` row is a **template**, not a booking. Actual `bookings` rows get materialized from it via `generate_bookings_from_recurring_slot(recurring_slot_id, count)` — a Postgres function that walks forward day-by-day from tomorrow, and for each date matching the slot's `day_of_week`, inserts a real `bookings` row (`session_type: 'regular'`, `status: 'upcoming'`, `recurring_slot_id` set) **unless** that date is blocked by the coach's approved leave or a scheduling conflict, stopping once `count` bookings have been generated (capped at 60 date-attempts as a safety valve).

**Generation only happens at two points — there is no background job that keeps topping up occurrences indefinitely:**
1. **At slot creation** (`createRecurringSlots` / `createRecurringSlotsForClient`) — generates the next **4** occurrences per day immediately.
2. **On cancellation of a recurring-sourced booking** (`cancel_booking` DB function) — generates exactly **1** replacement occurrence, so cancelling one session doesn't shrink the client's total scheduled count.

> **Note this precisely, it's a real (if minor) gap in the current web app worth deciding on deliberately for the mobile port:** a session that runs its course normally (marked `completed` or `missed` by the coach) does **not** trigger regeneration — only a client-initiated *cancellation* does. In practice this means a client's visible "upcoming sessions" queue for a given weekday slowly drains toward zero as sessions complete, and nothing currently refills it automatically; the existing web app has no cron/admin job that tops recurring slots back up to N-ahead. If you want the mobile app to feel more reliable than the web app here, that's a legitimate product decision to raise with the team — but if the goal is *exact parity*, replicate this as-is (generate 4 on creation, +1 per cancellation, nothing else) rather than "fixing" it silently, since a silent behavior change would make the two apps diverge.

`reschedule_booking` deliberately does **not** trigger regeneration — it moves the *same* booking row to a new time rather than cancel-and-recreate, so it doesn't touch the recurring-generation counter at all (see `cancel_reschedule_policy_workflow_brief.md` for the full reschedule policy, which applies identically to recurring-sourced and one-off bookings).

---

## 4. Stage 6 — Slot Selection (`/client/schedule`, first-time setup)

### 4.1 Screen 1: pattern + time (`ScheduleSetupClient.tsx`)

**Pattern choices** (`PatternKey`), presented as three cards up front:

| Pattern key | Days | Label shown |
|---|---|---|
| `mwf` | Mon, Wed, Fri (`[1,3,5]`) | "Mon / Wed / Fri — 3 sessions a week" |
| `tts` | Tue, Thu, Sat (`[2,4,6]`) | "Tue / Thu / Sat — 3 sessions a week" |
| `sixday` | Mon–Sat (`[1,2,3,4,5,6]`) | "6 Days a Week — Mon–Sat" |

Below these, a "Not happy with these slots?" link reveals two more options:

| Mode | Rule |
|---|---|
| **2 Days a Week** (`pair`) | One of 6 curated fixed pairs only — **not** any arbitrary 2-day combination: `[1,3] [1,5] [3,5]` (subsets of MWF) or `[2,4] [2,6] [4,6]` (subsets of TTS). |
| **Choose Your Own Days** (`custom`) | Any 2–5 days from Mon–Sat. **Sunday (`0`) can never be selected — it's a platform-wide holiday**, enforced both in the UI (day-picker only renders Mon–Sat) and server-side (`customDays.includes(0)` throws). |

**Time:** a single "Preferred Time" dropdown, populated from the live booking-window setting (`booking_window_start_hour`/`booking_window_end_hour`, default 5–22, whole hours only) — the same one hour applies to every day in the pattern; there's no per-day time customization.

### 4.2 "Check Availability" → the matching algorithm (`matchScheduleAction` → `matchRecurringPattern` / `findAvailableCoach`)

**First-time setup (client has no coach yet)** always calls `findAvailableCoach()`, which searches the **entire active coach roster**:
```
days = resolved day list for the chosen pattern (exact, no fallback pattern-widening for first-time setup)
coaches = active coach_profiles, sorted ascending by utilization % (load balancing)
for each coach in that order:
    if patternFreeAt(coach, days, preferredTime, durationMinutes):   # ALL days must be free, not just one
        return { coachId, days, timeOfDay: preferredTime }           # first fit wins, no list shown
return null   # no coach in the whole roster is free for every day in this exact pattern/time
```
`patternFreeAt` checks each `(day, time)` pair against the coach's **weekly availability template only** (`coach_availability`) plus a **collision check against every other active client's `recurring_slots`** on that same coach/day/time (`isDayTimeFreeForCoach` — deliberately uses an admin-privileged read, since a different client's `recurring_slots` row is invisible under normal RLS, and a false "free" reported to two different clients would double-book the coach's future pattern before either books gets generated). **Coach leave is deliberately NOT checked here** — leave is temporary and already handled per-occurrence, at generation time, by `generate_bookings_from_recurring_slot`; it must never block setting up a *permanent* pattern.

There is **no pattern/time fallback ladder for first-time setup** — either the exact requested pattern+time is free with some coach, or the client is told "No match found" and offered: try a 2-day pairing, try custom days, or "Notify Support" (`reportScheduleUnmatchedAction`, which just pings admin — no client-facing waitlist).

### 4.3 Confirming (`confirmScheduleAction` → `createRecurringSlots`)
```
1. For each day in the matched pattern, insert one recurring_slots row
   (coach_id, day_of_week, start_time, duration_minutes=60, subscription_id, status='active').
2. For each newly-created row, call generate_bookings_from_recurring_slot(slotId, 4)
   -- runs once per day, independently, in parallel.
3. Log timeline: 'coach_assigned' (only if this is the client's first-ever coach)
   + 'slot_assigned' (always, with the day/time summary).
4. ensureConversationForCoachAssignment(client, coach) -- auto-creates a chat
   conversation if one doesn't already exist, so "My Chats" shows this coach immediately.
5. Notify client: schedule_assigned_client. Notify coach: schedule_assigned_coach.
```
Success screen: *"Your recurring schedule is set! {days} at {time}, with {coach}. Your next few sessions have already been added to your calendar."*

### 4.4 Session duration note
Recurring-slot sessions default to **60 minutes** (`createRecurringSlots`'s `durationMinutes ?? 60`), regardless of whether it's the client's first session or their hundredth. This is a **separate** duration rule from the non-recurring "Book a Session" ad-hoc flow (`getBookingOptionsAction`), which uses 60 min only for a client's very first session and 45 min (`default_session_duration_minutes` setting) for every session after — don't conflate the two. A client with a recurring slot doesn't hit that ad-hoc path at all in normal use; it exists for one-off extra bookings outside the weekly pattern.

---

## 5. Changing an existing recurring schedule (mid-plan, not a renewal)

Once `recurring_slots` exist, `/client/schedule` renders `ChangeScheduleClient.tsx` instead of the first-time setup screen: shows the current pattern read-only, with a "Change My Schedule" button that reveals the **same `ScheduleSetupClient`**, just with `scheduleMode="change"`.

### 5.1 Extra step: Trainer Preference
Only shown in `change`/`renewal` modes, not first-time setup:

| Choice | Behavior |
|---|---|
| **Same Trainer** (default) | `matchRecurringPattern(currentCoach, ...)` — tries the exact pattern/time with the client's current coach; if that's taken, walks a fallback ladder (§5.2) **but never changes coach**. |
| **New Trainer** | `findAvailableCoach(..., excludeCoachId: currentCoach)` — exact pattern/time only, **no fallback ladder**, searched across every *other* active coach. Fails outright (no match) rather than degrading to a pair/different-time on a new coach. |
| **No Preference** | Try `matchRecurringPattern` with the current coach first (maximizes continuity); if that finds nothing, widen to `findAvailableCoach` across the whole roster (any coach, exact pattern/time only). |

### 5.2 The same-coach fallback ladder (`matchRecurringPattern`, "Same Trainer" / "No Preference" only)
This is the one place a genuine multi-step fallback exists — first-time setup and "New Trainer" both skip straight to pass/fail:
```
1. Exact pattern @ exact preferred time         -> exact: true
2. Exact pattern @ any other grid time          -> exact: false (patternUsed unchanged)
3. Same-trio 2-day pairs (both trios if pattern was "sixday") @ preferred time -> patternUsed: "pair"
4. Same-trio 2-day pairs @ any other grid time  -> patternUsed: "pair", exact: false
5. No match at all -> null (client can retry with "custom" days, or Notify Support)
```
The UI always shows `exact: false` results as "Closest available match" rather than silently substituting — the client sees exactly what changed from their request before confirming.

### 5.3 Committing a change (`changeScheduleAction` → `changeMyRecurringSchedule`)
Unlike first-time setup (pure add), this is **retire-then-recreate**:
```
1. Find all of the client's current status='active' recurring_slots.
2. Deactivate them (status -> 'cancelled').
3. Cancel every still-upcoming `bookings` row generated from those slots
   (cancel_reason: "Client changed their recurring schedule") -- frees the old coach's calendar.
4. Create the new pattern via the same createRecurringSlots() path as first-time setup
   (new recurring_slots rows, generate 4 occurrences each, timeline log, chat, notifications).
```
No reschedule-cutoff applies to this flow at all — it's the client's own deliberate schedule change, not an action on an existing booking, so `cancel_reschedule_policy_workflow_brief.md`'s cutoff rules are irrelevant here.

---

## 6. Renewal — the one case with two extra journey stages

`checkRenewalStage()` runs only when the client's latest subscription is **not** their first-ever subscription (i.e. an older `subscriptions` row exists for this client). It returns one of two blocking stages, checked in order, or `null` (proceed to normal `slot_selection`/`active` flow):

1. **`renewal_checkin`** — no `progress_logs` entry since `activated_at`. Gate: the client must log fresh measurements before continuing (shares the same staleness convention as demo booking and ad-hoc session booking).
2. **`renewal_scheduling`** — no `recurring_slots` row exists with `subscription_id` equal to the *new* subscription's id. Note this is deliberately **not** "does the client have any active recurring slot" — their *old* slots still point at the now-retired subscription, which would otherwise satisfy a generic check and skip this step entirely.

### 6.1 Renewal scheduling screen (`ScheduleSetupClient`, `scheduleMode="renewal"`)
Adds a first decision screen ("ask") on top of everything in §5:
> *"Keep training with {coach} at {existing days/time}?"* — **Keep My Schedule** vs **No, Change It**.

- **Keep My Schedule** → `keepRenewalScheduleAction` → `keepRenewalSchedule()`: the client's *existing* active `recurring_slots` rows are simply **repointed** (`subscription_id` updated to the new subscription's id) — coach, days, time all carry over completely untouched, zero bookings cancelled or regenerated. Timeline event `plan_renewed` ("Kept the same trainer and schedule"). This is the cheapest, most common renewal path.
- **No, Change It** → reveals the normal `change`-mode picker (§5), except:
  - Only **Same Trainer** / **New Trainer** are offered — **no "No Preference" option** for renewals (narrower than the regular mid-plan change flow, a deliberate product choice).
  - Choosing **New Trainer** also reveals a **Gender Preference** selector (Male/Female/Other/No Preference) — reuses the same gender filter demo-booking uses — passed through to `findAvailableCoach`.
  - Confirming calls `changeScheduleAction` with `subscriptionId` set to the *new* subscription — `changeMyRecurringSchedule` then bills the freshly-created pattern against the renewal, and logs `plan_renewed` (not the generic `session_rescheduled` label used for a non-renewal schedule change) so the timeline correctly reflects a renewal event.

---

## 7. Coach Portal — what the coach sees through this whole flow

Coaches have **no active role** in purchase/activation/slot-selection — it is entirely client-self-service, auto-matched. The coach's involvement is:
- **Notifications:** `schedule_assigned_coach` (new pattern created), `schedule_changed_coach` (pattern changed).
- **Their calendar simply fills up** as `generate_bookings_from_recurring_slot` inserts real `bookings` rows against their `coach_id` — no approval step, no "accept this client" action exists.
- **Coach availability (`coach_availability`)** is the one thing a coach *does* control that feeds directly into this engine — it's the weekly template every pattern-matching check (`isDayTimeFreeForCoach`, `is_slot_within_working_hours`) reads against. A coach who hasn't set availability for a given day/time will never be matched to a client requesting that day/time, silently (from the client's perspective) — they just don't show up as a candidate.
- **Coach leave (`coach_leave`)** doesn't block a *new* pattern being set up against them (§4.2's "leave deliberately NOT checked" note) but does block individual future *occurrences* from generating during the leave window, and can trigger the separate Shadow Coach coverage mechanism (admin-assigned stand-in coach for specific dates — out of scope for this doc; it's a continuity feature layered on top of, not part of, the core recurring-slot engine).

---

## 8. Admin Portal workflow

Admin has two distinct entry points into this system, neither of which a client ever sees:

### 8.1 Coach reassignment (`reassignClientCoach` — fast path, same day/time)
Used for admin-driven coach swaps (e.g. resolving a `coach_change_requests` row directly, or an admin coach-detail "Reassign Clients" bulk action) where the **day/time pattern stays identical**, only the coach changes:
```
1. Read the client's active recurring_slots currently pointing at the OLD coach.
2. findUncoveredDays: check the NEW coach's availability template covers every one
   of those day/times. If not, and `force` wasn't passed, reject with a specific
   list of uncovered days -- admin must either fix the new coach's availability
   first, or explicitly confirm the transfer anyway (force: true).
3. Update recurring_slots.coach_id AND every still-upcoming bookings.coach_id
   (WHERE client_id/coach_id match) to the new coach, in one pass -- no
   cancel/regenerate cycle, the same booking rows just move to the new coach.
4. Notify the client (coach_changed_client).
```
This is **structurally different** from a client's own "New Trainer" schedule change (§5.1) — that one retires and recreates the pattern (because the client might also be changing days/time); this one just repoints `coach_id` in place because the day/time is guaranteed unchanged.

### 8.2 Coach-change request flow (client-initiated, admin-approved)
1. Client submits `requestCoachChange()` (reason + optional rating/feedback) → `coach_change_requests` row, `status: 'pending'`.
2. Admin reviews (`listCoachChangeRequests`) and either:
   - **Rejects** → `coach_changed_request_rejected_client` notification, nothing else changes.
   - **Approves with a specific coach picked** → immediately calls `reassignClientCoach` (§8.1's fast path) — same day/time, new coach, done in one step.
   - **Approves with no coach picked** → flips to `status: 'approved'`, client is notified, and must self-serve pick a new pattern: `findCoachChangeOptions()` (exact pattern/time only, whole roster minus current coach — no fallback ladder, mirrors "New Trainer") → `completeCoachChange()`, which **retires the old pattern and creates a new one** (same retire-then-recreate shape as §5.3, since the client is choosing a whole new day/time here, not just a new coach for the same slot) and logs `coach_changed` on the timeline.

### 8.3 Admin migrated-client onboarding (bypasses the whole client-facing flow)
A separate admin-only path (`createMigratedClientAction` → `createMigratedClient`) exists for bulk-importing an existing client roster (e.g. from a spreadsheet) directly into an **active** state — no purchase, no activation screen, no self-service pattern matching:
```
1. Admin creates the client's auth account + profile directly.
2. Inserts an ALREADY-ACTIVE subscription with sessions_total = sessions the client
   has REMAINING (not their original plan size -- this system has no history of
   sessions already used elsewhere; using the original size would silently
   overcredit them). Original plan size, if given, is preserved only as a
   descriptive timeline note.
3. Optionally, in the SAME action: a schedule (coachId, days, timeOfDay) that was
   already validated via checkAdminSlotAssignment() (§8.4) BEFORE this call --
   createMigratedClient trusts that check happened and does not re-verify.
```

### 8.4 Admin manual slot-availability check (`checkAdminSlotAssignment`)
The admin-driven sibling of `findAvailableCoach` — used when admin (not the client) is picking a specific coach + day/time pattern (the migrated-client flow above). Unlike the client-facing matcher, on failure it doesn't just say "no" — it surfaces concrete alternatives:
```
1. Check the ADMIN-CHOSEN coach for the ADMIN-CHOSEN days/time (same patternFreeAt
   check as everywhere else). If free -> available: true, done.
2. If not free: compute up to 5 alternative times for that SAME coach across the
   whole pattern, sorted by closeness to the requested time.
3. Also compute up to 5 OTHER active coaches who ARE free for the exact
   requested days/time.
4. Return both lists so admin can choose instead of guessing.
```

### 8.5 Read-only admin visibility
- `/admin/scheduling` — "Manual Sessions Created" section covers ad-hoc bookings; recurring-slot-generated bookings show up in the general session lists tagged by `recurring_slot_id` (or its absence — a booking with `recurring_slot_id === null` is "manually added," per `admin-session-detail.actions.ts`'s `wasManuallyAdded` flag).
- `/admin/coaches/[id]` — 7-day slot calendar (`getCoachWeekCalendar`) showing every grid slot as open/booked/unavailable, including which client holds each booked slot and whether it was rescheduled — built from the same availability/leave logic as the client-facing `getOpenSlots`, kept deliberately consistent.
- `/admin/availability-check` — cross-coach, single-day, every working-hour slot for every active coach at once, labeled booked/free (and for free slots, whether it was previously booked-then-cancelled and by whom) — the admin tool for "who's free right now across the whole team."

---

## 9. Key business rules to replicate exactly (checklist)

1. **One pending/active subscription at a time**, with a single renewal exception: a second purchase is allowed only while the current active plan's `sessions_remaining <= 5`.
2. **Activation is one-time and irreversible** — `activated_at` being non-null blocks a second activation call outright, no overwrite.
3. **No same-day activation** — start date must be strictly after today, IST, mirroring every other "no same-day" rule in the platform (demo booking, ad-hoc booking).
4. **Renewal retires the old subscription** the moment the new one activates (`status -> 'inactive'`), so exactly one subscription per client ever reads as `active` at a time.
5. **`recurring_slots` is one row per day-of-week**, not one row per client — a 3-day pattern is 3 rows sharing the same `coach_id`/`subscription_id`/`start_time` but different `day_of_week`.
6. **Sunday is never bookable** for a recurring pattern — enforced both client-side (day picker) and server-side (explicit rejection), for both `custom` days and every curated pattern (none of `mwf`/`tts`/`sixday`/the 6 pairs include Sunday).
7. **2-day patterns are 6 curated pairs only**, not any arbitrary 2-of-6 combination — `custom` mode is the only path to a non-curated day combination (and custom requires 2–5 days).
8. **First-time setup and "New Trainer" changes are exact-match-or-fail** — no pattern-widening/time-widening fallback. Only "Same Trainer"/"No Preference" on an *existing* client get the multi-step fallback ladder (exact → other time → pairs → pairs at other time).
9. **A whole pattern must be free with one coach** — matching checks every day in the pattern against the same candidate coach; a coach free for 2 of 3 requested days is not a match.
10. **Coach ranking is always by ascending utilization %** wherever a "search the whole roster" match happens (first-time setup, "New Trainer", "No Preference" widening, admin's alternative-coach suggestions) — load-balances new clients across the coach pool rather than piling onto whoever's first alphabetically/by id.
11. **Coach leave never blocks setting up a new permanent pattern** — only individual occurrence generation and per-instant booking checks consider leave. This is deliberate, not an oversight: a temporary leave shouldn't reject a permanent recurring commitment.
12. **Changing a schedule (mid-plan or via coach-change-with-new-pattern) is always retire-then-recreate**, never an in-place edit of `recurring_slots` — old slots are cancelled, their still-upcoming bookings are cancelled, then a fresh set is created. The one exception is renewal's "Keep My Schedule," which repoints `subscription_id` on the *existing* slots with zero cancellation, and admin's fast-path coach reassignment, which repoints `coach_id` in place for both slots and bookings without touching the day/time at all.
13. **Recurring-slot occurrences are only generated at slot-creation (4 ahead) and on cancellation (+1 replacement)** — nothing tops the count back up as sessions simply complete. Decide deliberately whether the mobile port should copy this as-is or improve it; don't let it happen as an unnoticed divergence either way.
14. **Recurring-slot default session length is 60 minutes**, independent of the separate 45-minute default that applies only to non-recurring, one-off "Book a Session" bookings after a client's first session.
15. **Admin bypasses client-self-service matching entirely** for coach reassignment (same day/time, just repoints `coach_id`, subject only to the new coach's availability covering the existing days — overridable with `force`) and for migrated-client onboarding (active subscription + optional schedule created directly, no purchase/activation/slot-selection screens involved at all).

---

## 10. Suggested mobile implementation shape

- One server function (`getMyJourneyState`) as the **single gate** every client screen reads from — resist the temptation to let individual screens compute their own "do I have a schedule yet" checks; that's exactly the kind of drift `demo_booking_workflow_brief.md` and `cancel_reschedule_policy_workflow_brief.md` both warn about elsewhere in this codebase.
- `recurring_slots` as one row per weekday, `bookings.recurring_slot_id` as the link back — keep occurrence-generation as an explicit, callable function (not baked into booking-creation code), since it's invoked from three different call sites (initial setup, cancellation backfill, and potentially a future top-up job if you choose to add one).
- Pattern constants (`DAY_GROUPS`, `PAIRS_MWF`, `PAIRS_TTS`) as plain shared constants importable by both server logic and client UI, exactly as this codebase splits them into `lib/constants/scheduling.ts` specifically so the client bundle doesn't need to pull in server-only matching code.
- Keep the **three distinct matching functions** conceptually separate even if you implement them with shared helpers: (a) first-time/new-trainer exact-match-only search across the whole roster, (b) same-trainer fallback ladder, (c) admin manual-assignment check-with-alternatives. Collapsing them into one "smart" matcher risks silently changing which flows get a fallback ladder and which don't — that distinction is a deliberate product rule (§9.8), not an implementation detail.
- Model retire-then-recreate vs. repoint-in-place as two clearly different code paths (`changeMyRecurringSchedule`/`completeCoachChange` vs. `keepRenewalSchedule`/`reassignClientCoach`) rather than one generic "update schedule" function with branches — they have materially different effects on the client's existing upcoming bookings (cancelled-and-regenerated vs. untouched).

---

## 11. Actual source code (reference implementation)

Given verbatim so the mobile build can be a faithful line-for-line port. Framework/DB-client specifics (Supabase RPC, Postgres `plpgsql`, Next.js server actions) should be adapted to whatever stack the mobile backend uses; the algorithm/order-of-operations should not change.

### 11.1 Activation (`planPurchase.service.ts`)

```ts
export async function purchaseMyPlanForClient(clientId: string, packageId: string, actorId: string | null) {
  const before = await getClientStatusSnapshot(clientId);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status")
    .eq("client_id", clientId)
    .in("status", ["active", "awaiting_activation"])
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    let isRenewable = false;
    if (existing.status === "active") {
      const { data: usage, error: usageError } = await supabaseAdmin
        .from("subscription_usage_view")
        .select("sessions_remaining")
        .eq("subscription_id", existing.id)
        .maybeSingle();
      if (usageError) throw usageError;
      isRenewable = ((usage as any)?.sessions_remaining ?? Infinity) <= SESSIONS_LOW_THRESHOLD;
    }
    if (!isRenewable) throw new Error("You already have an active or pending plan.");
  }

  const { data: pkg, error: pkgError } = await supabaseAdmin.from("package_tiers").select("name, sessions_count").eq("id", packageId).eq("is_active", true).single();
  if (pkgError || !pkg) throw pkgError ?? new Error("Package not found");

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .insert({ client_id: clientId, package_id: packageId, sessions_total: pkg.sessions_count, status: "awaiting_activation" })
    .select()
    .single();
  if (error) throw error;

  await logTimelineEvent(clientId, "plan_purchased", `Purchased ${pkg.name}`, {
    description: `${pkg.sessions_count} sessions -- awaiting activation`,
    actorId,
    metadata: { subscriptionId: data.id, packageId },
  });
  await logClientStatusChange(clientId, before, actorId);

  const notifyCtx = await resolveSessionNotifyContext(clientId);
  await notifyClient(notifyCtx, "plan_purchased_client", { plan_name: pkg.name, sessions_left: String(pkg.sessions_count) });

  return data;
}

export async function activateMyPlan(accessToken: string, subscriptionId: string, startDate: string) {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["client"]);

  const { data: sub, error: subError } = await supabaseAdmin.from("subscriptions").select("id, client_id, activated_at, status").eq("id", subscriptionId).single();
  if (subError || !sub) throw subError ?? new Error("Subscription not found");
  if (sub.activated_at) throw new Error("This plan has already been activated.");
  const before = await getClientStatusSnapshot(sub.client_id);

  const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (startDate <= todayIST) {
    throw new Error("Start date must be at least tomorrow -- same-day start isn't available.");
  }

  const { data: client, error: clientError } = await ctx.client.from("client_profiles").select("id").eq("profile_id", ctx.userId).single();
  if (clientError || !client || client.id !== sub.client_id) throw new Error("Not your subscription");

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: "active", activated_at: new Date(startDate).toISOString() })
    .eq("id", subscriptionId)
    .select()
    .single();
  if (error) throw error;

  const { data: oldSub, error: oldSubError } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("client_id", sub.client_id)
    .eq("status", "active")
    .neq("id", subscriptionId)
    .maybeSingle();
  if (oldSubError) throw oldSubError;
  if (oldSub) {
    const { error: retireError } = await supabaseAdmin.from("subscriptions").update({ status: "inactive" }).eq("id", oldSub.id);
    if (retireError) throw retireError;
  }

  await logTimelineEvent(sub.client_id, "plan_activated", "Plan activated", {
    description: `Start date: ${startDate}`,
    actorId: ctx.userId,
    metadata: { subscriptionId },
  });
  await logClientStatusChange(sub.client_id, before, ctx.userId);

  const notifyCtx = await resolveSessionNotifyContext(sub.client_id);
  await notifyClient(notifyCtx, "plan_activated_client", { start_date: startDate });

  return data;
}

export async function checkRenewalStage(
  accessToken: string,
  input: { clientId: string; subscriptionId: string; activatedAt: string | null }
): Promise<"renewal_checkin" | "renewal_scheduling" | null> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["client"]);

  const { data: olderSubs, error: olderError } = await ctx.client
    .from("subscriptions")
    .select("id")
    .eq("client_id", input.clientId)
    .neq("id", input.subscriptionId)
    .limit(1);
  if (olderError) throw olderError;
  if (!olderSubs || olderSubs.length === 0) return null;

  if (input.activatedAt) {
    const { data: logs, error: logsError } = await ctx.client
      .from("progress_logs")
      .select("id")
      .eq("client_id", input.clientId)
      .gte("logged_at", input.activatedAt)
      .limit(1);
    if (logsError) throw logsError;
    if (!logs || logs.length === 0) return "renewal_checkin";
  }

  const { data: slots, error: slotsError } = await ctx.client
    .from("recurring_slots")
    .select("id")
    .eq("client_id", input.clientId)
    .eq("subscription_id", input.subscriptionId)
    .limit(1);
  if (slotsError) throw slotsError;
  if (!slots || slots.length === 0) return "renewal_scheduling";

  return null;
}
```

### 11.2 Journey state machine (`client-journey.actions.ts`)

```ts
export type ClientJourneyStage =
  | "marketing" | "demo_booked" | "demo_completed"
  | "awaiting_activation" | "onboarding"
  | "renewal_checkin" | "renewal_scheduling" | "slot_selection" | "active";

export async function getMyJourneyStateAction(): Promise<ActionResult<ClientJourneyState>> {
  return runAction(async () => {
    const token = await requireToken();
    const sub: any = await getMyLatestSubscription(token);

    if (sub) {
      if (sub.status === "awaiting_activation") {
        return { stage: "awaiting_activation", subscriptionId: sub.id, packageName: sub.package?.name ?? null, demoSession: null };
      }
      if (sub.status === "active") {
        const onboarding = await getMyOnboarding(token);
        if (!onboarding) return { stage: "onboarding", subscriptionId: sub.id, packageName: sub.package?.name ?? null, demoSession: null };

        const renewalStage = await checkRenewalStage(token, {
          clientId: sub.client_id,
          subscriptionId: sub.id,
          activatedAt: sub.activated_at,
        });
        if (renewalStage) return { stage: renewalStage, subscriptionId: sub.id, packageName: sub.package?.name ?? null, demoSession: null };

        const slots = await getMyActiveRecurringSlots(token);
        if (!slots || slots.length === 0) {
          return { stage: "slot_selection", subscriptionId: sub.id, packageName: sub.package?.name ?? null, demoSession: null };
        }
        return { stage: "active", subscriptionId: sub.id, packageName: sub.package?.name ?? null, demoSession: null };
      }
      // paused/inactive with no newer subscription falls through -- treat as no subscription.
    }

    const demoSession = await getMyLatestDemoSession(token);
    if (demoSession) {
      return {
        stage: demoSession.status === "upcoming" ? "demo_booked" : "demo_completed",
        subscriptionId: null, packageName: null, demoSession,
      };
    }

    return { stage: "marketing", subscriptionId: null, packageName: null, demoSession: null };
  });
}
```

### 11.3 DB functions: generation + booking primitives (`0011_scheduling_functions.sql`, `0026_fix_ist_timezone_and_missed_sweep.sql`)

```sql
create or replace function generate_bookings_from_recurring_slot(
  p_recurring_slot_id uuid, p_count int default 1
)
returns setof uuid
language plpgsql
as $$
declare
  slot recurring_slots%rowtype;
  candidate_date date;
  candidate_start timestamptz;
  generated int := 0;
  attempts int := 0;
  new_id uuid;
begin
  select * into slot from recurring_slots where id = p_recurring_slot_id;
  if not found or slot.status <> 'active' then
    return;
  end if;

  candidate_date := current_date + 1;
  while generated < p_count and attempts < 60 loop
    attempts := attempts + 1;
    if extract(dow from candidate_date)::int = slot.day_of_week then
      candidate_start := candidate_date + slot.start_time;
      if not exists (
        select 1 from coach_leave
        where coach_id = slot.coach_id and status = 'approved'
          and candidate_date between starts_on and ends_on
      )
      and not exists (
        select 1 from bookings where recurring_slot_id = p_recurring_slot_id and scheduled_start = candidate_start
      )
      and not has_scheduling_conflict(slot.coach_id, candidate_start, slot.duration_minutes)
      then
        insert into bookings (
          client_id, coach_id, subscription_id, recurring_slot_id,
          scheduled_start, duration_minutes, session_type, status
        ) values (
          slot.client_id, slot.coach_id, slot.subscription_id, p_recurring_slot_id,
          candidate_start, slot.duration_minutes, 'regular', 'upcoming'
        )
        returning id into new_id;

        generated := generated + 1;
        return next new_id;
      end if;
    end if;
    candidate_date := candidate_date + 1;
  end loop;
  return;
end;
$$;
```

Note: dates/times are combined through `Asia/Kolkata` wall-clock semantics (see migration `0026`'s fix comment) — naively concatenating `date + time` into a `timestamptz` without naming the timezone stores it in the DB session's timezone (UTC), producing a session that displays at the wrong wall-clock hour for every real IST user. Whatever the mobile backend's date/time library is, force an explicit IST offset when converting a business-local `(date, time)` pair into an instant — never rely on an implicit server-timezone default.

### 11.4 Pattern matching (`scheduling.service.ts`)

```ts
export type PatternKey = "mwf" | "tts" | "sixday" | "custom";

export const DAY_GROUPS = {
  mwf: [1, 3, 5],
  tts: [2, 4, 6],
  sixday: [1, 2, 3, 4, 5, 6],
} as const;

export const PAIRS_MWF: number[][] = [[1, 3], [1, 5], [3, 5]];
export const PAIRS_TTS: number[][] = [[2, 4], [2, 6], [4, 6]];

async function isDayTimeFreeForCoach(coachId: string, dayOfWeek: number, timeOfDay: string, durationMinutes: number): Promise<boolean> {
  const [h, m] = timeOfDay.split(":").map(Number);
  const startMin = h * 60 + m;
  const endMin = startMin + durationMinutes;

  const { data: windows, error: availError } = await supabaseAdmin
    .from("coach_availability")
    .select("start_time, end_time")
    .eq("coach_id", coachId)
    .eq("day_of_week", dayOfWeek)
    .eq("is_active", true);
  if (availError) throw availError;
  const withinTemplate = (windows ?? []).some((w) => {
    const [wsH, wsM] = w.start_time.split(":").map(Number);
    const [weH, weM] = w.end_time.split(":").map(Number);
    return startMin >= wsH * 60 + wsM && endMin <= weH * 60 + weM;
  });
  if (!withinTemplate) return false;

  const { data: collisions, error: collisionError } = await supabaseAdmin
    .from("recurring_slots")
    .select("id")
    .eq("coach_id", coachId)
    .eq("day_of_week", dayOfWeek)
    .eq("start_time", `${timeOfDay}:00`)
    .eq("status", "active")
    .limit(1);
  if (collisionError) throw collisionError;
  return (collisions ?? []).length === 0;
}

async function patternFreeAt(coachId: string, days: number[], timeOfDay: string, durationMinutes: number): Promise<boolean> {
  for (const day of days) {
    if (!(await isDayTimeFreeForCoach(coachId, day, timeOfDay, durationMinutes))) return false;
  }
  return true;
}

export async function findAvailableCoach(
  accessToken: string,
  input: { pattern: PatternKey; preferredTime: string; customDays?: number[]; durationMinutes?: number; excludeCoachId?: string; genderPreference?: "male" | "female" | "other" }
): Promise<CoachMatchResult | null> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["client"]);
  const durationMinutes = input.durationMinutes ?? 60;

  let days: number[];
  if (input.pattern === "custom") {
    if (!input.customDays || input.customDays.length < 2 || input.customDays.length > 5) {
      throw new Error("Custom schedule needs between 2 and 5 days");
    }
    if (input.customDays.includes(0)) {
      throw new Error("Sunday is a holiday and isn't available for scheduling.");
    }
    days = input.customDays;
  } else {
    days = [...DAY_GROUPS[input.pattern]];
  }

  let coachQuery = ctx.client.from("coach_profiles").select("id").eq("status", "active");
  if (input.excludeCoachId) coachQuery = coachQuery.neq("id", input.excludeCoachId);
  if (input.genderPreference) coachQuery = coachQuery.eq("gender", input.genderPreference);
  const [{ data: coaches, error: coachesError }, { data: util, error: utilError }] = await Promise.all([
    coachQuery,
    ctx.client.from("coach_utilization_view").select("coach_id, utilization_pct"),
  ]);
  if (coachesError) throw coachesError;
  if (!coaches || coaches.length === 0) return null;
  if (utilError) throw utilError;
  const utilByCoach = new Map((util ?? []).map((u) => [u.coach_id, u.utilization_pct]));

  const sorted = [...coaches].sort((a, b) => (utilByCoach.get(a.id) ?? 0) - (utilByCoach.get(b.id) ?? 0));

  for (const coach of sorted) {
    if (await patternFreeAt(coach.id, days, input.preferredTime, durationMinutes)) {
      return { coachId: coach.id, days, timeOfDay: input.preferredTime };
    }
  }
  return null;
}

export async function matchRecurringPattern(
  accessToken: string,
  input: { coachId: string; pattern: PatternKey; preferredTime: string; customDays?: number[]; durationMinutes?: number }
): Promise<PatternMatchResult | null> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["client"]);
  const durationMinutes = input.durationMinutes ?? 60;
  const { startHour, endHour } = await getBookingWindow(accessToken);
  const grid = hourlyGrid(startHour, endHour);

  if (input.pattern === "custom") {
    if (!input.customDays || input.customDays.length < 2 || input.customDays.length > 5) {
      throw new Error("Custom schedule needs between 2 and 5 days");
    }
    if (input.customDays.includes(0)) {
      throw new Error("Sunday is a holiday and isn't available for scheduling.");
    }
    if (await patternFreeAt(input.coachId, input.customDays, input.preferredTime, durationMinutes)) {
      return { days: input.customDays, timeOfDay: input.preferredTime, patternUsed: "custom", exact: true };
    }
    for (const t of grid) {
      if (t === input.preferredTime) continue;
      if (await patternFreeAt(input.coachId, input.customDays, t, durationMinutes)) {
        return { days: input.customDays, timeOfDay: t, patternUsed: "custom", exact: false };
      }
    }
    return null;
  }

  const days = [...DAY_GROUPS[input.pattern]];

  if (await patternFreeAt(input.coachId, days, input.preferredTime, durationMinutes)) {
    return { days, timeOfDay: input.preferredTime, patternUsed: input.pattern, exact: true };
  }
  for (const t of grid) {
    if (t === input.preferredTime) continue;
    if (await patternFreeAt(input.coachId, days, t, durationMinutes)) {
      return { days, timeOfDay: t, patternUsed: input.pattern, exact: false };
    }
  }

  const pairsToTry = input.pattern === "tts" ? PAIRS_TTS : input.pattern === "mwf" ? PAIRS_MWF : [...PAIRS_MWF, ...PAIRS_TTS];
  for (const pair of pairsToTry) {
    if (await patternFreeAt(input.coachId, pair, input.preferredTime, durationMinutes)) {
      return { days: pair, timeOfDay: input.preferredTime, patternUsed: "pair", exact: false };
    }
  }
  for (const pair of pairsToTry) {
    for (const t of grid) {
      if (t === input.preferredTime) continue;
      if (await patternFreeAt(input.coachId, pair, t, durationMinutes)) {
        return { days: pair, timeOfDay: t, patternUsed: "pair", exact: false };
      }
    }
  }

  return null;
}
```

### 11.5 Creating the slots (`scheduling.service.ts`)

```ts
export async function createRecurringSlots(
  accessToken: string,
  input: { coachId: string; days: number[]; timeOfDay: string; durationMinutes?: number; subscriptionId?: string }
): Promise<string[]> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["client"]);
  const { data: client, error: clientError } = await ctx.client.from("client_profiles").select("id").eq("profile_id", ctx.userId).single();
  if (clientError || !client) throw clientError ?? new Error("Client profile not found");

  const { data: priorSlot } = await ctx.client.from("recurring_slots").select("id").eq("client_id", client.id).eq("status", "active").limit(1).maybeSingle();
  const isFirstCoach = !priorSlot;

  const durationMinutes = input.durationMinutes ?? 60;
  const createdIds = await Promise.all(
    input.days.map(async (day) => {
      const { data: slot, error: slotError } = await ctx.client
        .from("recurring_slots")
        .insert({
          client_id: client.id, coach_id: input.coachId, subscription_id: input.subscriptionId ?? null,
          day_of_week: day, start_time: `${input.timeOfDay}:00`, duration_minutes: durationMinutes, status: "active",
        })
        .select("id")
        .single();
      if (slotError || !slot) throw slotError ?? new Error("Failed to create recurring slot");

      const { error: genError } = await ctx.client.rpc("generate_bookings_from_recurring_slot", {
        p_recurring_slot_id: slot.id, p_count: 4,
      });
      if (genError) throw genError;

      return slot.id as string;
    })
  );

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const scheduleSummary = `${input.days.map((d) => dayNames[d]).join("/")} at ${input.timeOfDay}`;
  await Promise.all([
    isFirstCoach
      ? logTimelineEvent(client.id, "coach_assigned", "Coach assigned", { actorId: ctx.userId, metadata: { coachId: input.coachId } })
      : Promise.resolve(),
    logTimelineEvent(client.id, "slot_assigned", "Recurring schedule set", {
      description: scheduleSummary, actorId: ctx.userId,
      metadata: { coachId: input.coachId, days: input.days, timeOfDay: input.timeOfDay },
    }),
    ensureConversationForCoachAssignment(client.id, input.coachId),
  ]);

  const notifyCtx = await resolveSessionNotifyContext(client.id, input.coachId);
  await Promise.all([
    notifyClient(notifyCtx, "schedule_assigned_client", { coach_name: notifyCtx.coachName ?? "your coach", schedule_summary: scheduleSummary }),
    notifyCoach(notifyCtx, "schedule_assigned_coach", { client_name: notifyCtx.clientName, schedule_summary: scheduleSummary }),
  ]);

  return createdIds;
}
```

### 11.6 Changing a schedule / renewal shortcuts (`scheduling.service.ts`)

```ts
export async function changeMyRecurringSchedule(
  accessToken: string,
  input: { coachId: string; days: number[]; timeOfDay: string; durationMinutes?: number; subscriptionId?: string }
): Promise<{ createdSlotIds: string[] }> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["client"]);

  const { data: client, error: clientError } = await ctx.client.from("client_profiles").select("id").eq("profile_id", ctx.userId).single();
  if (clientError || !client) throw clientError ?? new Error("Client profile not found");

  const { data: activeSlots, error: slotsError } = await ctx.client
    .from("recurring_slots").select("id").eq("client_id", client.id).eq("status", "active");
  if (slotsError) throw slotsError;
  if (!activeSlots || activeSlots.length === 0) throw new Error("No active recurring schedule to change -- set one up first.");

  const slotIds = activeSlots.map((s) => s.id);
  const [{ error: deactivateError }, { error: cancelBookingsError }] = await Promise.all([
    ctx.client.from("recurring_slots").update({ status: "cancelled" }).in("id", slotIds),
    ctx.client.from("bookings").update({ status: "cancelled", cancel_reason: "Client changed their recurring schedule" }).in("recurring_slot_id", slotIds).eq("status", "upcoming"),
  ]);
  if (deactivateError) throw deactivateError;
  if (cancelBookingsError) throw cancelBookingsError;

  const [createdSlotIds, notifyCtx] = await Promise.all([
    createRecurringSlots(accessToken, { coachId: input.coachId, days: input.days, timeOfDay: input.timeOfDay, durationMinutes: input.durationMinutes, subscriptionId: input.subscriptionId }),
    resolveSessionNotifyContext(client.id, input.coachId),
  ]);

  const scheduleSummary = `${input.days.join(",")} at ${input.timeOfDay}`;
  if (input.subscriptionId) {
    await logTimelineEvent(client.id, "plan_renewed", "Plan renewed", {
      description: scheduleSummary, actorId: ctx.userId, metadata: { subscriptionId: input.subscriptionId, coachId: input.coachId },
    });
  } else {
    await logTimelineEvent(client.id, "session_rescheduled", "Recurring schedule changed", { description: scheduleSummary, actorId: ctx.userId });
  }

  await Promise.all([
    notifyClient(notifyCtx, "schedule_changed_client", { coach_name: notifyCtx.coachName ?? "your coach", schedule_summary: scheduleSummary }, "schedule_changed"),
    notifyCoach(notifyCtx, "schedule_changed_coach", { client_name: notifyCtx.clientName, schedule_summary: scheduleSummary }),
  ]);

  return { createdSlotIds };
}

export async function keepRenewalSchedule(accessToken: string, newSubscriptionId: string): Promise<void> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["client"]);

  const { data: client, error: clientError } = await ctx.client.from("client_profiles").select("id").eq("profile_id", ctx.userId).single();
  if (clientError || !client) throw clientError ?? new Error("Client profile not found");

  const { data: activeSlots, error: slotsError } = await ctx.client
    .from("recurring_slots").select("id").eq("client_id", client.id).eq("status", "active");
  if (slotsError) throw slotsError;
  if (!activeSlots || activeSlots.length === 0) throw new Error("No active recurring schedule to carry over -- set one up instead.");

  const { error: repointError } = await ctx.client
    .from("recurring_slots").update({ subscription_id: newSubscriptionId }).in("id", activeSlots.map((s) => s.id));
  if (repointError) throw repointError;

  await logTimelineEvent(client.id, "plan_renewed", "Plan renewed", {
    description: "Kept the same trainer and schedule", actorId: ctx.userId, metadata: { subscriptionId: newSubscriptionId },
  });
}
```

### 11.7 Admin fast-path coach reassignment (`clients.service.ts`)

```ts
export async function reassignClientCoach(accessToken: string, clientId: string, fromCoachId: string, toCoachId: string, options?: { force?: boolean }) {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["admin", "client"]);

  if (ctx.role === "client") {
    const { data: own, error: ownError } = await ctx.client.from("client_profiles").select("id").eq("profile_id", ctx.userId).single();
    if (ownError || !own || own.id !== clientId) throw new Error("Not your record");
  }

  const { data: activeSlots, error: activeSlotsError } = await ctx.client
    .from("recurring_slots").select("day_of_week, start_time, duration_minutes").eq("client_id", clientId).eq("coach_id", fromCoachId).eq("status", "active");
  if (activeSlotsError) throw activeSlotsError;

  const uncoveredDays = await findUncoveredDays(ctx, toCoachId, activeSlots ?? []);
  if (uncoveredDays.length > 0 && !options?.force) {
    throw new Error(
      `The new coach hasn't set availability for ${uncoveredDays.join(", ")} -- the client's existing sessions on ${uncoveredDays.length > 1 ? "those days" : "that day"} would be left uncovered. Update the coach's availability first, or confirm the transfer anyway if you'll fix the schedule separately.`
    );
  }

  const [{ error: slotsError }, { error: bookingsError }] = await Promise.all([
    ctx.client.from("recurring_slots").update({ coach_id: toCoachId }).eq("client_id", clientId).eq("coach_id", fromCoachId).eq("status", "active"),
    ctx.client.from("bookings").update({ coach_id: toCoachId }).eq("client_id", clientId).eq("coach_id", fromCoachId).eq("status", "upcoming"),
  ]);
  if (slotsError) throw slotsError;
  if (bookingsError) throw bookingsError;
  // (notification to client, e.g. coach_changed_client, follows)
}
```

### 11.8 Admin availability check with alternatives (`scheduling.service.ts`)

```ts
export async function checkAdminSlotAssignment(
  accessToken: string,
  input: { coachId: string; days: number[]; timeOfDay: string; durationMinutes?: number }
): Promise<AdminSlotCheckResult> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["admin"]);
  const durationMinutes = input.durationMinutes ?? 60;

  if (await patternFreeAt(input.coachId, input.days, input.timeOfDay, durationMinutes)) {
    return { available: true, alternativeTimesForSameCoach: [], alternativeCoaches: [] };
  }

  const { startHour, endHour } = await getBookingWindow(accessToken);
  const grid = hourlyGrid(startHour, endHour).filter((t) => t !== input.timeOfDay);
  const requestedMinutes = timeToMinutes(input.timeOfDay);

  const sameCoachChecks = await Promise.all(grid.map((t) => patternFreeAt(input.coachId, input.days, t, durationMinutes)));
  const alternativeTimesForSameCoach = grid
    .filter((_, i) => sameCoachChecks[i])
    .sort((a, b) => Math.abs(timeToMinutes(a) - requestedMinutes) - Math.abs(timeToMinutes(b) - requestedMinutes))
    .slice(0, 5);

  const { data: otherCoaches, error: coachesError } = await supabaseAdmin
    .from("coach_profiles").select("id, profile:profiles(full_name)").eq("status", "active").neq("id", input.coachId);
  if (coachesError) throw coachesError;

  const otherCoachChecks = await Promise.all((otherCoaches ?? []).map((c: any) => patternFreeAt(c.id, input.days, input.timeOfDay, durationMinutes)));
  const alternativeCoaches = (otherCoaches ?? [])
    .filter((_: any, i: number) => otherCoachChecks[i])
    .map((c: any) => ({ coachId: c.id as string, name: c.profile?.full_name ?? "Coach" }))
    .slice(0, 5);

  return { available: false, alternativeTimesForSameCoach, alternativeCoaches };
}
```
