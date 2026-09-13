/**
 * Coach utilization ranking — the "lowest-utilization-first" coach-matching
 * rule (ClientPortal.md §10 `findAvailableCoach`): active coaches sorted
 * ascending by their count of `upcoming` bookings. Shared by demo-booking
 * (first-time/no-preference matching) and recurring-schedule (first-time
 * schedule setup and coach-change matching) — both previously either used
 * this correctly (demo-booking) or picked candidates in arbitrary query
 * order (recurring-schedule); this is the single implementation both use.
 */
import { supabase } from '@/lib/supabase/client';

export type UtilizationRankedCoach = { id: string; full_name: string; gender: string | null };

export async function getActiveCoachesByUtilization(): Promise<UtilizationRankedCoach[]> {
  const [{ data: coaches, error: coachError }, { data: bookings, error: bookingError }] = await Promise.all([
    supabase.from('coach_profiles').select('id, status, gender, profiles(full_name)').eq('status', 'active'),
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
      return {
        id: c.id as string,
        full_name: profile?.full_name ?? 'Coach',
        gender: (c.gender as string | null) ?? null,
        utilization: utilization.get(c.id as string) ?? 0,
      };
    })
    .sort((a, b) => a.utilization - b.utilization)
    .map(({ id, full_name, gender }) => ({ id, full_name, gender }));
}
