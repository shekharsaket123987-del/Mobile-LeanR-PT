/**
 * Recurring schedule engine — ported line-for-line from
 * mobile-app-reference/audit/recurring-slot.md, the reverse-engineered
 * spec of the web app's actual `scheduling.service.ts`. That doc is
 * authoritative; where this file's behavior differs from a prior pass, the
 * doc's §9 numbered rules win. Deliberately kept as **three separate
 * matcher functions** rather than one "smart" matcher (doc §10):
 *
 *   - `findAvailableCoachExact` — first-time setup / "New Trainer" / the
 *     "No Preference" widening step. Exact pattern+time only, whole
 *     roster, ranked by ascending utilization. No fallback ladder ever.
 *   - `matchRecurringPatternForCoach` — "Same Trainer" (and the first step
 *     of "No Preference"). The one place with a real fallback ladder:
 *     exact time -> any other grid time -> same-trio pairs at preferred
 *     time -> pairs at any other time -> null. Never changes coach.
 *   - `checkAdminSlotAssignment` — admin's manual assignment check: same
 *     patternFreeAt test, but on failure returns up to 5 alternative times
 *     for the same coach AND up to 5 other free coaches, instead of a
 *     bare pass/fail.
 *
 * Two commit shapes, also kept separate (doc §10/§12):
 *   - `createRecurringSlots` — pure additive (first-time setup AND the
 *     tail end of a change, per doc §5.3 step 4 "same createRecurringSlots
 *     path as first-time setup").
 *   - `changeMyRecurringSchedule` — retire-then-recreate: deactivate the
 *     old slots, cancel their still-upcoming bookings, then call
 *     `createRecurringSlots`.
 *   `carryOverRecurringSchedule` (renewal "Keep My Schedule" — repoint in
 *   place, zero cancellations) is the third, structurally different shape
 *   and stays separate from both.
 *
 * **Flagged deviations from the doc, not silent ones** (doc's own
 * instruction: call these out before working around them):
 *
 * 1. §4.2's `isDayTimeFreeForCoach` has a second check this app cannot
 *    reproduce: a cross-client collision read against `recurring_slots`,
 *    which on web runs through an admin-privileged connection. This app's
 *    RLS (`recurring_slots_select_own`) only lets a client read their OWN
 *    recurring_slots — a different client's pattern is structurally
 *    invisible here, confirmed via `pg_policies`. The mitigation already
 *    built into this codebase (and kept as-is) is the real safety net the
 *    doc itself names: `generate_bookings_from_recurring_slot` is
 *    SECURITY DEFINER and does its own per-occurrence conflict check
 *    (`has_scheduling_conflict`) at generation time, so a same-slot
 *    collision simply fails to generate that occurrence rather than
 *    double-booking the coach — `createRecurringSlots` below reports back
 *    exactly how many of the requested 4 occurrences were confirmed per
 *    day, instead of assuming all 4 landed. A true pre-check would need a
 *    new privileged Edge Function (this app's existing pattern for
 *    anything service-role, e.g. `admin-provisioning`) — not built here
 *    since the doc's own fallback already covers the double-booking risk;
 *    flagging as a deliberate scope line, not an oversight.
 * 2. §4.3/§11.5's `ensureConversationForCoachAssignment` needs the same
 *    admin-privileged insert — confirmed live via `pg_policies` that
 *    `conversations` has NO client/coach INSERT policy at all (only
 *    `conversations_admin_all`). This is the exact same boundary this
 *    codebase already hit and documented for coach-change-requests
 *    (README: "the Coach tab shows a conversation only if one already
 *    exists") — the same accepted tradeoff is reused here rather than
 *    building new Edge Function infrastructure for it unprompted.
 * 3. §11.3's IST-timezone warning does NOT apply here — checked the live
 *    `generate_bookings_from_recurring_slot` definition directly
 *    (`pg_get_functiondef`) and it already combines date+time via
 *    `at time zone 'Asia/Kolkata'`, the correct fix the doc's own
 *    migration `0026` describes. No workaround needed.
 * 4. §5.3's "no reschedule-cutoff applies to this flow at all" is NOT
 *    fully true on this schema: `enforce_bookings_update_business_rules`
 *    (a `BEFORE UPDATE` trigger on `bookings`, confirmed live via
 *    `pg_get_functiondef` — not visible in the doc's Next.js-side
 *    reference code at all) independently rejects ANY non-admin
 *    cancellation inside `reschedule_cutoff_hours` of a session's start,
 *    with no carve-out for "this cancel came from a schedule change."
 *    `changeMyRecurringSchedule`'s bulk-cancel step can therefore fail
 *    with "Too close to the session start to cancel" if one of the
 *    client's current upcoming sessions is imminent — a real, DB-level
 *    constraint this client-only app cannot bypass (only `is_admin()` or
 *    a null `auth.uid()` skip the trigger's checks entirely). Flagging
 *    rather than silently accepting a partial failure: fixing it for real
 *    would mean altering the trigger to also exempt this specific
 *    call path, a schema change outside a client-side port's scope to
 *    make unprompted. Also fixed a related, must-fix (not just flagged)
 *    issue this trigger surfaced: it requires `cancelled_by` to equal the
 *    acting `auth.uid()` on any cancel, which the doc's own reference
 *    code (written for a privileged `supabaseAdmin` caller) never sets —
 *    added below.
 * 5. **Significant, codebase-wide, not scoped to this file**: `notifications`
 *    has NO client/coach INSERT policy at all — confirmed live via
 *    `pg_policies` (`notifications_admin_all`/`_select_own`/`_update_own`
 *    only) AND by directly probing a real client-authenticated REST insert,
 *    which returned `403 "new row violates row-level security policy"`.
 *    `notifyProfile()` (notify.ts) swallows ALL insert errors by design
 *    ("a notification failure must never block the real action"), so every
 *    `schedule_assigned_*`/`schedule_changed_*` call this file makes
 *    silently no-ops instead of erroring — and the SAME is true of every
 *    other client/coach-triggered `notifyProfile` call anywhere else in
 *    this app (bookings.ts, progress.ts, coach-change.ts, etc.), not just
 *    here. This is a pre-existing gap this task surfaced, not something
 *    introduced by this port; not fixed here since the real fix (an RLS
 *    policy letting a client/coach insert a notification for their linked
 *    counterpart) is a security-relevant schema change affecting the whole
 *    app, not this feature alone — needs an explicit decision, not a
 *    silent migration slipped in under a scheduling-engine task.
 */
import { getMyCoach } from '@/lib/data/coach';
import { getActiveCoachesByUtilization } from '@/lib/data/coach-utilization';
import type { GenderPreference } from '@/lib/data/demo-booking';
import { getMyClientProfileId } from '@/lib/data/identity';
import { notifyAdmins, notifyProfile, resolveProfileIdForClient, resolveProfileIdForCoach } from '@/lib/data/notify';
import { logTimelineEvent } from '@/lib/data/timeline';
import { supabase } from '@/lib/supabase/client';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Monday=1..Saturday=6 — Sunday (0) is never bookable for a recurring pattern (doc §9 rule 6). */
export const WEEKDAYS: { dow: number; short: string }[] = [
  { dow: 1, short: 'Mon' },
  { dow: 2, short: 'Tue' },
  { dow: 3, short: 'Wed' },
  { dow: 4, short: 'Thu' },
  { dow: 5, short: 'Fri' },
  { dow: 6, short: 'Sat' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type PatternKey = 'mwf' | 'tts' | 'sixday' | 'custom';

/** doc §4.1/§11.4 `DAY_GROUPS`. */
export const DAY_GROUPS: Record<'mwf' | 'tts' | 'sixday', number[]> = {
  mwf: [1, 3, 5],
  tts: [2, 4, 6],
  sixday: [1, 2, 3, 4, 5, 6],
};

export const PATTERN_PRESETS = [
  { key: 'mwf' as const, label: 'Mon / Wed / Fri', days: DAY_GROUPS.mwf },
  { key: 'tts' as const, label: 'Tue / Thu / Sat', days: DAY_GROUPS.tts },
  { key: 'sixday' as const, label: 'Mon – Sat', days: DAY_GROUPS.sixday },
];

/** doc §4.1/§9.7: "2 Days a Week" is these 6 curated pairs only — not any arbitrary 2-of-6 combination. */
export const PAIRS_MWF: [number, number][] = [[1, 3], [1, 5], [3, 5]];
export const PAIRS_TTS: [number, number][] = [[2, 4], [2, 6], [4, 6]];

/**
 * doc §4.4/§9 rule 14: recurring-slot sessions are always 60 minutes,
 * independent of the *separate* 45-minute default that only applies to
 * non-recurring ad-hoc "Book a Session" bookings after a client's first
 * session (booking-wizard.ts's `defaultSessionDurationMinutes`) — kept as
 * its own constant here on purpose so a future change to that unrelated
 * setting can never silently change recurring-slot duration too.
 */
export const RECURRING_SESSION_DURATION_MINUTES = 60;

export type RecurringSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  status: 'active' | 'paused' | 'cancelled';
};

/** `knownClientId` lets a caller that has already resolved its own client id (journey.ts) skip the redundant round trip. */
export async function getMyActiveRecurringSlots(knownClientId?: string): Promise<RecurringSlot[]> {
  const clientId = knownClientId ?? (await getMyClientProfileId());
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

/** doc §9 rule 6/7: Sunday is never selectable, and `custom` needs 2-5 days — enforced server-side too, not just by the UI's day picker omitting Sunday. */
function resolveDays(pattern: PatternKey, customDays?: number[]): number[] {
  if (pattern === 'custom') {
    if (!customDays || customDays.length < 2 || customDays.length > 5) {
      throw new Error('Custom schedule needs between 2 and 5 days.');
    }
    if (customDays.includes(0)) {
      throw new Error("Sunday is a holiday and isn't available for scheduling.");
    }
    return customDays;
  }
  return [...DAY_GROUPS[pattern]];
}

function hourlyGrid(window: { startHour: number; endHour: number }): number[] {
  return Array.from({ length: window.endHour - window.startHour }, (_, i) => window.startHour + i);
}

type AvailabilityRow = { day_of_week: number; start_time: string; end_time: string };

/**
 * Pure business-rule core, unit-testable without a Supabase round-trip.
 * doc §11.4 `isDayTimeFreeForCoach`'s template-coverage half (the
 * cross-client collision half is the flagged deviation #1 above) —
 * §9 rule 11: only `coach_availability`, never `coach_leave`, which must
 * never block setting up a *permanent* pattern.
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

/** doc §11.4 `patternFreeAt` — whole pattern must fit ONE coach at ONE hour (doc §9 rule 9). */
async function patternFreeAt(
  coachId: string,
  days: number[],
  hour: number,
  durationMinutes: number,
  window: { startHour: number; endHour: number }
): Promise<boolean> {
  const hours = await getCommonAvailableHours(coachId, days, durationMinutes, window);
  return hours.includes(hour);
}

export type TrainerPreference = 'same' | 'new' | 'no_preference';
export type { GenderPreference };

export type CoachMatchCandidate = { id: string; full_name: string };

// ---------------------------------------------------------------------
// Matcher 1: exact-match-only, whole roster — first-time setup / "New
// Trainer" / the widening step of "No Preference". doc §9 rule 8: no
// pattern-widening, no time-widening, ever.
// ---------------------------------------------------------------------

export type ExactMatchResult = { coach: CoachMatchCandidate; days: number[]; hour: number };

export async function findAvailableCoachExact(
  pattern: PatternKey,
  hour: number,
  window: { startHour: number; endHour: number },
  options?: { customDays?: number[]; excludeCoachId?: string; genderPreference?: GenderPreference; durationMinutes?: number }
): Promise<ExactMatchResult | null> {
  const days = resolveDays(pattern, options?.customDays);
  const durationMinutes = options?.durationMinutes ?? RECURRING_SESSION_DURATION_MINUTES;

  // doc §9 rule 10: coach ranking is always ascending utilization % wherever the whole roster is searched.
  const ranked = await getActiveCoachesByUtilization(options?.genderPreference);
  const candidates = options?.excludeCoachId ? ranked.filter((c) => c.id !== options.excludeCoachId) : ranked;
  if (candidates.length === 0) return null;

  // Each candidate's check is independent of the others' results — checking them together
  // and then picking the first (highest-priority) match is behaviorally identical to a
  // sequential "first fit wins" loop, just without waiting on N-1 round trips serially.
  const freeFlags = await Promise.all(candidates.map((c) => patternFreeAt(c.id, days, hour, durationMinutes, window)));
  const idx = freeFlags.indexOf(true);
  if (idx === -1) return null;
  const coach = candidates[idx];
  return { coach: { id: coach.id, full_name: coach.full_name }, days, hour };
}

// ---------------------------------------------------------------------
// Matcher 2: same-coach fallback ladder — "Same Trainer" (and step 1 of
// "No Preference"). doc §5.2/§11.4 `matchRecurringPattern`. The ONE place
// with a real multi-step fallback; never changes coach.
// ---------------------------------------------------------------------

export type PatternMatchResult = { days: number[]; hour: number; patternUsed: PatternKey | 'pair'; exact: boolean };

export async function matchRecurringPatternForCoach(
  coachId: string,
  pattern: PatternKey,
  preferredHour: number,
  window: { startHour: number; endHour: number },
  options?: { customDays?: number[]; durationMinutes?: number }
): Promise<PatternMatchResult | null> {
  const durationMinutes = options?.durationMinutes ?? RECURRING_SESSION_DURATION_MINUTES;
  const grid = hourlyGrid(window);

  if (pattern === 'custom') {
    const days = resolveDays('custom', options?.customDays);
    // Step 1: exact pattern @ exact time.
    if (await patternFreeAt(coachId, days, preferredHour, durationMinutes, window)) {
      return { days, hour: preferredHour, patternUsed: 'custom', exact: true };
    }
    // Step 2: exact pattern @ any other grid time. (No pair fallback for custom — there's no
    // "trio" a free-picked day set belongs to.)
    for (const h of grid) {
      if (h === preferredHour) continue;
      if (await patternFreeAt(coachId, days, h, durationMinutes, window)) {
        return { days, hour: h, patternUsed: 'custom', exact: false };
      }
    }
    return null;
  }

  const days = [...DAY_GROUPS[pattern]];

  // Step 1: exact pattern @ exact time.
  if (await patternFreeAt(coachId, days, preferredHour, durationMinutes, window)) {
    return { days, hour: preferredHour, patternUsed: pattern, exact: true };
  }
  // Step 2: exact pattern @ any other grid time.
  for (const h of grid) {
    if (h === preferredHour) continue;
    if (await patternFreeAt(coachId, days, h, durationMinutes, window)) {
      return { days, hour: h, patternUsed: pattern, exact: false };
    }
  }

  // Step 3/4: same-trio 2-day pairs (both trios if pattern was "sixday") @ preferred time, then
  // @ any other grid time.
  const pairsToTry = pattern === 'tts' ? PAIRS_TTS : pattern === 'mwf' ? PAIRS_MWF : [...PAIRS_MWF, ...PAIRS_TTS];
  for (const pair of pairsToTry) {
    if (await patternFreeAt(coachId, pair, preferredHour, durationMinutes, window)) {
      return { days: pair, hour: preferredHour, patternUsed: 'pair', exact: false };
    }
  }
  for (const pair of pairsToTry) {
    for (const h of grid) {
      if (h === preferredHour) continue;
      if (await patternFreeAt(coachId, pair, h, durationMinutes, window)) {
        return { days: pair, hour: h, patternUsed: 'pair', exact: false };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------
// Matcher 3: admin manual-assignment check-with-alternatives. doc §8.4/
// §11.8 `checkAdminSlotAssignment`. On failure, surfaces concrete
// alternatives instead of a bare pass/fail.
// ---------------------------------------------------------------------

export type AdminSlotCheckResult = {
  available: boolean;
  alternativeTimesForSameCoach: number[];
  alternativeCoaches: { coachId: string; fullName: string }[];
};

export async function checkAdminSlotAssignment(
  coachId: string,
  days: number[],
  hour: number,
  window: { startHour: number; endHour: number },
  durationMinutes: number = RECURRING_SESSION_DURATION_MINUTES
): Promise<AdminSlotCheckResult> {
  if (await patternFreeAt(coachId, days, hour, durationMinutes, window)) {
    return { available: true, alternativeTimesForSameCoach: [], alternativeCoaches: [] };
  }

  const grid = hourlyGrid(window).filter((h) => h !== hour);
  const sameCoachFlags = await Promise.all(grid.map((h) => patternFreeAt(coachId, days, h, durationMinutes, window)));
  const alternativeTimesForSameCoach = grid
    .filter((_, i) => sameCoachFlags[i])
    .sort((a, b) => Math.abs(a - hour) - Math.abs(b - hour))
    .slice(0, 5);

  const ranked = await getActiveCoachesByUtilization();
  const others = ranked.filter((c) => c.id !== coachId);
  const otherFlags = await Promise.all(others.map((c) => patternFreeAt(c.id, days, hour, durationMinutes, window)));
  const alternativeCoaches = others
    .filter((_, i) => otherFlags[i])
    .map((c) => ({ coachId: c.id, fullName: c.full_name }))
    .slice(0, 5);

  return { available: false, alternativeTimesForSameCoach, alternativeCoaches };
}

// ---------------------------------------------------------------------
// Commit path 1: pure additive. doc §4.3/§11.5 `createRecurringSlots` —
// used by first-time setup AND as the tail end of a change (doc §5.3
// step 4).
// ---------------------------------------------------------------------

export type CreateSlotsResult = { dayOfWeek: number; requested: number; confirmed: number };

export async function createRecurringSlots(input: {
  coachId: string;
  days: number[];
  hour: number;
  durationMinutes?: number;
  subscriptionId?: string;
}): Promise<CreateSlotsResult[]> {
  const clientId = await getMyClientProfileId();
  if (!clientId) throw new Error('Could not resolve your client profile.');

  // doc §11.5: "isFirstCoach" is checked BEFORE the new rows are inserted, against whatever's
  // still active at this instant — for a change, the caller (changeMyRecurringSchedule) has
  // already deactivated the old slots by the time this runs, so this correctly reads "no coach
  // yet" only for a genuine first-timer, not a client mid-change.
  const { data: priorSlot } = await supabase.from('recurring_slots').select('id').eq('client_id', clientId).eq('status', 'active').limit(1).maybeSingle();
  const isFirstCoach = !priorSlot;

  const durationMinutes = input.durationMinutes ?? RECURRING_SESSION_DURATION_MINUTES;
  const startTime = `${pad(input.hour)}:00:00`;

  const results = await Promise.all(
    input.days.map(async (day): Promise<CreateSlotsResult> => {
      const { data: slot, error } = await supabase
        .from('recurring_slots')
        .insert({
          client_id: clientId,
          coach_id: input.coachId,
          subscription_id: input.subscriptionId ?? null,
          day_of_week: day,
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
      return { dayOfWeek: day, requested: 4, confirmed: (generated ?? []).length };
    })
  );

  const scheduleSummary = `${input.days.map((d) => DAY_NAMES[d]).join('/')} at ${pad(input.hour)}:00`;
  await Promise.all([
    isFirstCoach
      ? logTimelineEvent(clientId, 'coach_assigned', 'Coach assigned', { metadata: { coachId: input.coachId } })
      : Promise.resolve(),
    logTimelineEvent(clientId, 'slot_assigned', 'Recurring schedule set', {
      description: scheduleSummary,
      metadata: { coachId: input.coachId, days: input.days, hour: input.hour },
    }),
    // Deviation #2 (file header): no client-writable INSERT policy exists on `conversations`,
    // so `ensureConversationForCoachAssignment` can't be reproduced here — same accepted
    // tradeoff already documented in this codebase for coach-change-requests.
  ]);

  const [clientProfileIdForNotify, coachProfileId] = await Promise.all([
    resolveProfileIdForClient(clientId),
    resolveProfileIdForCoach(input.coachId),
  ]);
  const coach = await getMyCoach();
  const coachName = coach?.full_name ?? 'your coach';
  await Promise.all([
    notifyProfile(clientProfileIdForNotify, 'booking', 'Weekly schedule confirmed', `Your weekly schedule with ${coachName} is set: ${scheduleSummary}.`, 'schedule_assigned_client'),
    notifyProfile(coachProfileId, 'booking', 'New client schedule assigned', `A client has been scheduled with you: ${scheduleSummary}.`, 'schedule_assigned_coach'),
  ]);

  return results;
}

// ---------------------------------------------------------------------
// Commit path 2: retire-then-recreate. doc §5.3/§11.6
// `changeMyRecurringSchedule` — the one and only path for a mid-plan
// change or a renewal's "No, Change It". Structurally distinct from
// `carryOverRecurringSchedule` below (repoint, zero cancellations).
// ---------------------------------------------------------------------

export async function changeMyRecurringSchedule(input: {
  coachId: string;
  days: number[];
  hour: number;
  durationMinutes?: number;
  /** Set only when committing a renewal's "No, Change It" — routes the timeline log to `plan_renewed` instead of `session_rescheduled` and bills the new pattern against the fresh subscription. */
  subscriptionId?: string;
}): Promise<{ createdSlots: CreateSlotsResult[] }> {
  const clientId = await getMyClientProfileId();
  if (!clientId) throw new Error('Could not resolve your client profile.');

  const { data: activeSlots, error: slotsError } = await supabase
    .from('recurring_slots')
    .select('id')
    .eq('client_id', clientId)
    .eq('status', 'active');
  if (slotsError) throw slotsError;
  if (!activeSlots || activeSlots.length === 0) {
    throw new Error('No active recurring schedule to change — set one up first.');
  }
  const slotIds = activeSlots.map((s) => s.id as string);

  // Deviation #4 (file header): this schema's `enforce_bookings_update_business_rules` trigger
  // (not present in the doc's reference code, which assumes a privileged supabaseAdmin caller)
  // rejects any non-admin cancel where `cancelled_by` isn't the acting auth uid — confirmed live
  // via `pg_get_functiondef`. Required here even though doc §11.6 never sets it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ error: deactivateError }, { error: cancelBookingsError }] = await Promise.all([
    supabase.from('recurring_slots').update({ status: 'cancelled' }).in('id', slotIds),
    supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_by: user?.id ?? null, cancel_reason: 'Client changed their recurring schedule' })
      .in('recurring_slot_id', slotIds)
      .eq('status', 'upcoming'),
  ]);
  if (deactivateError) throw deactivateError;
  if (cancelBookingsError) throw cancelBookingsError;

  const createdSlots = await createRecurringSlots({
    coachId: input.coachId,
    days: input.days,
    hour: input.hour,
    durationMinutes: input.durationMinutes,
    subscriptionId: input.subscriptionId,
  });

  const scheduleSummary = `${input.days.map((d) => DAY_NAMES[d]).join('/')} at ${pad(input.hour)}:00`;
  if (input.subscriptionId) {
    await logTimelineEvent(clientId, 'plan_renewed', 'Plan renewed', {
      description: scheduleSummary,
      metadata: { subscriptionId: input.subscriptionId, coachId: input.coachId },
    });
  } else {
    await logTimelineEvent(clientId, 'session_rescheduled', 'Recurring schedule changed', { description: scheduleSummary });
  }

  const [clientProfileIdForNotify, coachProfileId] = await Promise.all([
    resolveProfileIdForClient(clientId),
    resolveProfileIdForCoach(input.coachId),
  ]);
  const coach = await getMyCoach();
  const coachName = coach?.full_name ?? 'your coach';
  await Promise.all([
    notifyProfile(clientProfileIdForNotify, 'system', 'Schedule changed', `Your recurring schedule with ${coachName} has been updated to ${scheduleSummary}.`, 'schedule_changed_client'),
    notifyProfile(coachProfileId, 'system', 'Client schedule changed', `A client's recurring schedule has been updated to ${scheduleSummary}.`, 'schedule_changed_coach'),
  ]);

  return { createdSlots };
}

/**
 * doc §4.2/§8: "Notify Support" — pings admin when no matcher found anything at all (client
 * offered this after exhausting the picker's own retry options: a 2-day pairing, custom days).
 * Pure notification, no client-facing waitlist row created — matches the real, live
 * `recurring_schedule_unmatched` notification template exactly.
 */
export async function reportScheduleUnmatched(input: { coachName: string | null; patternAttempted: string }): Promise<void> {
  await notifyAdmins(
    'Recurring schedule needs manual matching',
    `A client could not be matched to a recurring schedule${input.coachName ? ` with ${input.coachName}` : ''} (tried ${input.patternAttempted}). Please resolve manually.`,
    'recurring_schedule_unmatched'
  );
}

// ---------------------------------------------------------------------
// Renewal "Keep My Schedule" — repoint in place, zero cancellations.
// Structurally distinct from changeMyRecurringSchedule above (doc §6.1/
// §9 rule 12, §11.6 `keepRenewalSchedule`).
// ---------------------------------------------------------------------

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

/**
 * Diagnostic for when neither matcher above finds anything at all: checks each day on its own
 * (ignoring the others, against the whole active roster) so the client can see exactly which
 * day is the blocker rather than just "no match" — an addition beyond the doc's literal
 * functions, but purely informational (never changes a match outcome) and in the same spirit as
 * the doc's own "no match -> offered a pair/custom retry" messaging.
 */
export async function findDayCoverage(
  daysOfWeek: number[],
  window: { startHour: number; endHour: number },
  genderPreference?: GenderPreference,
  durationMinutes: number = RECURRING_SESSION_DURATION_MINUTES
): Promise<Record<number, boolean>> {
  const ranked = await getActiveCoachesByUtilization(genderPreference);
  const coverage: Record<number, boolean> = {};
  for (const day of daysOfWeek) {
    const hoursByCandidate = await Promise.all(ranked.map((c) => getCommonAvailableHours(c.id, [day], durationMinutes, window)));
    coverage[day] = hoursByCandidate.some((hours) => hours.length > 0);
  }
  return coverage;
}
