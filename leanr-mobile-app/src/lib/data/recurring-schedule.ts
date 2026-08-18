/**
 * My Schedule (recurring weekly pattern) — LEANR_PT_MOBILE_PRD.md §15
 * "Recurring pattern" mechanism, §13 rules 18-19. Confirmed against the
 * real schema/RLS on 2026-08-18:
 *
 * - A "pattern" is N separate `recurring_slots` rows (one per selected
 *   weekday), not one row — confirmed by the table having no
 *   client-count constraint and `day_of_week` being a single smallint
 *   per row. `generate_bookings_from_recurring_slot(slot_id, count)` is
 *   called once per row to materialize its first real `bookings` rows
 *   (4 here, matching §15's "creates the first 4 real bookings").
 * - Clients CAN insert/update their own `recurring_slots` directly
 *   (`recurring_slots_insert_own`/`_update_own`) — unlike coach-change
 *   stage 2 or payments, this is NOT a privileged-server-only operation.
 * - **§13 rule 19 is deliberately honored, not just noted**: "recurring
 *   collision check against other clients' patterns is leave-agnostic."
 *   This file only checks the coach's permanent weekly template
 *   (`coach_availability`) — never `coach_leave` — when picking a time,
 *   matching that rule. It also can't check for a same-slot conflict
 *   against *other clients'* recurring_slots at all: RLS only lets a
 *   client SELECT their own recurring_slots
 *   (`recurring_slots_select_own`), not every client's, so a true
 *   cross-client collision check is invisible to this app. The real
 *   safety net is `generate_bookings_from_recurring_slot`'s own
 *   SECURITY DEFINER conflict check at occurrence-generation time (it
 *   calls `has_scheduling_conflict()` per candidate date and simply
 *   skips a date that's actually double-booked) — which is exactly why
 *   `setUpRecurringSchedule` below reports back how many of the
 *   requested 4 occurrences per day actually got confirmed, rather than
 *   assuming success.
 * - This build implements a simplified version of §15's 4-step fallback
 *   ladder: instead of "try requested time -> try any grid time -> try
 *   day-pair fallbacks", it shows the client every hour that works
 *   across ALL their selected days as a plain set of time chips — same
 *   end result (an honored, actually-available time), one fewer hidden
 *   substitution step. The "same-trio 2-day pairs" fallback (steps 3-4)
 *   isn't reproduced; if nothing overlaps, the client is told to try
 *   different days.
 * - Coach matching for a client with no coach yet is out of scope here,
 *   same simplification as the ad-hoc booking wizard (Phase 5) — this
 *   sets up a schedule with the client's already-assigned coach only.
 * - Changing an existing schedule cancels the old `recurring_slots` rows
 *   and inserts new ones — it does NOT cancel bookings already generated
 *   under the old pattern (no cascade spec found for this in the PRD);
 *   those stay visible in Sessions until their own status changes.
 * - Not atomic: each day's insert + generate call is a separate request
 *   (no client-side transactions against Supabase REST/RPC), so a
 *   failure partway through can leave a partial pattern. Documented, not
 *   silently risked — the UI surfaces exactly what succeeded.
 */
import { getMyCoach } from '@/lib/data/coach';
import { getMyClientProfileId } from '@/lib/data/identity';
import { getMySubscription } from '@/lib/data/subscription';
import { supabase } from '@/lib/supabase/client';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Monday=1..Saturday=6 — Sunday (0) is always off (§13 rule 18). */
export const WEEKDAYS: { dow: number; short: string }[] = [
  { dow: 1, short: 'Mon' },
  { dow: 2, short: 'Tue' },
  { dow: 3, short: 'Wed' },
  { dow: 4, short: 'Thu' },
  { dow: 5, short: 'Fri' },
  { dow: 6, short: 'Sat' },
];

export const PATTERN_PRESETS = [
  { key: 'mwf', label: 'Mon / Wed / Fri', days: [1, 3, 5] },
  { key: 'tts', label: 'Tue / Thu / Sat', days: [2, 4, 6] },
  { key: 'sixday', label: 'Mon – Sat', days: [1, 2, 3, 4, 5, 6] },
] as const;

export type RecurringSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  status: 'active' | 'paused' | 'cancelled';
};

export async function getMyActiveRecurringSlots(): Promise<RecurringSlot[]> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('recurring_slots')
    .select('id, day_of_week, start_time, duration_minutes, status')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('day_of_week', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RecurringSlot[];
}

/** Whole hours where the coach's weekly template covers the full session on EVERY given weekday. */
export async function getCommonAvailableHours(
  coachId: string,
  daysOfWeek: number[],
  durationMinutes: number,
  window: { startHour: number; endHour: number }
): Promise<number[]> {
  if (daysOfWeek.length === 0) return [];

  const { data, error } = await supabase
    .from('coach_availability')
    .select('day_of_week, start_time, end_time')
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .in('day_of_week', daysOfWeek);
  if (error) throw error;

  const byDay = new Map<number, { start_time: string; end_time: string }[]>();
  for (const row of data ?? []) {
    const list = byDay.get(row.day_of_week) ?? [];
    list.push(row);
    byDay.set(row.day_of_week, list);
  }

  const hours: number[] = [];
  for (let hour = window.startHour; hour < window.endHour; hour++) {
    const slotStart = `${pad(hour)}:00:00`;
    const endTotal = hour * 60 + durationMinutes;
    const slotEnd = `${pad(Math.floor(endTotal / 60))}:${pad(endTotal % 60)}:00`;
    const worksEveryDay = daysOfWeek.every((dow) =>
      (byDay.get(dow) ?? []).some((w) => w.start_time <= slotStart && w.end_time >= slotEnd)
    );
    if (worksEveryDay) hours.push(hour);
  }
  return hours;
}

export type SetupResult = { dayOfWeek: number; requested: number; confirmed: number };

export async function setUpRecurringSchedule(daysOfWeek: number[], hour: number, durationMinutes: number): Promise<SetupResult[]> {
  const clientId = await getMyClientProfileId();
  if (!clientId) throw new Error('Could not resolve your client profile.');
  const coach = await getMyCoach();
  if (!coach) throw new Error('No coach assigned yet.');
  const subscription = await getMySubscription();
  if (!subscription) throw new Error('You need an active plan first.');

  const { error: cancelError } = await supabase
    .from('recurring_slots')
    .update({ status: 'cancelled' })
    .eq('client_id', clientId)
    .eq('status', 'active');
  if (cancelError) throw cancelError;

  const startTime = `${pad(hour)}:00:00`;
  const results: SetupResult[] = [];

  for (const dayOfWeek of daysOfWeek) {
    const { data: slot, error } = await supabase
      .from('recurring_slots')
      .insert({
        client_id: clientId,
        coach_id: coach.id,
        subscription_id: subscription.id,
        day_of_week: dayOfWeek,
        start_time: startTime,
        duration_minutes: durationMinutes,
        status: 'active',
      })
      .select('id')
      .single();
    if (error) throw error;

    const { data: generated, error: genError } = await supabase.rpc('generate_bookings_from_recurring_slot', {
      p_recurring_slot_id: slot.id,
      p_count: 4,
    });
    if (genError) throw genError;
    results.push({ dayOfWeek, requested: 4, confirmed: (generated ?? []).length });
  }

  return results;
}
