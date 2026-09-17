# Cancel & Reschedule Policy — Full Workflow Spec (for mobile app parity)

Source of truth: this is how the existing **web app** (Next.js + Supabase) implements session cancellation and rescheduling end-to-end, for both **regular** (`session_type = 'regular'`) and **demo** (`session_type = 'assessment'`) sessions, across the Client, Coach, and Admin portals. Replicate this exact logic in the mobile app — same cutoffs, same limits, same bypass rules, same notification fan-out — not just the UI shape.

---

## 1. The one-line summary

**Demo and regular sessions follow an identical cancel/reschedule policy.** There is no `session_type` branch anywhere in the cancel/reschedule code. The only things that differ between them are unrelated to this policy (auto-match coach assignment, no payment, journey-state gating) — see `demo_booking_workflow_brief.md`. Everything below applies the same way to both.

---

## 2. The two settings that drive everything

Stored in `system_settings`, read live (not compiled-in constants) so admins can change them without a deploy:

| Setting key | Default | Meaning |
|---|---|---|
| `cancellation_cutoff_hours` | 12 | Minimum hours before `scheduled_start` that a **client** may cancel a booking. |
| `reschedule_cutoff_hours` | 1 | Minimum hours before `scheduled_start` that a **client** may reschedule a booking. |

These used to be one shared setting; they were deliberately split (migration `0025_reschedule_policy.sql`) because cancel and reschedule have different real-world urgency — rescheduling to a *different* time is lower-friction than an outright cancellation, hence the much smaller default cutoff (1h vs 12h).

**Plus one hardcoded (not admin-configurable) rule:** a client may reschedule at most **`MAX_RESCHEDULES_PER_WEEK = 2`** times per Monday-start calendar week, into any slot within a rolling **`RESCHEDULE_WINDOW_DAYS = 30`**-day forward window. There is no equivalent weekly cap on cancellations.

---

## 3. Cancel — full rule set

1. Only a booking with `status = 'upcoming'` can be cancelled. Anything else (`completed`/`cancelled`/`missed`) is rejected.
2. **Client:** must be ≥ `cancellation_cutoff_hours` before `scheduled_start`. Below cutoff → hard error, no override in the UI.
3. **Admin:** cutoff is **not enforced at all** (`p_enforce_cutoff = false` whenever the caller role is `admin`). Admin can cancel any upcoming booking regardless of how close it is.
4. **Coach:** the coach portal has no client-facing "cancel my own session" action in this codebase — coaches only *view* cancelled/rescheduled lists (`getCoachCancelledSessionsAction`, `getCoachRescheduledSessionsAction`). If your mobile app adds a coach-initiated cancel path, treat it as admin-equivalent (no cutoff) unless told otherwise, since the web app never built this path to compare against.
5. No weekly limit on cancellations (only reschedules are capped).
6. On success:
   - `bookings.status → 'cancelled'`, `cancelled_by` = the acting user, `cancel_reason` = optional free-text reason.
   - If the booking came from a recurring slot (`recurring_slot_id` not null), one replacement future occurrence is generated (`generate_bookings_from_recurring_slot`) — a cancelled recurring session doesn't shrink the client's remaining schedule, it just gets backfilled further out.
   - Any Zoom meeting tied to the booking is torn down.
   - A timeline event `session_cancelled` is logged against the client.
7. Notifications (all fail-soft — never block the cancel itself):
   - **Client-initiated:** notify the coach (`session_cancelled_by_client`) **and** notify admins (`admin_alert`) — the client's own action doesn't need to notify the client themself.
   - **Coach- or admin-initiated:** notify the client (`session_cancelled_client`, with an optional reason line appended) — this is the one case the client wasn't told about *before* this feature existed; make sure the mobile app actually delivers it.

---

## 4. Reschedule — full rule set

1. Only a booking with `status = 'upcoming'` can be rescheduled.
2. **Client cutoff:** must be ≥ `reschedule_cutoff_hours` (default 1h) before `scheduled_start`.
3. **Client-only extra checks** (these three are enforced in the application layer, not the DB function, and are **skipped entirely for admin**):
   - New time must fall strictly within `[now, now + 30 days)`.
   - Client must have < 2 reschedules already logged this Monday-start calendar week (counted by scanning the client's timeline for `session_rescheduled` events between `startOfWeekUTC(now)` and `endOfWeekUTC(now)` — **not** a stored counter column).
   - The client must not already have another session booked on the same **IST calendar date** as the new slot (`getClientBusyDates`) — one session per day, enforced specifically for reschedules.
4. **Admin bypasses all four of the above** — no cutoff, no 30-day window limit, no weekly cap, no same-day-conflict check. "Admin overrides everything, per policy" is the literal governing comment in the source.
5. **Working-hours + double-booking re-check always applies, for every caller including admin** (this lives in the DB function itself, not the app-layer client-only block): the target coach must be within working hours at the new time (`is_slot_within_working_hours`) and the slot must not already be taken by someone else (`has_scheduling_conflict`, excluding the booking being moved). This is the one guard nobody — not even admin — bypasses, because it protects a *different* person's schedule integrity, not the acting client's own limits.
6. **Substitute-coach fallback (client-only feature):** if the client's desired new time isn't free with their own coach, the client can be offered other active coaches who *are* free at that exact instant, and assign one of them to cover just this single booking (`p_new_coach_id`). Critically, `recurring_slot_id` is left untouched — the client's future recurring occurrences keep going to their original coach; the substitute only ever covers this one moved booking, with no separate "revert" step needed.
7. On success:
   - `bookings.scheduled_start`, `duration_minutes`, and (if a substitute was used) `coach_id` are updated in place — same row, not a new booking.
   - Old Zoom meeting is torn down; a new one is created lazily for the new time.
   - A timeline event `session_rescheduled` is logged (this is also literally what the weekly-limit counter reads back — see step 3).
8. Notifications (fail-soft):
   - Client is **always** notified of their own session moving (`session_rescheduled_client`), regardless of who triggered it.
   - If **admin** moved it → notify the coach (`admin_changed_schedule`).
   - If the **client** moved it → notify the coach and admin (client-initiated reschedule path).
   - A client is never re-notified of their own self-triggered action beyond the standard confirmation.

---

## 5. Demo sessions specifically

Nothing above changes for `session_type = 'assessment'`. Concretely:

- A demo booking is cancelled/rescheduled through the **exact same `cancel_booking()` / `reschedule_booking()` RPCs and the exact same `cancelBooking()` / `rescheduleBooking()` service functions** as a regular session — there is no `if (sessionType === 'assessment')` branch anywhere in this code path.
- Cutoffs, the weekly reschedule cap, the 30-day window, the same-day conflict check, and the substitute-coach fallback all apply identically.
- The one behavioral consequence that *looks* demo-specific but is really just a side effect of the client journey state machine (see `demo_booking_workflow_brief.md` §2.6): a **cancelled** demo is excluded from "does this client have a demo on record," so cancelling a demo silently resets the client to the `marketing` stage, free to book a new demo. This is a journey-state read, not a special case inside cancel/reschedule itself.
- Admin's read-only `/admin/scheduling` page groups cancelled/rescheduled bookings together regardless of session type; "Demo Sessions" is a separate section on that page filtered by `session_type`, not a different cancel/reschedule mechanism.

---

## 6. Client Portal UI/workflow (`MySessionsClient.tsx` + `RescheduleModal.tsx`)

### 6.1 My Sessions list — per-row policy display
For each `upcoming` booking, the client sees, computed client-side from `getSchedulingRulesAction()`'s live settings + weekly-usage count:

```
hrs = hoursUntil(session.scheduled_start)
canCancel     = status === 'upcoming' && hrs > cancellationCutoffHours
canReschedule = status === 'upcoming' && hrs > rescheduleCutoffHours
cancellableUntil    = session.scheduled_start - cancellationCutoffHours (hours)
reschedulableUntil  = session.scheduled_start - rescheduleCutoffHours (hours)
```

Row copy:
- `canCancel` → "Cancellable until {date} · {time}"; else → "Cancellation window closed —"
- `canReschedule` → "Reschedulable until {date} · {time}"; else → "Reschedule window closed —"
- A banner states the plain-English policy: "Sessions must be cancelled at least **N** hour(s) before…" (N = live `cancellationCutoffHours`).
- Cancel button disabled when `!canCancel`; Reschedule button disabled when `!canReschedule` **or** `reschedulesRemaining <= 0`.

This is a **UI convenience only** — the server re-validates everything independently when the action actually fires (never trust the client-computed `canCancel`/`canReschedule` booleans as authorization).

### 6.2 Cancel flow
1. Client taps "Cancel," optionally types a free-text reason.
2. Calls `cancelSessionAction(bookingId, reason?)` → server re-checks status + cutoff → `cancel_booking` RPC → side effects/notifications as in §3.

### 6.3 Reschedule flow (`RescheduleModal`)
Opens with **two parallel loads**:
- `getRescheduleOptionsAction(bookingId)` → validates cutoff/weekly-cap up front (throws immediately if already over the limit or past cutoff, before showing any UI) → returns the client's own coach's open slots for the next 30 days (pre-filtered: excludes past times, excludes dates the client is already busy on) + `reschedulesUsedThisWeek`/`reschedulesRemaining`/`cutoffHours`.
- `getClosestSlotsPerCoachAction(bookingId)` → "Fastest Available" panel: every active coach's single soonest free slot in the same window, sorted earliest-first, own coach visually highlighted.

Three ways to confirm a new time, all converging on the same two actions:
1. **Pick from the grid** of the own coach's open slots → `rescheduleSessionAction(bookingId, slotStart)`.
2. **"Fastest Available" list** → tapping a slot: if it's the client's own coach, `rescheduleSessionAction`; if it's a different coach, `rescheduleSessionToSubstituteAction(bookingId, slotStart, coachId)`.
3. **"Prefer a specific date & time?"** free-form picker → `checkRescheduleTimeAction(bookingId, date, time)` first (validates future-time + not-already-busy-that-day, then checks the own coach's live availability):
   - If free with own coach → shows a confirm button → `rescheduleSessionAction`.
   - If not free → returns a list of other coaches free at that exact instant → "Assign & Reschedule" → `rescheduleSessionToSubstituteAction`.
   - If nobody is free at that time → dead end, message to try another time or contact support.

UI copy always states the live numbers, never hardcoded: "X of 2 reschedules left this week," "moved at least N hour(s) before," "can't land on a day you already have another session."

---

## 7. Coach Portal workflow

Coaches have **no cancel/reschedule action** of their own in this codebase. Their surface is entirely read-only reporting:
- `getCoachCancelledSessionsAction()` — cancelled sessions for this coach's clients, with `cancelledAt` (= `updated_at`, since a cancelled booking is terminal and never touched again), `cancelledByRole` (`client` | `admin` | `coach`, read off `cancelled_by_profile.role`), and the free-text `reason`.
- `getCoachRescheduledSessionsAction()` — analogous list for rescheduled sessions (`was_rescheduled` flag on the booking).
- Coaches get notified when a client reschedules/cancels (see §3/§4 notification tables) and when admin moves a session onto their calendar, but never initiate a cancel/reschedule themselves in the current product. If the mobile app is asked to add this, model it as admin-tier (no cutoff enforcement) since there's no existing client-tier precedent to copy.

---

## 8. Admin Portal workflow

- `/admin/sessions` — admin can cancel or reschedule **any** upcoming booking (`enforceCutoff = false` whenever `ctx.role === 'admin'`), for both regular and demo sessions, with zero cutoff/weekly-limit/window/same-day restrictions. The one check that still applies even to admin is the target coach's working-hours + no-double-booking check (§4.5) — admin can't schedule a session that physically conflicts with the coach's other bookings.
- `/admin/scheduling` — read-only dashboard, 6 grouped sections capped at 10 most-recent each: **Today's Changes**, **Cancelled**, **Rescheduled**, Manual Sessions Created, Demo Sessions, Shadow Sessions.
  - "Cancelled" = `bookings.status === 'cancelled'`.
  - "Rescheduled" = `bookings.was_rescheduled === true`.
  - "Today's Changes" = any of {cancelled today, rescheduled today, created today} by `updated_at`/`created_at`.
- Admin settings screen exposes both cutoff-hour sliders (`cancellation_cutoff_hours`, `reschedule_cutoff_hours`) as live-editable `system_settings` rows — changing them takes effect immediately for every subsequent client-side check, no redeploy.

---

## 9. Notification summary table

| Event | Actor | Client notified? | Coach notified? | Admin notified? |
|---|---|---|---|---|
| Cancel | Client | No (it's their own action) | Yes — `session_cancelled_by_client` | Yes — `admin_alert` |
| Cancel | Coach or Admin | Yes — `session_cancelled_client` (+ reason line if given) | — | — |
| Reschedule | Client | Yes — `session_rescheduled_client` (always, regardless of actor) | Yes | Yes |
| Reschedule | Admin | Yes — `session_rescheduled_client` | Yes — `admin_changed_schedule` | — (admin is the actor) |

All sends are **fail-soft**: a notification/delivery failure never blocks or rolls back the underlying cancel/reschedule.

---

## 10. Key business rules to replicate exactly (checklist)

1. **Same policy for demo and regular sessions** — no `session_type` branching anywhere in cancel/reschedule logic.
2. **Two independent cutoffs**, both admin-configurable, both read live: cancel = 12h default, reschedule = 1h default.
3. **Admin bypasses cutoff, weekly cap, 30-day window, and same-day check** for both cancel and reschedule — the *only* check admin can't bypass is the target coach's working-hours/no-double-booking integrity check.
4. **Max 2 reschedules per client per Monday-start week**, counted by scanning timeline events for `session_rescheduled` in the current week window — not a stored/decrementing counter, so it self-resets every week with no cron job needed.
5. **Reschedule destination must be within a rolling 30-day window** from "now" (not "end of this week").
6. **One session per calendar day (IST) per client** — a reschedule can't land on a date the client is already booked on (checked against every other upcoming booking, not just same-coach ones).
7. **Substitute-coach reschedule only ever moves the single booking** — `recurring_slot_id` (and its coach) is left alone, so future auto-generated occurrences aren't affected. No reversion logic is needed or exists.
8. **Cancelling a recurring-slot booking auto-generates one replacement future occurrence** — the client's total scheduled sessions don't shrink from a single cancellation.
9. **Client is always told when their session is rescheduled**, no matter who did it — this was a previously-missing notification, now standard; don't regress it in the mobile port.
10. **Coach- or admin-initiated cancellation is the only cancel path that notifies the client** — a client cancelling their own session does not get self-notified, but does trigger a coach + admin notification.
11. **All UI-side cutoff/limit displays are advisory** — the mobile app's server-equivalent action must independently re-validate cutoff, weekly cap, window, and conflict checks; never trust a client-submitted "this should be allowed" flag.

---

## 11. Actual source code (reference implementation)

Given verbatim so the mobile build can be a faithful line-for-line port. Framework/DB-client specifics (Supabase RPC, Postgres `plpgsql`) should be adapted to whatever stack the mobile backend uses; the algorithm/order-of-operations should not change.

### 11.1 DB function: `cancel_booking` (`0025_reschedule_policy.sql`)

```sql
create or replace function cancel_booking(
  p_booking_id uuid, p_cancelled_by uuid, p_reason text default null, p_enforce_cutoff boolean default true
)
returns void
language plpgsql
as $$
declare
  b bookings%rowtype;
  cutoff_hours int := get_setting_int('cancellation_cutoff_hours');
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found or b.status <> 'upcoming' then
    raise exception 'Only upcoming bookings can be cancelled' using errcode = 'P0001';
  end if;

  if p_enforce_cutoff and extract(epoch from (b.scheduled_start - now())) / 3600.0 < cutoff_hours then
    raise exception 'Too close to the session start to cancel (cutoff is % hours)', cutoff_hours using errcode = 'P0001';
  end if;

  update bookings
  set status = 'cancelled', cancelled_by = p_cancelled_by, cancel_reason = p_reason
  where id = p_booking_id;

  if b.recurring_slot_id is not null then
    perform generate_bookings_from_recurring_slot(b.recurring_slot_id, 1);
  end if;
end;
$$;
```

### 11.2 DB function: `reschedule_booking` (`0041_reschedule_with_substitute_coach.sql`)

```sql
create or replace function reschedule_booking(
  p_booking_id uuid, p_new_start timestamptz, p_new_duration_minutes int default null,
  p_enforce_cutoff boolean default true, p_new_coach_id uuid default null
)
returns void
language plpgsql
as $$
declare
  b bookings%rowtype;
  new_duration int;
  target_coach_id uuid;
  cutoff_hours int := get_setting_int('reschedule_cutoff_hours');
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found or b.status <> 'upcoming' then
    raise exception 'Only upcoming bookings can be rescheduled' using errcode = 'P0001';
  end if;

  if p_enforce_cutoff and extract(epoch from (b.scheduled_start - now())) / 3600.0 < cutoff_hours then
    raise exception 'Too close to the session start to reschedule (cutoff is % hours)', cutoff_hours using errcode = 'P0001';
  end if;

  new_duration := coalesce(p_new_duration_minutes, b.duration_minutes);
  target_coach_id := coalesce(p_new_coach_id, b.coach_id);

  if not is_slot_within_working_hours(target_coach_id, p_new_start, new_duration) then
    raise exception 'Coach is not available at this time' using errcode = 'P0001';
  end if;
  if has_scheduling_conflict(target_coach_id, p_new_start, new_duration, p_booking_id) then
    raise exception 'This slot is no longer available' using errcode = 'P0001';
  end if;

  update bookings
  set scheduled_start = p_new_start, duration_minutes = new_duration, coach_id = target_coach_id
  where id = p_booking_id;
end;
$$;
```

### 11.3 Service layer: `cancelBooking` (`bookings.service.ts`)

```ts
export async function cancelBooking(accessToken: string, bookingId: string, reason?: string) {
  const ctx = await getCallerContext(accessToken);
  const enforceCutoff = ctx.role !== "admin";
  const booking = await getBooking(accessToken, bookingId);
  const { error } = await ctx.client.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_cancelled_by: ctx.userId,
    p_reason: reason ?? null,
    p_enforce_cutoff: enforceCutoff,
  });
  if (error) throw error;

  await Promise.all([
    cleanupZoomMeeting(bookingId, (booking as any).zoom_meeting_id ?? null),
    logTimelineEvent((booking as any).client_id, "session_cancelled", "Session cancelled", {
      description: reason,
      actorId: ctx.userId,
      metadata: { bookingId },
    }),
  ]);

  const notifyCtx = await resolveSessionNotifyContext((booking as any).client_id, (booking as any).coach_id);
  const sessionTime = formatSessionTime((booking as any).scheduled_start);

  if (ctx.role === "client") {
    const clientName = notifyCtx.clientName;
    await Promise.all([
      notifyCoach(notifyCtx, "session_cancelled_by_client", { client_name: clientName, session_time: sessionTime }),
      notifyAdmins("admin_alert", {
        alert_message: `${clientName} cancelled their session scheduled for ${sessionTime}.`,
      }),
    ]);
  } else {
    // Coach or admin cancelled -- the client was never told at all before
    // this, regardless of who acted.
    await notifyClient(notifyCtx, "session_cancelled_client", {
      coach_name: notifyCtx.coachName ?? "your coach",
      session_time: sessionTime,
      reason_line: reason ? ` Reason: ${reason}` : "",
    });
  }
}
```

### 11.4 Service layer: `rescheduleBooking` (`bookings.service.ts`)

```ts
export const MAX_RESCHEDULES_PER_WEEK = 2;
export const RESCHEDULE_WINDOW_DAYS = 30;

export async function countReschedulesThisWeek(accessToken: string, clientId: string): Promise<number> {
  const now = new Date();
  const weekStart = startOfWeekUTC(now);
  const weekEnd = endOfWeekUTC(now);
  const timeline = await listClientTimeline(accessToken, clientId);
  return timeline.filter((t) => {
    if (t.event_type !== "session_rescheduled") return false;
    const at = new Date(t.created_at);
    return at >= weekStart && at < weekEnd;
  }).length;
}

/** newCoachId, when given, moves this ONE booking to a substitute coach --
 * used when the client's desired new time isn't free with their own coach.
 * recurring_slot_id (and the coach it points at) is untouched, so future
 * auto-generated occurrences keep going to the original coach with no
 * separate reversion step needed. */
export async function rescheduleBooking(accessToken: string, bookingId: string, newStart: string, newDurationMinutes?: number, newCoachId?: string) {
  const ctx = await getCallerContext(accessToken);
  const enforceCutoff = ctx.role !== "admin";
  const booking = await getBooking(accessToken, bookingId);

  // Forward-window + weekly-limit + no-double-booking-per-day checks are
  // client-only business rules (Admin overrides everything, per policy) --
  // kept in the app layer rather than the RPC.
  if (ctx.role === "client") {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + RESCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const newStartDate = new Date(newStart);
    if (newStartDate < now || newStartDate >= windowEnd) {
      throw new Error(`The new session time must fall within the next ${RESCHEDULE_WINDOW_DAYS} days.`);
    }

    const [reschedulesThisWeek, busyDates] = await Promise.all([
      countReschedulesThisWeek(accessToken, (booking as any).client_id),
      getClientBusyDates(accessToken, (booking as any).client_id, bookingId),
    ]);
    if (reschedulesThisWeek >= MAX_RESCHEDULES_PER_WEEK) {
      throw new Error("You have already used your maximum reschedule limit for this week.");
    }
    if (busyDates.has(istDateString(newStart))) {
      throw new Error("You already have another session booked on that day.");
    }
  }

  const { error } = await ctx.client.rpc("reschedule_booking", {
    p_booking_id: bookingId,
    p_new_start: newStart,
    p_new_duration_minutes: newDurationMinutes ?? null,
    p_enforce_cutoff: enforceCutoff,
    p_new_coach_id: newCoachId ?? null,
  });
  if (error) throw error;

  // The old meeting's start time is now wrong -- delete it and let
  // ensureZoomMeetingForBooking create a fresh one, lazily, for the new time.
  await Promise.all([
    cleanupZoomMeeting(bookingId, (booking as any).zoom_meeting_id ?? null),
    logTimelineEvent((booking as any).client_id, "session_rescheduled", "Session rescheduled", {
      description: `${new Date((booking as any).scheduled_start).toLocaleString()} → ${new Date(newStart).toLocaleString()}`,
      actorId: ctx.userId,
      metadata: { bookingId },
    }),
  ]);

  const clientName = (booking as any).client?.profile?.full_name ?? "Client";
  const targetCoachId = newCoachId ?? (booking as any).coach_id;
  const notifyCtx = await resolveSessionNotifyContext((booking as any).client_id, targetCoachId);
  const oldTime = formatSessionTime((booking as any).scheduled_start);
  const newTime = formatSessionTime(newStart);

  const notifications: Promise<unknown>[] = [
    notifyClient(
      notifyCtx,
      "session_rescheduled_client",
      { coach_name: notifyCtx.coachName ?? "your coach", old_session_time: oldTime, new_session_time: newTime },
      "session_rescheduled"
    ),
  ];

  if (ctx.role === "admin") {
    notifications.push(notifyCoach(notifyCtx, "admin_changed_schedule", { client_name: clientName, session_time: newTime }));
  }

  if (ctx.role === "client") {
    notifications.push(
      notifyCoach(notifyCtx, "session_rescheduled_by_client", { client_name: clientName, old_session_time: oldTime, new_session_time: newTime }),
      notifyAdmins("admin_alert", { alert_message: `${clientName} rescheduled their session from ${oldTime} to ${newTime}.` })
    );
  }

  await Promise.all(notifications);
  return;
}
```

### 11.5 Client actions layer (`client-portal.actions.ts`)

```ts
export async function cancelSessionAction(bookingId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const token = await requireToken();
    await cancelBooking(token, bookingId);
    return null;
  });
}

export interface RescheduleOptions {
  coach: CoachView;
  durationMinutes: number;
  slots: { start: string; end: string }[];
  reschedulesUsedThisWeek: number;
  reschedulesRemaining: number;
  cutoffHours: number;
  startHour: number;
  endHour: number;
}

export async function getRescheduleOptionsAction(bookingId: string): Promise<ActionResult<RescheduleOptions>> {
  return runAction(async () => {
    const token = await requireToken();
    const client = await getMyClientProfile(token);
    const booking: any = await getBooking(token, bookingId);
    if (booking.client?.id !== client.id) throw new Error("Not your session");
    if (booking.status !== "upcoming") throw new Error("Only upcoming sessions can be rescheduled");

    const settings = await getAllSettings(token);
    const cutoffHours = Number(settings.find((s) => s.key === "reschedule_cutoff_hours")?.value ?? 1);
    const hoursUntil = (new Date(booking.scheduled_start).getTime() - Date.now()) / 3600000;
    if (hoursUntil < cutoffHours) {
      throw new Error(`Too close to the session start to reschedule (cutoff is ${cutoffHours} hour${cutoffHours === 1 ? "" : "s"}).`);
    }

    const usedThisWeek = await countReschedulesThisWeek(token, client.id);
    const remaining = Math.max(0, MAX_RESCHEDULES_PER_WEEK - usedThisWeek);
    if (remaining <= 0) {
      throw new Error("You have already used your maximum reschedule limit for this week.");
    }

    const coach = toCoachView(booking.coach);
    if (!coach) throw new Error("Coach not found");

    const now = new Date();
    const windowEnd = new Date(now.getTime() + RESCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const [rawSlots, busyDates, { startHour, endHour }] = await Promise.all([
      getOpenSlots(token, coach.id, fmt(now), fmt(windowEnd), booking.duration_minutes),
      getClientBusyDates(token, client.id, bookingId),
      getBookingWindow(token),
    ]);
    const nowMs = now.getTime();
    const windowEndMs = windowEnd.getTime();
    const slots = rawSlots.filter((s) => {
      const startMs = new Date(s.start).getTime();
      if (startMs <= nowMs || startMs >= windowEndMs) return false;
      return !busyDates.has(istDateString(s.start));
    });

    return { coach, durationMinutes: booking.duration_minutes, slots, reschedulesUsedThisWeek: usedThisWeek, reschedulesRemaining: remaining, cutoffHours, startHour, endHour };
  });
}

export interface CoachClosestSlot {
  coachId: string;
  coachName: string;
  isOwnCoach: boolean;
  start: string;
  end: string;
}

/** Backs the "Fastest Available" list -- each active coach's own SOONEST
 * open slot in the reschedule window, sorted earliest-first. */
export async function getClosestSlotsPerCoachAction(bookingId: string): Promise<ActionResult<CoachClosestSlot[]>> {
  return runAction(async () => {
    const token = await requireToken();
    const client = await getMyClientProfile(token);
    const booking: any = await getBooking(token, bookingId);
    if (booking.client?.id !== client.id) throw new Error("Not your session");
    if (booking.status !== "upcoming") throw new Error("Only upcoming sessions can be rescheduled");

    const now = new Date();
    const windowEnd = new Date(now.getTime() + RESCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const nowMs = now.getTime();
    const windowEndMs = windowEnd.getTime();

    const [allCoaches, busyDates] = await Promise.all([listCoaches(token), getClientBusyDates(token, client.id, bookingId)]);
    const activeCoaches = (allCoaches as any[]).filter((c) => c.status === "active");

    const results = await Promise.all(
      activeCoaches.map(async (c): Promise<CoachClosestSlot | null> => {
        const rawSlots = await getOpenSlots(token, c.id, fmt(now), fmt(windowEnd), booking.duration_minutes);
        const nextFree = rawSlots.find((s) => {
          const startMs = new Date(s.start).getTime();
          if (startMs <= nowMs || startMs >= windowEndMs) return false;
          return !busyDates.has(istDateString(s.start));
        });
        if (!nextFree) return null;
        return { coachId: c.id, coachName: c.profile?.full_name ?? "Coach", isOwnCoach: c.id === booking.coach_id, start: nextFree.start, end: nextFree.end };
      })
    );

    return results.filter((r): r is CoachClosestSlot => r !== null).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  });
}

export async function rescheduleSessionAction(bookingId: string, newStart: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const token = await requireToken();
    await rescheduleBooking(token, bookingId, newStart);
    return null;
  });
}

export interface RescheduleTimeCheck {
  desiredStart: string;
  available: boolean;
  candidates: SubstituteCoachCandidate[];
}

export async function checkRescheduleTimeAction(bookingId: string, desiredDate: string, desiredTime: string): Promise<ActionResult<RescheduleTimeCheck>> {
  return runAction(async () => {
    const token = await requireToken();
    const client = await getMyClientProfile(token);
    const booking: any = await getBooking(token, bookingId);
    if (booking.client?.id !== client.id) throw new Error("Not your session");
    if (booking.status !== "upcoming") throw new Error("Only upcoming sessions can be rescheduled");

    const desiredStart = istWallClockToInstant(desiredDate, desiredTime).toISOString();
    if (new Date(desiredStart).getTime() <= Date.now()) {
      throw new Error("Pick a time in the future.");
    }
    const busyDates = await getClientBusyDates(token, client.id, bookingId);
    if (busyDates.has(istDateString(desiredStart))) {
      throw new Error("You already have another session booked on that day.");
    }

    const freeWithOwnCoach = await isSlotFreeForCoach(token, booking.coach_id, desiredStart, booking.duration_minutes);
    if (freeWithOwnCoach) return { desiredStart, available: true, candidates: [] };

    const candidates = await findSubstituteCoachCandidates(token, {
      excludeCoachId: booking.coach_id,
      slotStart: desiredStart,
      durationMinutes: booking.duration_minutes,
    });
    return { desiredStart, available: false, candidates };
  });
}

export async function rescheduleSessionToSubstituteAction(bookingId: string, newStart: string, substituteCoachId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const token = await requireToken();
    await rescheduleBooking(token, bookingId, newStart, undefined, substituteCoachId);
    return null;
  });
}

export interface SchedulingRules {
  cancellationCutoffHours: number;
  rescheduleCutoffHours: number;
  reschedulesUsedThisWeek: number;
  reschedulesRemaining: number;
}

export async function getSchedulingRulesAction(): Promise<ActionResult<SchedulingRules>> {
  return runAction(async () => {
    const token = await requireToken();
    const client = await getMyClientProfile(token);
    const settings = await getAllSettings(token);
    const cancellationCutoffHours = Number(settings.find((s) => s.key === "cancellation_cutoff_hours")?.value ?? 12);
    const rescheduleCutoffHours = Number(settings.find((s) => s.key === "reschedule_cutoff_hours")?.value ?? 1);
    const reschedulesUsedThisWeek = await countReschedulesThisWeek(token, client.id);
    return {
      cancellationCutoffHours,
      rescheduleCutoffHours,
      reschedulesUsedThisWeek,
      reschedulesRemaining: Math.max(0, MAX_RESCHEDULES_PER_WEEK - reschedulesUsedThisWeek),
    };
  });
}
```

### 11.6 Admin actions (`admin-sessions.actions.ts`) — same functions, admin role

```ts
export async function rescheduleSessionAction(bookingId: string, newStart: string, newDurationMinutes?: number): Promise<ActionResult<null>> {
  return runAction(async () => {
    const token = await requireToken();
    await rescheduleBooking(token, bookingId, newStart, newDurationMinutes);
    return null;
  });
}

export async function cancelSessionAction(bookingId: string, reason?: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const token = await requireToken();
    await cancelBooking(token, bookingId, reason);
    return null;
  });
}
```
The behavior fork (no cutoff/weekly-limit/window/same-day checks) happens entirely **inside** `cancelBooking`/`rescheduleBooking` based on `ctx.role`, resolved server-side from the caller's auth token — admin never passes an explicit "skip checks" flag from the client, so there's no client-forgeable bypass.

### 11.7 Client "My Sessions" row logic (`MySessionsClient.tsx`, excerpt)

```ts
const canCancel = s.status === "upcoming" && hrs > rules.cancellationCutoffHours;
const canReschedule = s.status === "upcoming" && hrs > rules.rescheduleCutoffHours;
const cancellableUntil = new Date(new Date(s.date).getTime() - rules.cancellationCutoffHours * 3600000);
const reschedulableUntil = new Date(new Date(s.date).getTime() - rules.rescheduleCutoffHours * 3600000);
```
```tsx
{canCancel ? "Cancellable until" : "Cancellation window closed —"} {formatDate(cancellableUntil)} · {formatTime(cancellableUntil)}
{canReschedule ? "Reschedulable until" : "Reschedule window closed —"} {formatDate(reschedulableUntil)} · {formatTime(reschedulableUntil)}
```
```tsx
description={`Sessions must be cancelled at least ${rules.cancellationCutoffHours} hour${rules.cancellationCutoffHours === 1 ? "" : "s"} before…`}
```

### 11.8 Coach read-only views (`coach-portal.actions.ts`, excerpt)

```ts
export interface CoachCancelledSessionView {
  bookingId: string;
  clientName: string;
  scheduledStart: string;
  cancelledAt: string;
  cancelledByRole: "client" | "admin" | "coach" | null;
  reason: string | null;
}

export async function getCoachCancelledSessionsAction(): Promise<ActionResult<CoachCancelledSessionView[]>> {
  return runAction(async () => {
    const token = await requireToken();
    const rows = await listCancelledBookingsForCoach(token);
    return rows.map((b: any) => ({
      bookingId: b.id,
      clientName: b.client?.profile?.full_name ?? "Client",
      scheduledStart: b.scheduled_start,
      cancelledAt: b.updated_at,
      cancelledByRole: b.cancelled_by_profile?.role ?? null,
      reason: b.cancel_reason,
    }));
  });
}
```

---

## 12. Suggested mobile implementation shape

- One `bookings`-equivalent entity for both session types — no separate cancel/reschedule code path keyed on `session_type`.
- Two server-read settings (`cancellationCutoffHours`, `rescheduleCutoffHours`), fetched live on every relevant screen load — never cache them across app sessions without a refresh mechanism, since admin can change them at any time.
- A single `cancelBooking(bookingId, reason?)` server function and a single `rescheduleBooking(bookingId, newStart, newDurationMinutes?, newCoachId?)` server function, both branching internally on caller role (client vs admin) for which checks apply — mirror §11.3/§11.4 exactly, including which checks are skipped for admin and which (working-hours/conflict) never are.
- `countReschedulesThisWeek` should be derived from a timeline/audit-log query (`event_type === 'session_rescheduled'`, current Monday-start week), not a separate counter column — this is the existing app's deliberate anti-drift pattern (same rationale as `subscription_usage_view` in `business-rules.md`).
- The client UI's cutoff/limit displays are pure presentation computed from the same live settings + the same weekly count the server would use — but never treat a client-side "allowed" computation as authorization; the server-side action re-validates independently every time.
- Substitute-coach reschedule needs: (a) a "check if free" query against the *desired* coach+slot, (b) a fallback query for *other* coaches free at that exact instant, (c) a reschedule call that accepts an optional target-coach override without touching `recurring_slot_id`.

