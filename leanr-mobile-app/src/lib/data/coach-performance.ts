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

/** Pure core of the §13 rule 21 "recomputed live" average — split out for unit testing without a Supabase round-trip. */
export function computeAverageRating(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

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

  return {
    completedSessions: completedRes.count ?? 0,
    upcomingSessions: upcomingRes.count ?? 0,
    missedSessions: missedRes.count ?? 0,
    averageTrainerRating: computeAverageRating(values),
    ratingCount: values.length,
  };
}

export type Last30DaysPerformance = {
  total: number;
  completed: number;
  cancelled: number;
  rescheduled: number;
};

/**
 * Performance screen "Last 30 Days" summary (mockup) — the PRD's own
 * `getMyPerformanceAction` data isn't time-windowed at all (it's the
 * all-time 14-stat object `getMyPerformance` above already covers), but
 * scoping these 4 specific counts to the last 30 days is a real,
 * derivable view over the same real data, not a fabricated metric.
 */
export async function getMyPerformanceLast30Days(): Promise<Last30DaysPerformance> {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return { total: 0, completed: 0, cancelled: 0, rescheduled: 0 };

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await supabase
    .from('bookings')
    .select('status, was_rescheduled')
    .eq('coach_id', coachId)
    .gte('scheduled_start', since.toISOString());
  if (error) throw error;

  const rows = data ?? [];
  return {
    total: rows.length,
    completed: rows.filter((r) => r.status === 'completed').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
    rescheduled: rows.filter((r) => r.was_rescheduled).length,
  };
}

/**
 * Dashboard "Utilization%" KPI — reads the real, shared `coach_utilization_view`
 * (confirmed columns: coach_id/coach_name/active_clients/utilization_pct)
 * rather than computing a mobile-only formula, so this always matches
 * whatever web shows for the same coach.
 */
export async function getMyUtilization(): Promise<number | null> {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return null;

  const { data, error } = await supabase.from('coach_utilization_view').select('utilization_pct').eq('coach_id', coachId).maybeSingle();
  if (error) throw error;
  return data ? Number(data.utilization_pct) : null;
}
