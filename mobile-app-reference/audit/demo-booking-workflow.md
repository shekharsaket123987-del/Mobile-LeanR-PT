# Demo Session Booking — Full Workflow Spec (for mobile app parity)

Source of truth: this is how the existing **web app** (Next.js + Supabase) implements "book a free demo session" end-to-end across the Client, Coach, and Admin portals. Replicate this exact logic in the mobile app — same rules, same states, same auto-match algorithm — not just the UI shape.

---

## 1. Concept

A "demo" (aka "assessment session") is a **free, one-time trial 1:1 session** a prospect/client can book with an auto-assigned coach **before purchasing any paid plan**. Key properties:

- It is just a row in the same `bookings` table as every other session, with `session_type = 'assessment'` (vs `'regular'` for paid-plan sessions). There is no separate "demo" table for confirmed bookings.
- **No payment step.** `amountPaid: 0` is passed directly to booking creation. (A dormant Razorpay-paid-demo code path exists — `DEMO_SESSION_FEE`, `createDemoSessionOrder()` — but is **not wired into any current UI**. Do not build a payment step for demos unless explicitly asked to revive that.)
- **The client never picks a coach.** The system auto-matches the best available coach based on load-balancing (utilization %). This is the single most important behavioral detail to replicate — no coach-selection UI at all for demos.
- Duration: 60 minutes (`assessment_session_duration_minutes` setting, default 60).
- A client can have at most one meaningful demo "in flight" at a time — the flow is a gate/waypoint before the paid-plan journey, not a repeatable feature.

---

## 2. Client Portal Workflow

### 2.1 Entry point & pre-conditions
Route: `/client/demo-booking`, also reachable from the "Book a Session" screen when the client has no subscription yet (CTA: "Book Free Demo").

**Pre-condition gate:** if the client's measurements are "stale" (no `progress_logs` entry, or the latest one is >7 days old), the demo-booking form is disabled entirely with a message like "Update your measurements to book a demo" linking to the measurements/progress screen. This is enforced **both client-side (disables the button) and server-side** (the booking action re-checks and throws if stale). Replicate both layers.

### 2.2 Booking form (3 fields, none required except date)
| Field | Type | Required | Rule |
|---|---|---|---|
| Preferred Date | date picker | yes | minimum = tomorrow (IST). **Same-day demo booking is never allowed.** |
| Preferred Time | select | no | "No preference" default, else one of 17 hourly slots, 5:00 AM–9:00 PM IST (on-the-hour only — matches the platform's real booking grid, so a free-text time would be meaningless) |
| Coach Gender preference | select | no | "No preference" / Male / Female / Other |

Submit button: **"Book Free Demo Session"**.

### 2.3 Auto-match algorithm (server-side, must replicate exactly)
Given `{date, preferredTime?, genderPreference?}`:

1. Reject if `date` < tomorrow (IST).
2. Query all `active` coaches (filtered by gender if a preference was given).
3. Pull each coach's current utilization % (`coach_utilization_view`).
4. Sort coaches **ascending by utilization** (least-busy coach ranked first — load balancing).
5. Build the list of candidate times to try: `[preferredTime, ...every other hourly slot in the booking window]` if a preferred time was given, else just the full hourly grid in order.
6. For each candidate time (in order), for each coach (in utilization order):
   - Skip if the slot is in the past.
   - Check `is_slot_within_working_hours(coach, slot, duration)` — coach must not be on approved leave, must respect any date-specific shift override, else falls back to their recurring weekly availability template. All checks in Asia/Kolkata wall-clock time.
   - Check `has_scheduling_conflict(coach, slot, duration)` — no double-booking.
   - If both pass, it's a valid option. Collect up to 20 options total, then stop early.
7. **Take the very first (top-ranked) option — no list is shown to the client, no confirmation step.** Immediately confirm that booking.
8. If zero options were found across every coach/time combination → error: *"No coaches are available for that date or time — try a different date or time."*

### 2.4 Confirming the booking
Booking creation reuses the **exact same hold → confirm pipeline** as every other session type (`holdSlot` then `confirmHold`), just with `sessionType: "assessment"` and `amountPaid: 0`. This guarantees demo bookings are re-validated server-side against the same conflict/working-hours checks as any real booking — no shortcut path. On success:

- A `bookings` row is created (`status: 'upcoming'`, `session_type: 'assessment'`).
- A chat conversation between client and the assigned coach is auto-created if one doesn't exist yet (so the client's "My Chats" immediately shows this coach).
- A timeline event is logged for the client ("Session added").
- Notifications fire to **both** client and coach (see §5).

### 2.5 Success screen
Shows: coach photo, coach name, formatted date/time, copy "Your coach was automatically assigned based on availability," and a button to go to the dashboard.

### 2.6 The Client Journey State Machine (critical — this decides what every client screen renders)
This is a single server-side function the whole client portal is gated behind. Demo-related states only apply when the client has **no subscription at all** (a demo never coexists with or blocks a paid plan — it's purely a pre-purchase waypoint):

```
has subscription?
  status = awaiting_activation        → stage "awaiting_activation"
  status = active                     → (onboarding/renewal/slot_selection/active sub-states)
  (paused/inactive counts as "no subscription" for this check)

no subscription, has a demo booking (session_type='assessment', status in upcoming/completed/missed):
  demo.status = upcoming              → stage "demo_booked"
  demo.status = completed OR missed   → stage "demo_completed"

no subscription, no demo booking      → stage "marketing"
```

Cancelled demo bookings are excluded from this lookup — a client who cancelled their demo reads as "never demoed" and is free to book another one. Always reads the **most recent** demo booking, live off the `bookings` table — there is no separate flag/column tracking "has this client ever demoed."

**Screen behavior per stage:**
- `demo_booked`: Dashboard shows a read-only "Your Demo Session" card (coach, date/time, "we'll send a reminder"). The "Book a Session" screen shows a similar read-only card and explicitly blocks booking anything else ("Ongoing session booking unlocks once your demo is done"). `/client/schedule` also shows a read-only card in this stage.
- `demo_completed`: Dashboard shows "Welcome back / your free demo is complete" with a "Choose Your Plan" CTA. The "Book a Session" screen instead shows the **demo feedback gate** (§2.7) before letting the client move to plan selection. `/client/schedule` shows a generic CTA card, same as `marketing`.
- `marketing` (no demo yet): plans/demo CTA shown; "Book a Session" screen offers both "Book Free Demo" and "Choose Your Plan" buttons.

### 2.7 Post-demo feedback gate
Shown once (on the "Book a Session" screen) only when stage is `demo_completed`, only if the demo actually reached `completed` status (not `missed`) and hasn't been rated yet:
- Two independent 5-star pickers: "How was the session overall?" (quality) and "How was {coachName}?" (trainer-specific rating).
- Optional free-text note.
- **Both stars required to actually submit** a rating; a "Skip" button is always available and is functionally equivalent — either path leads to the same next screen ("Choose Your Plan" CTA).
- Global rule to note: rating is capped at **once per 7 days across all of a client's bookings** (not per-booking) — confirmed current (if quirky) behavior; replicate it as-is.

### 2.8 Fallback coach display
On "My Coach," while no recurring-slot coach exists yet, the demo-assigned coach is shown as a simplified read-only card (no "change coach" option) — but **only while the demo is still upcoming**. Once completed, it reverts to "No Active Coach" until a real plan/schedule exists.

---

## 3. Coach Portal Workflow

Coaches do **not** have a separate "demo" inbox — a demo booking flows through the **exact same session lifecycle** as a regular session, just tagged differently:

- Appears in the coach's normal session/booking lists (Today's Tasks, upcoming sessions, etc.) alongside regular sessions.
- UI label: `session_type === 'assessment'` renders as **"Demo Session"**; everything else renders as **"Regular Session."**
- Same Join → Attendance → Notes pipeline as any session:
  1. Coach clicks Join (records `coach_joined_at`, idempotent).
  2. After the session ends, coach marks attendance: Present / Late / Absent. Absent closes the booking immediately as a no-show (`status: 'missed'`). Present/Late requires session notes next.
  3. Coach submits session notes (summary required; exercises/performance/improvements/homework/remarks optional) → booking closes as `status: 'completed'`.
- Coach receives a `demo_booked_coach` notification the moment the client's demo is auto-confirmed (client name + session time).
- No demo-specific business rules differ for the coach (cancellation/reschedule cutoffs, Zoom meeting creation, etc. — all identical to regular sessions).

---

## 4. Admin Portal Workflow

Admin has **no active "manage demo" workflow** — it's entirely read-only/derived on the admin side:

- **`/admin/scheduling`** — a read-only page with 6 grouped sections (Today's Changes, Cancelled, Rescheduled, Manual Sessions Created, **Demo Sessions**, Shadow Sessions), each capped at the 10 most recent entries. The "Demo Sessions" section is simply `bookings` filtered to `session_type === 'assessment'`.
- **Client status derivation** (`deriveClientStatus`, used everywhere in admin/coach UI — client lists, filters, reports):
  ```
  IF any subscription.status = 'paused'                 → "paused"
  ELSE IF any subscription.status = 'active'             → "active"
  ELSE IF any subscription.status = 'awaiting_activation'→ "created"
  ELSE IF client has ≥1 subscription ever                → "expired"
  ELSE IF client has a demo/assessment booking on record → "demo"
  ELSE                                                    → "not_paid"
  ```
  So a prospect who has only ever booked a demo (no plan purchase yet) shows up platform-wide with status **"demo"** — used for filtering/searching clients in the admin client list and search screens.
- Admin can cancel/reschedule a demo booking the same way as any session, from `/admin/sessions` (bypasses cancellation/reschedule cutoff hours — admin is exempt from those).
- There is a **separate, unrelated public-lead mechanism**: `createAssessmentBooking()` inserts into a distinct `assessment_sessions` table (prospect_name/email/phone, assigned_coach_id, scheduled_start, status). This is a lightweight "lead capture" for prospects who **don't have an account yet** (uses the admin/service-role client directly, no auth). It is **not** the same thing as the in-app client demo booking flow described above, and is not wired into `bookings`/journey-state — treat it as a separate, minor feature if you find it referenced (e.g. a public marketing-site "book a free assessment" form), not part of the core demo flow.

---

## 5. Notifications fired

| Event | Client notification | Coach notification |
|---|---|---|
| Demo confirmed | `demo_booked_client` (coach name, session time) | `demo_booked_coach` (client name, session time) |
| Demo cancelled | same generic session-cancel templates as any session (`session_cancelled_client`, notifies admins if client-initiated) | `session_cancelled_by_client` etc. |
| Demo rescheduled | `session_rescheduled_client` | `session_rescheduled_by_client` / admin-notify path |
| Attendance marked | `attendance_present_client` / `attendance_absent_client` | `attendance_present_coach` / `attendance_absent_coach` |

All notification sends are **fail-soft** — a delivery failure never blocks the booking/session flow itself.

---

## 6. Key business rules to replicate exactly

1. **No same-day demo booking** — minimum date is tomorrow, IST.
2. **No coach picker for demos** — auto-match only, ranked by lowest coach utilization first (load balancing), first valid slot/coach combination wins with zero confirmation step.
3. **Free** — no payment step in the live flow (though the schema/plumbing for a paid version exists dormant; don't build it unless asked).
4. **Measurement staleness blocks booking** — same 7-day rule used to block regular ad-hoc booking and session Join.
5. **One demo "counts" at a time** — the journey state machine only looks at the *most recent* non-cancelled demo booking; a cancelled demo doesn't count, freeing the client to book again.
6. **Demo booking is mutually exclusive with an existing subscription** — the journey state machine only evaluates demo state when the client has no subscription record at all (or their sub is paused/inactive with nothing newer).
7. **A demo session goes through the identical booking engine** (hold→confirm, working-hours check, conflict check) as a real paid session — it is not a lighter-weight/fake booking, just tagged `session_type = 'assessment'` with `amountPaid = 0`.
8. **Attendance/notes lifecycle is identical** to a regular session — no shortcut for demos on the coach side.
9. **Rating is optional (skippable)** and, when given, is two-dimensional (session quality + trainer rating specifically) with a shared 7-day cross-booking rating cap.

---

## 7. Suggested mobile implementation shape

- One `bookings`-equivalent table/entity with a `session_type` enum (`assessment` | `regular`) — don't create a separate demo entity.
- A `findDemoSlots(date, preferredTime?, genderPreference?)` server function that does the coach-ranking + slot-search exactly as in §2.3, returning ranked options (even though only the top one is ever used, keeping the ranked-list shape makes future "let the client pick from top 3" changes easy without a rewrite).
- A single `bookDemoSession(date, preferredTime?, genderPreference?)` action that: checks measurement staleness → calls the slot search → takes option #1 → creates the booking via the same booking-creation path as everything else → fires notifications → returns the confirmed booking summary.
- A client-side journey-state hook/query that mirrors §2.6 exactly and drives which screen renders on Dashboard/Book/Schedule — this is the piece most likely to cause subtle bugs if approximated instead of ported exactly.
- Coach and Admin surfaces need no bespoke "demo" data model — just filter/display existing session-list screens by `session_type === 'assessment'` and label it "Demo Session."

---

## 8. Actual source code (reference implementation)

These are the real functions from the web app, given verbatim so the mobile build can be a faithful line-for-line port of the logic (framework/DB-client specifics — Next.js server actions, Supabase — should obviously be adapted to whatever stack the mobile app uses, but the algorithm/order-of-operations should not change).

### 8.1 Time/date helpers (`scheduling.service.ts`)

```ts
/** Business hours (coach_availability, package rules, the schedule-setup UI)
 * are all defined as India wall-clock time. Every instant we hand to the DB
 * (bookings.scheduled_start, temporary_bookings.slot_start) must be the
 * correct UTC instant for that IST wall-clock time -- NOT the UTC clock
 * reading of the same digits. Use this instead of `Date#setUTCHours` whenever
 * turning a "YYYY-MM-DD" + "HH:MM" business-local pair into an instant. */
export function istWallClockToInstant(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  return new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`);
}

/** Inverse of istWallClockToInstant's date: the IST calendar date
 * ("YYYY-MM-DD") for a given UTC instant -- NOT the same as slicing the raw
 * ISO string, which reads the UTC calendar date and can be a day off near
 * midnight IST (00:30 IST is 19:00 UTC the previous day). */
export function istDateString(iso: string): string {
  const istMs = new Date(iso).getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

/** Earliest calendar date (IST) any NEW booking -- demo or regular session --
 * may be scheduled on. Same-day booking is disallowed platform-wide
 * regardless of time-of-day (a slot 5 hours from now today is still not
 * bookable, only slots from tomorrow onward are), so this is a flat
 * "tomorrow" rather than a time-remaining check. Used by both
 * getBookingOptionsAction (regular sessions) and findDemoSlots (demos) as
 * the floor for their date range. */
export function earliestBookableDateIST(): string {
  const todayIST = istDateString(new Date().toISOString());
  const d = new Date(`${todayIST}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Only whole-hour slots exist platform-wide (5am, 6am, ... up to the last
 * hour before close) — no half-hour or odd-aligned start times. Bounds are
 * admin-configurable via system_settings (booking_window_start_hour/end_hour)
 * rather than hardcoded, per the existing business-rules convention. */
export async function getBookingWindow(accessToken: string): Promise<{ startHour: number; endHour: number }> {
  const ctx = await getCallerContext(accessToken);
  const { data, error } = await ctx.client
    .from("system_settings")
    .select("key, value")
    .in("key", ["booking_window_start_hour", "booking_window_end_hour"]);
  if (error) throw error;
  const map = new Map((data ?? []).map((r) => [r.key, r.value as number]));
  return {
    startHour: map.get("booking_window_start_hour") ?? 5,
    endHour: map.get("booking_window_end_hour") ?? 22,
  };
}

export function hourlyGrid(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) slots.push(`${String(h).padStart(2, "0")}:00`);
  return slots;
}

/** Reserves a slot for a short hold window (temporary_booking_hold_minutes,
 * default 10) before it must be confirmed or it auto-expires — prevents two
 * clients racing for the same slot between "pick" and "confirm". */
export async function holdSlot(accessToken: string, input: { clientId: string; coachId: string; slotStart: string; durationMinutes: number }) {
  const ctx = await getCallerContext(accessToken);
  const { data, error } = await ctx.client.rpc("create_temporary_booking", {
    p_client_id: input.clientId,
    p_coach_id: input.coachId,
    p_slot_start: input.slotStart,
    p_duration_minutes: input.durationMinutes,
  });
  if (error) throw error;
  return data as string; // temporary_booking id
}

export async function confirmHold(
  accessToken: string,
  input: {
    tempBookingId: string;
    subscriptionId?: string;
    recurringSlotId?: string;
    assessmentSessionId?: string;
    sessionType?: "regular" | "assessment";
    amountPaid?: number;
  }
) {
  const ctx = await getCallerContext(accessToken);
  const { data, error } = await ctx.client.rpc("confirm_booking", {
    p_temp_booking_id: input.tempBookingId,
    p_subscription_id: input.subscriptionId ?? null,
    p_recurring_slot_id: input.recurringSlotId ?? null,
    p_assessment_session_id: input.assessmentSessionId ?? null,
    p_session_type: input.sessionType ?? "regular",
    p_amount_paid: input.amountPaid ?? null,
  });
  if (error) throw error;
  return data as string; // booking id
}
```

`create_temporary_booking` / `confirm_booking` / `is_slot_within_working_hours` / `has_scheduling_conflict` are Postgres RPC functions (security-definer) that do the authoritative conflict/working-hours re-check server-side — the app-layer code never trusts its own advisory availability read. In a non-Supabase mobile backend, replicate these as transactional server-side functions/stored procedures, not client-trusted checks.

### 8.2 Demo slot search + booking (`demoBooking.service.ts`)

```ts
export interface DemoSlotOption {
  coachId: string;
  coachName: string;
  coachPhoto: string;
  slotStart: string; // ISO
}

const FALLBACK_PHOTO = (seed: string) => `https://i.pravatar.cc/300?u=${seed}`;

/** Demo (assessment) booking search: unlike findAvailableCoach() (which
 * matches a recurring WEEKLY PATTERN for an already-committing client),
 * this searches every active coach for open slots on a SINGLE date --
 * the client has no coach yet and no plan, just wants to try a session.
 * Reuses the same is_slot_within_working_hours/has_scheduling_conflict RPCs
 * the real booking engine depends on, rather than re-deriving availability. */
export async function findDemoSlots(
  accessToken: string,
  input: { date: string; preferredTime?: string; genderPreference?: "male" | "female" | "other"; durationMinutes?: number }
): Promise<DemoSlotOption[]> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["client"]);
  const durationMinutes = input.durationMinutes ?? 60;

  // Same-day demo booking isn't offered -- earliest selectable date is
  // always tomorrow (IST), same rule as regular session booking.
  if (input.date < earliestBookableDateIST()) {
    throw new Error("Same-day booking isn't available -- please choose a date starting tomorrow.");
  }

  // Uses supabaseAdmin deliberately, same rationale as coaches.service.ts's
  // getCoachPublicInfo(): this client has no relationship (booking/recurring
  // slot) with any of these coaches yet, so profiles_select_linked_as_client
  // RLS would otherwise silently null out every coach's name/photo.
  let coachQuery = supabaseAdmin.from("coach_profiles").select("id, specialization, profile:profiles(full_name, photo_url)").eq("status", "active");
  if (input.genderPreference) coachQuery = coachQuery.eq("gender", input.genderPreference);
  const { data: coaches, error: coachesError } = await coachQuery;
  if (coachesError) throw coachesError;
  if (!coaches || coaches.length === 0) return [];

  // Same RLS reasoning as above -- coach_utilization_view inner-joins
  // profiles, so a client with no relationship to these coaches would get
  // rows silently dropped rather than just missing a name.
  const { data: util, error: utilError } = await supabaseAdmin
    .from("coach_utilization_view")
    .select("coach_id, utilization_pct")
    .in(
      "coach_id",
      coaches.map((c: any) => c.id)
    );
  if (utilError) throw utilError;
  const utilByCoach = new Map((util ?? []).map((u) => [u.coach_id, Number(u.utilization_pct)]));

  const { startHour, endHour } = await getBookingWindow(accessToken);
  const grid = hourlyGrid(startHour, endHour);
  const timesToTry = input.preferredTime ? [input.preferredTime, ...grid.filter((t) => t !== input.preferredTime)] : grid;

  const sortedCoaches = [...coaches].sort((a: any, b: any) => (utilByCoach.get(a.id) ?? 0) - (utilByCoach.get(b.id) ?? 0));

  const options: DemoSlotOption[] = [];
  for (const time of timesToTry) {
    const slotStart = istWallClockToInstant(input.date, time);
    if (slotStart.getTime() <= Date.now()) continue;

    for (const coach of sortedCoaches as any[]) {
      const [{ data: withinHours, error: hoursError }, { data: hasConflict, error: conflictError }] = await Promise.all([
        ctx.client.rpc("is_slot_within_working_hours", { p_coach_id: coach.id, p_slot_start: slotStart.toISOString(), p_duration_minutes: durationMinutes }),
        ctx.client.rpc("has_scheduling_conflict", { p_coach_id: coach.id, p_slot_start: slotStart.toISOString(), p_duration_minutes: durationMinutes }),
      ]);
      if (hoursError) throw hoursError;
      if (conflictError) throw conflictError;
      if (withinHours && !hasConflict) {
        options.push({
          coachId: coach.id,
          coachName: coach.profile?.full_name ?? "Coach",
          coachPhoto: coach.profile?.photo_url ?? FALLBACK_PHOTO(coach.id),
          slotStart: slotStart.toISOString(),
        });
      }
    }
    if (options.length >= 20) break;
  }

  return options.slice(0, 20);
}

/** Confirms a demo booking -- reuses the same hold-then-confirm booking path
 * every other session type goes through (createBooking -> holdSlot/confirmHold),
 * with sessionType: 'assessment' so it's re-checked server-side for conflicts
 * exactly like a regular booking would be. The demo itself is free (no
 * payment collected). */
export async function confirmDemoBooking(accessToken: string, coachId: string, slotStart: string, durationMinutes = 60) {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["client"]);
  const { data: client, error } = await ctx.client.from("client_profiles").select("id").eq("profile_id", ctx.userId).single();
  if (error || !client) throw error ?? new Error("Client profile not found");

  const before = await getClientStatusSnapshot(client.id);
  const result = await createBooking(accessToken, {
    clientId: client.id,
    coachId,
    slotStart,
    durationMinutes,
    sessionType: "assessment",
    amountPaid: 0,
  });
  await logClientStatusChange(client.id, before, ctx.userId);
  return result;
}

export interface DemoSessionSummary {
  bookingId: string;
  coachId: string;
  coachName: string;
  coachPhoto: string;
  slotStart: string;
  status: "upcoming" | "completed" | "missed";
  qualityRating: number | null;
}

/** The client journey state machine's only signal of "has this client ever
 * demoed" -- deliberately a live read of `bookings` (session_type =
 * 'assessment'), not a new tracking column/table, matching this codebase's
 * existing preference for derived state over duplicated state that can
 * drift. Returns the most recent demo booking regardless of outcome;
 * cancelled demos are excluded so a client who cancelled reads as never
 * having demoed, free to book again. */
export async function getMyLatestDemoSession(accessToken: string): Promise<DemoSessionSummary | null> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["client"]);
  const { data: client, error } = await ctx.client.from("client_profiles").select("id").eq("profile_id", ctx.userId).single();
  if (error || !client) throw error ?? new Error("Client profile not found");

  const { data, error: bookingsError } = await ctx.client
    .from("bookings")
    .select("id, scheduled_start, status, quality_rating, coach:coach_profiles(id, profile:profiles(full_name, photo_url))")
    .eq("client_id", client.id)
    .eq("session_type", "assessment")
    .in("status", ["upcoming", "completed", "missed"])
    .order("scheduled_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (bookingsError) throw bookingsError;
  if (!data) return null;

  const coach = (data as any).coach;
  return {
    bookingId: data.id,
    coachId: coach?.id ?? "",
    coachName: coach?.profile?.full_name ?? "Coach",
    coachPhoto: coach?.profile?.photo_url ?? FALLBACK_PHOTO(data.id),
    slotStart: data.scheduled_start,
    status: data.status as "upcoming" | "completed" | "missed",
    qualityRating: (data as any).quality_rating ?? null,
  };
}
```

### 8.3 Booking creation shared by every session type (`bookings.service.ts`)

```ts
/** Convenience wrapper for immediate booking (hold then confirm back-to-back)
 * — used when the UI doesn't need a separate "reviewing your pick" step. */
export async function createBooking(
  accessToken: string,
  input: {
    clientId: string;
    coachId: string;
    slotStart: string;
    durationMinutes: number;
    subscriptionId?: string;
    recurringSlotId?: string;
    sessionType?: "regular" | "assessment";
    amountPaid?: number;
  }
) {
  const tempId = await holdSlot(accessToken, input);
  const bookingId = await confirmHold(accessToken, {
    tempBookingId: tempId,
    subscriptionId: input.subscriptionId,
    recurringSlotId: input.recurringSlotId,
    sessionType: input.sessionType,
    amountPaid: input.amountPaid,
  });

  // Safety net: guarantees a client sees "My Chats" as soon as ANY session
  // with a coach is booked, not just when a recurring pattern is set up --
  // covers ad-hoc/one-off bookings like demos. No-ops if the client has no
  // subscription yet or already has this exact conversation.
  await ensureConversationForCoachAssignment(input.clientId, input.coachId);

  if (!input.recurringSlotId) {
    await logTimelineEvent(input.clientId, "manual_session_added", "Session added", {
      description: new Date(input.slotStart).toLocaleString(),
      metadata: { bookingId, coachId: input.coachId },
    });
  }

  const notifyCtx = await resolveSessionNotifyContext(input.clientId, input.coachId);
  const sessionTime = formatSessionTime(input.slotStart);
  if (input.sessionType === "assessment") {
    await notifyClient(notifyCtx, "demo_booked_client", { coach_name: notifyCtx.coachName ?? "your coach", session_time: sessionTime }, "demo_booked");
    await notifyCoach(notifyCtx, "demo_booked_coach", { client_name: notifyCtx.clientName, session_time: sessionTime });
  } else {
    await notifyClient(notifyCtx, "session_booked_client", { coach_name: notifyCtx.coachName ?? "your coach", session_time: sessionTime }, "session_booked");
    await notifyCoach(notifyCtx, "session_booked_coach", { client_name: notifyCtx.clientName, session_time: sessionTime });
  }

  return bookingId;
}
```

### 8.4 Client journey state machine (`client-journey.actions.ts`)

```ts
export type ClientJourneyStage =
  | "marketing"
  | "demo_booked"
  | "demo_completed"
  | "awaiting_activation"
  | "onboarding"
  | "renewal_checkin"
  | "renewal_scheduling"
  | "slot_selection"
  | "active";

export interface ClientJourneyState {
  stage: ClientJourneyStage;
  subscriptionId: string | null;
  packageName: string | null;
  /** Only populated for demo_booked/demo_completed -- the client's most
   * recent demo booking, auto-assigned coach and all. */
  demoSession: DemoSessionSummary | null;
}

/** Decides which experience client/dashboard renders -- the single gate
 * walking purchase -> activation -> onboarding -> slot selection -> the
 * real dashboard. Demo stages are checked only once a client has no
 * active/pending subscription -- a demo is a pre-subscription waypoint,
 * not something that coexists with (or blocks) an actual paid plan. */
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
      // paused/inactive with no newer subscription falls through below --
      // treat as if no subscription exists so the client isn't stuck.
    }

    const demoSession = await getMyLatestDemoSession(token);
    if (demoSession) {
      return {
        stage: demoSession.status === "upcoming" ? "demo_booked" : "demo_completed",
        subscriptionId: null,
        packageName: null,
        demoSession,
      };
    }

    return { stage: "marketing", subscriptionId: null, packageName: null, demoSession: null };
  });
}
```

### 8.5 The client-facing action that ties it together (`client-journey.actions.ts`)

```ts
export interface DemoBookingResult {
  bookingId: string;
  coachName: string;
  coachPhoto: string;
  slotStart: string;
}

/** The client never picks a coach for a demo -- findDemoSlots already
 * ranks candidates (by utilization), so this just takes the top-ranked
 * option and confirms it immediately. No payment step: the demo is free. */
export async function bookDemoSessionAction(input: {
  date: string;
  preferredTime?: string;
  genderPreference?: "male" | "female" | "other";
}): Promise<ActionResult<DemoBookingResult>> {
  return runAction(async () => {
    const token = await requireToken();

    const client: any = await getMyClientProfile(token);
    const { isStale } = await getMeasurementStatus(token, client.id);
    if (isStale) {
      throw new Error("Please update your measurements before booking a demo session.");
    }

    const options = await findDemoSlots(token, input);
    if (options.length === 0) {
      throw new Error("No coaches are available for that date or time -- try a different date or time.");
    }
    const top = options[0];
    const bookingId = await confirmDemoBooking(token, top.coachId, top.slotStart);
    return { bookingId, coachName: top.coachName, coachPhoto: top.coachPhoto, slotStart: top.slotStart };
  });
}
```

### 8.6 Client-side booking form (`DemoBookingClient.tsx`, React)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CheckCircle2, ScaleIcon } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { bookDemoSessionAction, DemoBookingResult } from "@/lib/actions/client-journey.actions";
import { isFailure } from "@/lib/actions/action-result";
import { formatDate, formatTime } from "@/lib/utils";

function earliestDateISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// 5am-9pm IST, whole hours only -- matches the platform's actual booking grid.
const PREFERRED_TIME_HOURS = Array.from({ length: 17 }, (_, i) => i + 5); // 5..21

function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period}`;
}

export default function DemoBookingClient({ measurementsStale }: { measurementsStale: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(earliestDateISO());
  const [preferredTime, setPreferredTime] = useState("");
  const [genderPreference, setGenderPreference] = useState<"" | "male" | "female" | "other">("");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DemoBookingResult | null>(null);

  async function bookDemo() {
    setBooking(true);
    setError("");
    const res = await bookDemoSessionAction({
      date,
      preferredTime: preferredTime || undefined,
      genderPreference: genderPreference || undefined,
    });
    setBooking(false);
    if (isFailure(res)) {
      setError(res.error.message);
      return;
    }
    setResult(res.data);
  }

  if (result) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <p className="text-display text-xl font-bold italic">Demo Session Booked Successfully</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
            <Image src={result.coachPhoto} alt={result.coachName} fill className="object-cover" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold">{result.coachName}</p>
            <p className="text-xs text-white/50">
              {formatDate(result.slotStart)} · {formatTime(result.slotStart)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-white/45">Your coach was automatically assigned based on availability.</p>
        <Button className="mt-6" onClick={() => router.push("/client/dashboard")}>
          Go to Dashboard
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      {measurementsStale && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <ScaleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-bold text-red-400">Update your measurements to book a demo</p>
            <p className="mt-0.5 text-xs text-red-400/80">
              We need your current measurements before matching you with a coach.{" "}
              <a href="/client/progress" className="font-bold underline">Log them now</a>.
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase text-white/40">Preferred Date</label>
          <input
            type="date"
            value={date}
            min={earliestDateISO()}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-white/15 p-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase text-white/40">Preferred Time (optional)</label>
          <select value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} className="w-full rounded-xl border border-white/15 p-3 text-sm">
            <option value="">No preference</option>
            {PREFERRED_TIME_HOURS.map((h) => (
              <option key={h} value={`${String(h).padStart(2, "0")}:00`}>{formatHour(h)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase text-white/40">Coach Gender (optional)</label>
          <select value={genderPreference} onChange={(e) => setGenderPreference(e.target.value as any)} className="w-full rounded-xl border border-white/15 p-3 text-sm">
            <option value="">No preference</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <p className="mt-3 text-xs text-white/40">
        We&apos;ll automatically match you with the best available coach for your chosen time -- no need to pick one yourself.
      </p>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      <Button className="mt-5" loading={booking} disabled={measurementsStale} onClick={bookDemo}>
        Book Free Demo Session
      </Button>
    </Card>
  );
}
```

### 8.7 Post-demo feedback gate (`DemoFeedbackGateClient.tsx`, React)

```tsx
"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { rateSessionAction } from "@/lib/actions/client-portal.actions";
import { isFailure } from "@/lib/actions/action-result";

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex justify-center gap-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)} onClick={() => onChange(i)}>
          <Star
            className="h-7 w-7 transition-colors"
            fill={(hover || value) >= i ? "#F5D90A" : "none"}
            stroke={(hover || value) >= i ? "#F5D90A" : "#FFFFFF30"}
          />
        </button>
      ))}
    </div>
  );
}

/** Gates "Choose a Plan" behind rating the demo -- shown only once the demo
 * is actually done (stage === "demo_completed"). Rating is skippable, it
 * just isn't the default path anymore. Sessions with no rating to give
 * (missed demo, or already rated) skip straight to the plan CTA. */
export default function DemoFeedbackGateClient({
  bookingId,
  coachName,
  canRate,
}: {
  bookingId: string;
  coachName: string;
  canRate: boolean;
}) {
  const [done, setDone] = useState(!canRate);
  const [qualityRating, setQualityRating] = useState(0);
  const [trainerRating, setTrainerRating] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    const result = await rateSessionAction(bookingId, qualityRating, trainerRating, note);
    setSubmitting(false);
    if (isFailure(result)) {
      setError(result.error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm font-bold">Ready when you are</p>
        <p className="max-w-sm text-sm text-white/50">Choose a plan to start booking ongoing sessions with your coach.</p>
        <Button href="/client/plans" className="mt-2">Choose Your Plan</Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <p className="text-center text-sm font-bold">How was your demo with {coachName}?</p>
      <div className="mx-auto mt-5 max-w-xs">
        <div className="mb-5">
          <p className="mb-2 text-center text-sm font-semibold text-white/70">How was the session overall?</p>
          <StarPicker value={qualityRating} onChange={setQualityRating} />
        </div>
        <div className="mb-5">
          <p className="mb-2 text-center text-sm font-semibold text-white/70">How was {coachName}?</p>
          <StarPicker value={trainerRating} onChange={setTrainerRating} />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Anything you'd like to share? (optional)"
          className="w-full rounded-xl border border-white/15 p-3 text-sm focus:border-brand-yellow focus:outline-none focus:ring-1 focus:ring-brand-yellow"
        />
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setDone(true)} disabled={submitting}>Skip</Button>
          <Button className="flex-1" disabled={!qualityRating || !trainerRating} loading={submitting} onClick={handleSubmit}>Submit</Button>
        </div>
      </div>
    </Card>
  );
}
```

### 8.8 Dashboard rendering for demo stages (`app/client/dashboard/page.tsx`, excerpt)

```tsx
if (stage === "demo_booked" && demoSession) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Your Demo Session" description="You're all set — here's what's coming up." />
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="relative h-16 w-16 overflow-hidden rounded-2xl">
          <Image src={demoSession.coachPhoto} alt={demoSession.coachName} fill className="object-cover" />
        </div>
        <div>
          <p className="text-display text-xl font-bold italic">{demoSession.coachName}</p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-white/60">
            <CalendarClock className="h-4 w-4" />
            {formatDate(demoSession.slotStart)} · {formatTime(demoSession.slotStart)}
          </p>
        </div>
        <p className="max-w-sm text-sm text-white/50">
          Your coach was automatically matched based on availability. We&apos;ll send a reminder before your session.
        </p>
      </Card>
    </div>
  );
}

if (stage === "demo_completed") {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Welcome back" description="Your free demo is complete — ready to go all in?" />
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-yellow/15">
          <Sparkles className="h-7 w-7" />
        </div>
        <div>
          <p className="text-display text-xl font-bold italic">How was your demo with {demoSession?.coachName ?? "your coach"}?</p>
          <p className="mt-1 text-sm text-white/50">Pick a plan to keep training with a dedicated coach every week.</p>
        </div>
        <Button href="/client/plans">Choose Your Plan</Button>
      </Card>
    </div>
  );
}
```

### 8.9 "Book a Session" screen's demo-stage branches (`app/client/book/page.tsx`, excerpt)

```tsx
if (stage === "demo_booked" && demoSession) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Book a Session" description="A few quick steps and you're on the calendar." />
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <CalendarClock className="h-8 w-8 text-white/25" />
        <p className="text-sm font-bold">Your Demo Session Is Already Booked</p>
        <p className="max-w-sm text-sm text-white/50">
          {demoSession.coachName} · {formatDate(demoSession.slotStart)} · {formatTime(demoSession.slotStart)}
        </p>
        <p className="max-w-sm text-sm text-white/50">Ongoing session booking unlocks once your demo is done.</p>
      </Card>
    </div>
  );
}

if (stage === "demo_completed" && demoSession) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Book a Session" description="A few quick steps and you're on the calendar." />
      <DemoFeedbackGateClient
        bookingId={demoSession.bookingId}
        coachName={demoSession.coachName}
        canRate={demoSession.status === "completed" && demoSession.qualityRating == null}
      />
    </div>
  );
}

if (stage === "marketing") {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Book a Session" description="A few quick steps and you're on the calendar." />
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <Ban className="h-8 w-8 text-white/25" />
        <p className="text-sm font-bold">No Subscription Found</p>
        <p className="max-w-sm text-sm text-white/50">Book a free demo session, or choose a plan to get started.</p>
        <div className="mt-2 flex gap-3">
          <Button href="/client/demo-booking" variant="outline">Book Free Demo</Button>
          <Button href="/client/plans">Choose Your Plan</Button>
        </div>
      </Card>
    </div>
  );
}
```

### 8.10 Coach-side label logic (`CoachSessionClient.tsx`, excerpt)

```ts
const sessionTypeLabel = session.type === "assessment" ? "Demo Session" : "Regular Session";
```

Everything downstream of this (Join, mark attendance, submit notes) is identical code to a regular session — no branching by `sessionType` anywhere else in the coach flow.

### 8.11 Admin's derived client status (`clientStatus.ts` logic, restated as pseudocode — see §8.6 in the behavioral spec above for the exact rule)

```ts
function deriveClientStatus(client): "paused" | "active" | "created" | "expired" | "demo" | "not_paid" {
  if (client.subscriptions.some(s => s.status === "paused")) return "paused";
  if (client.subscriptions.some(s => s.status === "active")) return "active";
  if (client.subscriptions.some(s => s.status === "awaiting_activation")) return "created";
  if (client.subscriptions.length > 0) return "expired";
  if (client.bookings.some(b => b.session_type === "assessment")) return "demo";
  return "not_paid";
}
```

---

## 9. Known Issues in a Mobile Port — Fixes to Apply

Findings from a review pass of a mobile port of this flow (file names below refer to the mobile app's own files, not the web app's). Each is a **divergence from the web behavior documented in §8** — the fix in every case is "match what the web actually does," not a novel design decision.

### 9.1 `findDemoSlot`'s preferred-time lookup breaks if the booking window ever changes

**Symptom:** `grid[hour - window.startHour]` computes an array index assuming the grid always starts at the hardcoded 5 AM chip range from `demo-booking.tsx`. If an admin ever changes `booking_window_start_hour`/`booking_window_end_hour` away from 5–22, this index goes stale/out-of-bounds and silently falls back to "no preference" — no error, just wrong behavior.

**Root cause:** the web app never indexes into the grid at all (§8.2). It string-matches:
```ts
const timesToTry = input.preferredTime
  ? [input.preferredTime, ...grid.filter((t) => t !== input.preferredTime)]
  : grid;
```
This is index-free by construction — `preferredTime` is just moved to the front of whatever `grid` currently is, so it's correct regardless of what the window bounds happen to be at call time.

**Fix:**
1. Replace the index math with the filter/prepend pattern above.
2. `grid` itself must come from a **live** read of the booking-window setting on every call (mirror `getBookingWindow()`, §8.1), not a value baked in at build time.
3. The UI's hour-chip list in `demo-booking.tsx` should also be generated from that same live window read, not a hardcoded 5 AM–9 PM range — otherwise the UI and server can independently drift even after fixing #1 and #2 (the UI could offer a time the server-side grid no longer contains, which is now at least handled gracefully since preferredTime is just prepended and tried, but still worth fixing at the source).

### 9.2 Duplicate demo-booking fetch on `book-session.tsx`

**Symptom:** the screen calls `getClientJourneyStage()` (which internally already resolves the latest demo booking) and then separately calls `getDemoAssignedCoach()` to get the coach for that same booking — two round trips for one piece of state, with a real (if narrow) race window between them.

**Root cause:** the web app never does a second fetch here. `getMyJourneyStateAction()` returns the full `demoSession` object — `{ bookingId, coachId, coachName, coachPhoto, slotStart, status, qualityRating }` — as part of its single response (§8.4/§8.5), and `book/page.tsx` reads `journeyResult.data.demoSession` directly (§8.9). There is exactly one source of truth for "what's the client's current demo" per page load.

**Fix:**
1. Make sure `getClientJourneyStage()`'s response type embeds the same full `demoSession` shape shown above (not just a stage enum).
2. In `book-session.tsx`, read coach name/photo/slot straight off `journeyState.demoSession` and delete the separate `getDemoAssignedCoach()` call from this screen.
3. It's fine to keep `getDemoAssignedCoach()` as a function if some *other* screen needs it (e.g. a "My Coach" screen's demo-coach fallback, §2.8) — just don't call it twice for data you already received on this screen.

### 9.3 `hasExistingAssessment()` and `getLatestDemoBooking()` disagree on cancelled bookings

**Symptom:** a client whose only demo was cancelled still sees a stale "you already have one on record" banner, blocking rebooking, even though the journey-stage logic correctly treats them as never having demoed.

**Root cause:** two independently-written status filters drifted apart. The web app has exactly **one** predicate for "does this client have a demo on record" — `getMyLatestDemoSession()`'s `.in("status", ["upcoming", "completed", "missed"])`, which deliberately **excludes cancelled** (§8.2, and the design rule in §6.5 of the behavioral spec: "a cancelled demo doesn't count, freeing the client to book again").

**Fix:** don't maintain two predicates — derive one from the other so they can't drift again:
```ts
async function getLatestDemoBooking(clientId: string) {
  return db.bookings.findFirst({
    where: { clientId, sessionType: "assessment", status: { in: ["upcoming", "completed", "missed"] } },
    orderBy: { scheduledStart: "desc" },
  });
}

async function hasExistingAssessment(clientId: string): Promise<boolean> {
  return (await getLatestDemoBooking(clientId)) !== null;
}
```

### 9.4 "Demo Session"/"Regular Session" label copy-pasted in multiple places

**Symptom:** the same two-way label exists independently in `schedule.tsx`, `session/[id].tsx`, and two more divergently-worded versions in admin screens — four places that can each drift.

**Root cause:** the web app has exactly one literal for this, used in exactly one place (§8.10):
```ts
const sessionTypeLabel = session.type === "assessment" ? "Demo Session" : "Regular Session";
```

**Fix:** extract one shared helper and use it everywhere, including admin (rewording admin's two divergent variants to match instead of leaving them as separate copy):
```ts
// shared/sessionLabels.ts
export function sessionTypeLabel(type: "assessment" | "regular"): string {
  return type === "assessment" ? "Demo Session" : "Regular Session";
}
```
Import this in `schedule.tsx`, `session/[id].tsx`, and every admin screen that currently has its own inline string — there should be exactly one literal pair ("Demo Session" / "Regular Session") in the whole app, matching the web app exactly.

### 9.5 `findDemoSlot` lost its early-exit and now over-fetches

**Symptom:** the mobile version fetches every active coach's full-day availability up front, rather than stopping as soon as enough matches are found — a real regression versus both the old mobile loop and the web app's actual behavior.

**Root cause:** the web app's loop (§8.2) is structured **time-outer, coach-inner** (coaches pre-sorted by utilization ascending), calling the two fitness RPCs (`is_slot_within_working_hours`, `has_scheduling_conflict`) per coach-time pair only as needed, and breaks the outer loop the moment 20 options have been collected:
```ts
for (const time of timesToTry) {
  const slotStart = istWallClockToInstant(input.date, time);
  if (slotStart.getTime() <= Date.now()) continue;
  for (const coach of sortedCoaches) {
    const [withinHours, hasConflict] = await Promise.all([
      isSlotWithinWorkingHours(coach.id, slotStart, durationMinutes),
      hasSchedulingConflict(coach.id, slotStart, durationMinutes),
    ]);
    if (withinHours && !hasConflict) options.push({ coachId: coach.id, coachName, coachPhoto, slotStart });
  }
  if (options.length >= 20) break;
}
```
There is no bulk "fetch every coach's whole-day availability" step anywhere in the web implementation — that's a mobile-only addition that should be removed.

**Fix:** restore the time-outer/coach-inner structure with the `options.length >= 20` early-exit exactly as above. Since only `options[0]` is ever actually used to confirm a booking (the client never picks from a list — §2.3/§8.5), an even tighter version that breaks on the **first** valid option instead of collecting 20 would also be behaviorally correct for the current UI; keeping the 20-cap (as the web does) is only worth it if you want the option later to show the client a short list to choose from instead of auto-booking the top pick. Pick one deliberately — don't leave the over-fetch in place.
