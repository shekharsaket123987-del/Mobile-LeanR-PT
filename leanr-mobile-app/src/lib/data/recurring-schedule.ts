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
 * - First-time coach matching (a client with no coach yet) is handled by
 *   `findCoachForSchedule` with `preference: 'no_preference'` or `'new'` —
 *   it falls straight through to `listCandidateCoaches`'s
 *   utilization-ranked search, same as the coach-change/renewal path.
 * - Changing an existing schedule cancels the old `recurring_slots` rows
 *   AND every still-upcoming `bookings` row generated under them
 *   (recurrsing-slot.md §5.3/§9.12) — retire-then-recreate, not a bare
 *   insert of new rows on top of old ones left dangling.
 * - Not atomic: each day's insert + generate call is a separate request
 *   (no client-side transactions against Supabase REST/RPC), so a
 *   failure partway through can leave a partial pattern. Documented, not
 *   silently risked — the UI surfaces exactly what succeeded.
 */
import { getMyCoach } from '@/lib/data/coach';
import { getActiveCoachesByUtilization } from '@/lib/data/coach-utilization';
import { getMyClientProfileId } from '@/lib/data/identity';
import { getMySubscription } from '@/lib/data/subscription';
import { logTimelineEvent } from '@/lib/data/timeline';
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

type AvailabilityRow = { day_of_week: number; start_time: string; end_time: string };

/**
 * Pure business-rule core of `getCommonAvailableHours` below, split out
 * so it's unit-testable without a Supabase round-trip (LEANR_PT_MOBILE_PRD.md
 * §29 "business rule regression suite"). §13 rule 18: only whole-hour
 * slots within `window` are ever considered; §13 rule 19 (leave-agnostic
 * collision check) is honored by construction — this only ever looks at
 * `coach_availability` rows, never `coach_leave`.
 */
export function computeCommonHours(
  availabilityRows: AvailabilityRow[],
  daysOfWeek: number[],
  durationMinutes: number,
  window: { startHour: number; endHour: number }
): number[] {
  if (daysOfWeek.length === 0) return [];

  const byDay = new Map<number, { start_time: string; end_time: string }[]>();
  for (const row of availabilityRows) {
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

  return computeCommonHours((data ?? []) as AvailabilityRow[], daysOfWeek, durationMinutes, window);
}

/**
 * Trainer Preference / Gender — New PRD.md §4.A Schedule Setup screen.
 * Candidates are ordered lowest-utilization-first (ClientPortal.md §10
 * `findAvailableCoach`'s "least-busy coach first" rule) — this returns the
 * first least-busy active coach (matching the gender filter, if any) whose
 * weekly template covers every selected day at some common hour, not an
 * arbitrary-order match.
 */
export type TrainerPreference = 'same' | 'new' | 'no_preference';
export type TrainerGenderPreference = 'male' | 'female' | 'no_preference';

export type CoachMatchCandidate = { id: string; full_name: string };

async function listCandidateCoaches(
  genderPreference: TrainerGenderPreference,
  excludeCoachId?: string
): Promise<CoachMatchCandidate[]> {
  const ranked = await getActiveCoachesByUtilization();
  return ranked
    .filter((c) => c.id !== excludeCoachId)
    .filter((c) => genderPreference === 'no_preference' || c.gender === genderPreference)
    .map(({ id, full_name }) => ({ id, full_name }));
}

/**
 * Finds a coach + common available hour for the selected days, honoring
 * Trainer Preference/Gender. `preference: 'same'` never searches other
 * coaches — a no-match there is reported as such, exactly like today's
 * plain (pre-preference) behavior.
 */
export async function findCoachForSchedule(
  daysOfWeek: number[],
  durationMinutes: number,
  window: { startHour: number; endHour: number },
  preference: TrainerPreference,
  genderPreference: TrainerGenderPreference
): Promise<{ coach: CoachMatchCandidate; hours: number[] } | null> {
  const myCoach = await getMyCoach();

  if (preference === 'same') {
    if (!myCoach) return null;
    const hours = await getCommonAvailableHours(myCoach.id, daysOfWeek, durationMinutes, window);
    return hours.length > 0 ? { coach: { id: myCoach.id, full_name: myCoach.full_name ?? 'Coach' }, hours } : null;
  }

  const candidates =
    preference === 'no_preference' && myCoach
      ? [{ id: myCoach.id, full_name: myCoach.full_name ?? 'Coach' }, ...(await listCandidateCoaches(genderPreference, myCoach.id))]
      : await listCandidateCoaches(genderPreference, preference === 'new' ? myCoach?.id : undefined);

  for (const candidate of candidates) {
    const hours = await getCommonAvailableHours(candidate.id, daysOfWeek, durationMinutes, window);
    if (hours.length > 0) return { coach: candidate, hours };
  }
  return null;
}

export type SetupResult = { dayOfWeek: number; requested: number; confirmed: number };

/**
 * Renewal `renewal_scheduling`'s "Keep My Schedule" — recurrsing-slot.md
 * §6.1/§9.12/§11.6 `keepRenewalSchedule`: the client's existing ACTIVE
 * `recurring_slots` rows are simply repointed (`subscription_id` updated)
 * to the new subscription — coach/days/time carry over completely
 * untouched, zero bookings cancelled or regenerated. This is one of only
 * two repoint-in-place exceptions to the platform's usual retire-then-
 * recreate rule (the other being admin's fast-path coach reassignment,
 * `transferClientCoach` in admin-clients.ts) — deliberately NOT a
 * cancel-and-recreate, unlike `setUpRecurringSchedule` below.
 *
 * Previously this created a brand-new set of `recurring_slots` (copying
 * day/time/coach) and generated 4 fresh bookings instead of repointing —
 * wrong shape (the old rows are never cancelled by anything when a
 * subscription retires, confirmed via pg_trigger: no cascade exists — so
 * they're still `status='active'` at this point) and would have left the
 * client with two overlapping sets of upcoming bookings for the same
 * day/time once both this and generate_bookings_from_recurring_slot ran.
 */
export async function carryOverRecurringSchedule(newSubscriptionId: string): Promise<void> {
  const clientId = await getMyClientProfileId();
  if (!clientId) throw new Error('Could not resolve your client profile.');

  const { data: activeSlots, error } = await supabase.from('recurring_slots').select('id').eq('client_id', clientId).eq('status', 'active');
  if (error) throw error;
  if (!activeSlots || activeSlots.length === 0) throw new Error('No active recurring schedule to carry over — set one up instead.');

  const { error: repointError } = await supabase
    .from('recurring_slots')
    .update({ subscription_id: newSubscriptionId })
    .in('id', activeSlots.map((s) => s.id));
  if (repointError) throw repointError;

  await logTimelineEvent(clientId, 'plan_renewed', 'Plan renewed', {
    description: 'Kept the same trainer and schedule',
    metadata: { subscriptionId: newSubscriptionId },
  });
}

export async function setUpRecurringSchedule(
  daysOfWeek: number[],
  hour: number,
  durationMinutes: number,
  coachId?: string
): Promise<SetupResult[]> {
  const clientId = await getMyClientProfileId();
  if (!clientId) throw new Error('Could not resolve your client profile.');
  let targetCoachId = coachId;
  if (!targetCoachId) {
    const coach = await getMyCoach();
    if (!coach) throw new Error('No coach assigned yet.');
    targetCoachId = coach.id;
  }
  const subscription = await getMySubscription();
  if (!subscription) throw new Error('You need an active plan first.');

  // recurrsing-slot.md §5.3/§9.12: changing a schedule is retire-THEN-recreate — the
  // old slots' still-upcoming bookings must be cancelled too, or they're left dangling
  // as duplicate sessions with a coach/time the client no longer has a pattern for.
  // Already fixed once for the coach-change edge function's equivalent path
  // (supabase/functions/coach-change-actions/index.ts's "GAP-03" comment) but missed here.
  const { data: oldSlots, error: oldSlotsError } = await supabase
    .from('recurring_slots')
    .select('id')
    .eq('client_id', clientId)
    .eq('status', 'active');
  if (oldSlotsError) throw oldSlotsError;
  const oldSlotIds = (oldSlots ?? []).map((s) => s.id as string);

  if (oldSlotIds.length > 0) {
    const { error: cancelSlotsError } = await supabase.from('recurring_slots').update({ status: 'cancelled' }).in('id', oldSlotIds);
    if (cancelSlotsError) throw cancelSlotsError;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: cancelBookingsError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_by: user?.id ?? null, cancel_reason: 'Client changed their recurring schedule' })
      .in('recurring_slot_id', oldSlotIds)
      .eq('status', 'upcoming');
    if (cancelBookingsError) throw cancelBookingsError;
  }

  const startTime = `${pad(hour)}:00:00`;
  const results: SetupResult[] = [];

  for (const dayOfWeek of daysOfWeek) {
    const { data: slot, error } = await supabase
      .from('recurring_slots')
      .insert({
        client_id: clientId,
        coach_id: targetCoachId,
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

  // web spec §3: fires on first-time schedule setup (new client) -- coach-CHANGE flows log
  // their own `coach_changed` event separately (coach-change.ts/admin-coach-change.ts), so this
  // path is specifically "a coach being assigned for the first time", not a replacement.
  await logTimelineEvent(clientId, 'coach_assigned', 'Coach assigned', { metadata: { coachId: targetCoachId } });
  await logTimelineEvent(clientId, 'slot_assigned', 'Recurring schedule set', { metadata: { subscriptionId: subscription.id, days: daysOfWeek, hour } });

  return results;
}
