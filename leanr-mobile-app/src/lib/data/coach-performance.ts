/**
 * Coach Performance Dashboard — LEANR_PT_MOBILE_PRD.md §5 "Coach
 * Performance Dashboard", §13 rule 21: "Coach rating recomputed live
 * from all non-null trainer_rating values on their bookings after every
 * new rating — not a stored/incrementally-maintained field." Note
 * `coach_profiles` DOES have `rating`/`review_count` columns (confirmed
 * live), but per that rule they're treated as a cache the web app
 * recomputes rather than trusts — this file computes fresh from
 * `bookings.trainer_rating` directly, same discipline, not reading the
 * possibly-stale columns.
 */
import { getMyCoachProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';

export type CoachPerformance = {
  completedSessions: number;
  upcomingSessions: number;
  missedSessions: number;
  averageTrainerRating: number | null;
  ratingCount: number;
};

export async function getMyPerformance(): Promise<CoachPerformance> {
  const coachId = await getMyCoachProfileId();
  if (!coachId) {
    return { completedSessions: 0, upcomingSessions: 0, missedSessions: 0, averageTrainerRating: null, ratingCount: 0 };
  }

  const [completedRes, upcomingRes, missedRes] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).eq('status', 'completed'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).eq('status', 'upcoming'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).eq('status', 'missed'),
  ]);
  if (completedRes.error) throw completedRes.error;
  if (upcomingRes.error) throw upcomingRes.error;
  if (missedRes.error) throw missedRes.error;

  const { data: ratings, error: ratingsError } = await supabase
    .from('bookings')
    .select('trainer_rating')
    .eq('coach_id', coachId)
    .not('trainer_rating', 'is', null);
  if (ratingsError) throw ratingsError;

  const values = (ratings ?? []).map((r) => r.trainer_rating as number);
  const averageTrainerRating = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

  return {
    completedSessions: completedRes.count ?? 0,
    upcomingSessions: upcomingRes.count ?? 0,
    missedSessions: missedRes.count ?? 0,
    averageTrainerRating,
    ratingCount: values.length,
  };
}
