/**
 * Book a Free Demo (assessment session) — LEANR_PT_MOBILE_PRD.md §15
 * "Demo/assessment booking", §10 `/client/demo-booking`. Ported to match
 * mobile-app-reference/audit/demo-booking-workflow.md (the web app's exact
 * spec) line-for-line where the schema allows:
 *
 * - This builds the AUTHENTICATED path only: an existing signed-up
 *   client books their free assessment session through the same
 *   create_temporary_booking -> confirm_booking hold->confirm pair as
 *   ad-hoc booking (booking-wizard.ts), with `session_type='assessment'`
 *   and `amount_paid=0`.
 * - The web app's OTHER demo entry point, `createAssessmentBooking()`,
 *   is for anonymous prospects with **no account yet** and writes to a
 *   separate `assessment_sessions` lead-capture table — out of scope here,
 *   see anonymous-demo-booking.ts.
 * - Coach matching (`findDemoSlot`): spec §2.3 steps 5-7 — candidate TIMES
 *   are tried in order (preferred time first if given, else the full
 *   hourly grid), and for each time every active coach (ranked ascending
 *   by utilization, filtered by gender if given) is checked in order; the
 *   first coach+time combination that's open wins immediately, with no
 *   slot list ever shown to the client and no confirmation step
 *   (`bookDemoSession` books it in one shot). Utilization is approximated
 *   by ascending count of `upcoming` bookings (coach-utilization.ts) since
 *   this app has no `coach_utilization_view` equivalent to read directly —
 *   same ascending load-balancing intent as the web app's view.
 */
import {
  confirmHold,
  getOpenSlotsForCoachOnDate,
  holdSlot,
  hourlyGridSlots,
  istHourToUtcInstant,
  type IstDate,
} from '@/lib/data/booking-wizard';
import { getActiveCoachesByUtilization, type UtilizationRankedCoach } from '@/lib/data/coach-utilization';
import { getMyClientProfileId } from '@/lib/data/identity';
import { assertMeasurementsFresh } from '@/lib/data/measurement-status';
import { supabase } from '@/lib/supabase/client';

export type GenderPreference = 'male' | 'female' | 'other';

export type DemoSlotMatch = { coach: UtilizationRankedCoach; slotStart: string };

/**
 * Demo (assessment) slot search — web spec §2.3 steps 5-7 / §9.1 / §9.5:
 * candidate TIMES are tried in order (preferred time first if given, else
 * the full hourly grid), and for each time every active coach (already
 * ranked ascending by utilization, filtered by gender if given) is checked
 * in order; the first coach+time combination that's actually open wins
 * immediately. This is the opposite loop nesting from a coach-first search
 * — the client's preferred time is honored over "keep the least-busy coach
 * at any cost".
 *
 * The preferred-time lookup is index-free by construction (§9.1): the web
 * app never indexes into its grid, it string-matches `preferredTime` and
 * moves it to the front of whatever the current grid happens to be, so
 * it's correct regardless of the booking window's bounds at call time. This
 * mirrors that with `istHourToUtcInstant` computing the preferred slot's
 * instant directly, rather than deriving it from `hour - window.startHour`
 * (which broke silently whenever an admin changed the window hours).
 *
 * Each coach's full-day open-slot set is fetched lazily and memoized (§9.5)
 * — only pulled the first time it's actually checked, so a match found
 * among the first one or two ranked coaches never pays for every other
 * active coach's availability query, restoring the early-exit the original
 * coach-first loop had (without the RPC-per-slot shape the web app uses,
 * which isn't wired into this app's Supabase project).
 */
export async function findDemoSlot(
  date: IstDate,
  durationMinutes: number,
  window: { startHour: number; endHour: number },
  preferredTime?: string,
  genderPreference?: GenderPreference
): Promise<DemoSlotMatch | null> {
  const coaches = await getActiveCoachesByUtilization(genderPreference);
  if (coaches.length === 0) return null;

  const grid = hourlyGridSlots(date, window);
  const preferredIso = preferredTime ? istHourToUtcInstant(date, Number(preferredTime.split(':')[0])).toISOString() : undefined;
  const timesToTry = preferredIso ? [preferredIso, ...grid.filter((iso) => iso !== preferredIso)] : grid;

  const openSlotsByCoach = new Map<string, Promise<Set<string>>>();
  const openSlotsFor = (coachId: string) => {
    let pending = openSlotsByCoach.get(coachId);
    if (!pending) {
      pending = getOpenSlotsForCoachOnDate(coachId, date, durationMinutes, window).then((slots) => new Set(slots));
      openSlotsByCoach.set(coachId, pending);
    }
    return pending;
  };

  for (const slotIso of timesToTry) {
    if (new Date(slotIso).getTime() <= Date.now()) continue;
    for (const coach of coaches) {
      const openSlots = await openSlotsFor(coach.id);
      if (openSlots.has(slotIso)) {
        return { coach, slotStart: slotIso };
      }
    }
  }
  return null;
}

export type DemoBookingResult = {
  bookingId: string;
  coachId: string;
  coachName: string;
  coachPhoto: string | null;
  slotStart: string;
};

/**
 * Ties the search + hold->confirm pipeline together in one shot — web spec
 * §2.3 step 7 / §8.5: no slot list is ever shown to the client and no
 * separate confirmation step exists, the top-ranked option found by
 * findDemoSlot is immediately booked.
 */
export async function bookDemoSession(
  date: IstDate,
  durationMinutes: number,
  window: { startHour: number; endHour: number },
  preferredTime?: string,
  genderPreference?: GenderPreference
): Promise<DemoBookingResult> {
  await assertMeasurementsFresh(); // web spec §2.1 — server-equivalent re-check, mirrors the client-side gate on the form

  const match = await findDemoSlot(date, durationMinutes, window, preferredTime, genderPreference);
  if (!match) {
    throw new Error('No coaches are available for that date or time -- try a different date or time.');
  }

  const holdId = await holdSlot(match.coach.id, match.slotStart, durationMinutes);
  const bookingId = await confirmHold(holdId, null, { sessionType: 'assessment', amountPaid: 0 });

  return {
    bookingId,
    coachId: match.coach.id,
    coachName: match.coach.full_name,
    coachPhoto: match.coach.photo_url,
    slotStart: match.slotStart,
  };
}

export type DemoAssignedCoach = {
  bookingId: string;
  coachId: string;
  coachName: string;
  coachPhoto: string | null;
  scheduledStart: string;
  status: string;
};

/**
 * The client's most recent demo booking, cancelled ones excluded — web spec
 * §2.6/§6.5: "cancelled demo bookings are excluded from this lookup... a
 * client who cancelled reads as never having demoed, free to book again."
 * Feeds the journey-state demo stages, the Book-a-Session read-only "already
 * booked" card, and the My Coach fallback card (§2.8) — all need the same
 * "latest non-cancelled demo" row, just different subsets of its fields.
 */
export async function getDemoAssignedCoach(): Promise<DemoAssignedCoach | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data, error } = await supabase
    .from('bookings')
    .select('id, coach_id, scheduled_start, status, coach_profiles(profiles(full_name, photo_url))')
    .eq('client_id', clientId)
    .eq('session_type', 'assessment')
    .in('status', ['upcoming', 'completed', 'missed'])
    .order('scheduled_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const coachProfile = data.coach_profiles as
    | { profiles?: { full_name?: string; photo_url?: string } | { full_name?: string; photo_url?: string }[] }
    | null;
  const profile = coachProfile ? (Array.isArray(coachProfile.profiles) ? coachProfile.profiles[0] : coachProfile.profiles) : null;

  return {
    bookingId: data.id as string,
    coachId: data.coach_id as string,
    coachName: profile?.full_name ?? 'Coach',
    coachPhoto: profile?.photo_url ?? null,
    scheduledStart: data.scheduled_start as string,
    status: data.status as string,
  };
}

export type LatestDemoBooking = { status: string; scheduledStart: string };

/** Narrow view of `getDemoAssignedCoach` for callers (demo-booking.tsx's own "already booked" guard) that only need status/timing, not coach detail. */
export async function getLatestDemoBooking(): Promise<LatestDemoBooking | null> {
  const demo = await getDemoAssignedCoach();
  if (!demo) return null;
  return { status: demo.status, scheduledStart: demo.scheduledStart };
}

/**
 * web spec §9.3: must share the exact same "does this client have a demo on
 * record" predicate as `getLatestDemoBooking` (cancelled excluded) — an
 * independently-written count query here previously drifted from that
 * predicate (it counted cancelled bookings too), so a client whose only
 * demo was cancelled saw a stale "you already have one on record" notice
 * while simultaneously being correctly allowed to rebook. Deriving from the
 * same source makes that drift impossible.
 */
export async function hasExistingAssessment(): Promise<boolean> {
  return (await getLatestDemoBooking()) !== null;
}

export type UnratedDemo = { bookingId: string; coachName: string | null };

/** New PRD.md §4.A Book Session screen: "demo_completed -> DemoFeedbackGateClient (rate-or-skip)" — the most recent completed, not-yet-rated assessment booking, if any. */
export async function getUnratedCompletedDemo(): Promise<UnratedDemo | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data, error } = await supabase
    .from('bookings')
    .select('id, quality_rating, coach_profiles(profiles(full_name))')
    .eq('client_id', clientId)
    .eq('session_type', 'assessment')
    .eq('status', 'completed')
    .is('quality_rating', null)
    .order('scheduled_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const coachProfile = data.coach_profiles as { profiles?: { full_name?: string } | { full_name?: string }[] } | null;
  const profile = coachProfile ? (Array.isArray(coachProfile.profiles) ? coachProfile.profiles[0] : coachProfile.profiles) : null;
  return { bookingId: data.id as string, coachName: profile?.full_name ?? null };
}
