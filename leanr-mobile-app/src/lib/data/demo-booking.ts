/**
 * Book a Free Demo (assessment session) — LEANR_PT_MOBILE_PRD.md §15
 * "Demo/assessment booking", §10 `/client/demo-booking`. Confirmed
 * against the real schema on 2026-08-18:
 *
 * - This builds the AUTHENTICATED path only: an existing signed-up
 *   client books their free assessment session through the same
 *   create_temporary_booking -> confirm_booking hold->confirm pair as
 *   ad-hoc booking (booking-wizard.ts), with `session_type='assessment'`
 *   and `amount_paid=0` (the 6-arg `confirm_booking` overload — see
 *   `confirmHold`'s updated signature there).
 * - The web app's OTHER demo entry point, `createAssessmentBooking()`,
 *   is for anonymous prospects with **no account yet** and writes to a
 *   separate `assessment_sessions` lead-capture table — a public,
 *   unauthenticated marketing surface with its own RLS/route
 *   requirements. Every screen in this mobile app assumes a logged-in
 *   role (client/coach/admin route groups gated in each `_layout.tsx`);
 *   building an anonymous flow would mean a whole new ungated route tree,
 *   not a variation on this screen. Deliberately out of scope, not a
 *   schema-risk blocker.
 * - Coach matching: `findDemoSlots()` "searches ALL active coaches,
 *   client never picks, sorted by utilization, over the hourly grid".
 *   Reproduced as a simplified single pass, not a full multi-coach merge:
 *   active coaches are ordered by ascending upcoming-booking count
 *   (`bookings` is broadly SELECT-able by any authenticated user, per
 *   the identical read this app already relies on in bookings.ts), and
 *   for the client's chosen date, the first coach in that order with any
 *   open slot is used.
 */
import { getOpenSlotsForCoachOnDate, type IstDate } from '@/lib/data/booking-wizard';
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';

type UtilizationRankedCoach = { id: string; full_name: string };

async function getActiveCoachesByUtilization(): Promise<UtilizationRankedCoach[]> {
  const [{ data: coaches, error: coachError }, { data: bookings, error: bookingError }] = await Promise.all([
    supabase.from('coach_profiles').select('id, status, profiles(full_name)').eq('status', 'active'),
    supabase.from('bookings').select('coach_id').eq('status', 'upcoming'),
  ]);
  if (coachError) throw coachError;
  if (bookingError) throw bookingError;

  const utilization = new Map<string, number>();
  for (const b of bookings ?? []) {
    utilization.set(b.coach_id, (utilization.get(b.coach_id) ?? 0) + 1);
  }

  return (coaches ?? [])
    .map((c) => {
      const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
      return { id: c.id as string, full_name: profile?.full_name ?? 'Coach', utilization: utilization.get(c.id as string) ?? 0 };
    })
    .sort((a, b) => a.utilization - b.utilization)
    .map(({ id, full_name }) => ({ id, full_name }));
}

export type DemoMatch = { coach: UtilizationRankedCoach; slots: string[] };

/** First (lowest-utilization) active coach with any open slot on the given date, and their open slots. */
export async function findDemoMatch(
  date: IstDate,
  durationMinutes: number,
  window: { startHour: number; endHour: number }
): Promise<DemoMatch | null> {
  const coaches = await getActiveCoachesByUtilization();

  for (const coach of coaches) {
    const slots = await getOpenSlotsForCoachOnDate(coach.id, date, durationMinutes, window);
    if (slots.length > 0) return { coach, slots };
  }
  return null;
}

export async function hasExistingAssessment(): Promise<boolean> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return false;

  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('session_type', 'assessment');
  if (error) throw error;
  return (count ?? 0) > 0;
}

