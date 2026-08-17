/**
 * Streak + milestone computation — LEANR_PT_NEXTGEN_APP_PRD.md §8.
 * Deliberately pure client-side arithmetic over data already fetched
 * (`bookings.status='completed'`) — no new backend entity, matching the
 * PRD's explicit constraint that this layer is "a new visual/motivational
 * treatment of data the original PRD already stores," not new scope.
 */
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';
import type { Booking } from './types';

export async function getCompletedBookings(): Promise<Booking[]> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .order('scheduled_start', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Booking[];
}

/** Start of the ISO week (Monday 00:00) a date falls in, as a stable key. */
function isoWeekKey(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Consecutive-weeks streak, counting back from the current week. A week
 * with zero completed sessions breaks the streak. §8: "Session streak
 * (‘5-week streak’ flame chip) — consecutive weeks with ≥1
 * bookings.status='completed'".
 */
export function computeWeekStreak(completedBookings: Booking[]): number {
  const weeksWithSession = new Set(completedBookings.map((b) => isoWeekKey(new Date(b.scheduled_start))));

  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = isoWeekKey(cursor);
    if (!weeksWithSession.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return streak;
}

export const MILESTONES = [10, 25, 50, 100] as const;

/** The milestone hit exactly by this session count, if any — used to trigger CelebrationOverlay once. */
export function milestoneHitAt(sessionCount: number): (typeof MILESTONES)[number] | null {
  return MILESTONES.find((m) => m === sessionCount) ?? null;
}
