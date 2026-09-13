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
import { getActiveCoachesByUtilization, type UtilizationRankedCoach } from '@/lib/data/coach-utilization';
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';

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

export type LatestDemoBooking = { status: string; scheduledStart: string };

/** Most recent assessment booking regardless of status — used to distinguish demo_booked/demo_completed journey stages and the Subscription screen's pre-purchase "Demo Package" card. */
export async function getLatestDemoBooking(): Promise<LatestDemoBooking | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data, error } = await supabase
    .from('bookings')
    .select('status, scheduled_start')
    .eq('client_id', clientId)
    .eq('session_type', 'assessment')
    .order('scheduled_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { status: data.status as string, scheduledStart: data.scheduled_start as string };
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

