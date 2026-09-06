/**
 * Admin Scheduling (grouped activity view) — New PRD.md §4.C "Screen:
 * Scheduling" — fully read-only, 6 sections (Today's Changes, Cancelled,
 * Rescheduled, Manual Sessions Created, Demo Sessions, Shadow Sessions),
 * all derived from the same `bookings` dataset bucketed 6 ways.
 *
 * "Manual Sessions Created" uses the same heuristic New PRD.md §4.C
 * documents for the web app (no `created_by` column exists —
 * `recurring_slot_id IS NULL AND assessment_session_id IS NULL` is the
 * same derivation already used for `wasManuallyAdded` on the admin
 * Session Detail screen). "Shadow Sessions" cross-references
 * `shadow_coach_assignments` windows rather than guessing from the
 * booking row alone, since no column on `bookings` itself marks a
 * session as shadow-covered.
 */
import { supabase } from '@/lib/supabase/client';
import type { Booking } from './types';

export type SchedulingBucket = 'todaysChanges' | 'cancelled' | 'rescheduled' | 'manual' | 'demo' | 'shadow';

export type AdminSchedulingRow = Booking & { coach_name: string | null; client_name: string | null };

function withNames(row: Record<string, unknown>): AdminSchedulingRow {
  const coachProfile = row.coach_profiles as { profiles?: { full_name?: string } | { full_name?: string }[] } | null;
  const coachP = coachProfile ? (Array.isArray(coachProfile.profiles) ? coachProfile.profiles[0] : coachProfile.profiles) : null;
  const clientProfile = row.client_profiles as { profiles?: { full_name?: string } | { full_name?: string }[] } | null;
  const clientP = clientProfile ? (Array.isArray(clientProfile.profiles) ? clientProfile.profiles[0] : clientProfile.profiles) : null;
  const { coach_profiles: _c, client_profiles: _cl, ...rest } = row;
  return { ...rest, coach_name: coachP?.full_name ?? null, client_name: clientP?.full_name ?? null } as AdminSchedulingRow;
}

export async function getAdminScheduling(): Promise<Record<SchedulingBucket, AdminSchedulingRow[]>> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const select = '*, coach_profiles(profiles(full_name)), client_profiles(profiles(full_name))';

  const [todaysRes, cancelledRes, rescheduledRes, manualRes, demoRes, shadowAssignmentsRes] = await Promise.all([
    supabase.from('bookings').select(select).gte('updated_at', todayIso).order('updated_at', { ascending: false }).limit(30),
    supabase.from('bookings').select(select).eq('status', 'cancelled').order('scheduled_start', { ascending: false }).limit(30),
    supabase.from('bookings').select(select).eq('was_rescheduled', true).order('scheduled_start', { ascending: false }).limit(30),
    supabase.from('bookings').select(select).is('recurring_slot_id', null).is('assessment_session_id', null).order('scheduled_start', { ascending: false }).limit(30),
    supabase.from('bookings').select(select).eq('session_type', 'assessment').order('scheduled_start', { ascending: false }).limit(30),
    supabase.from('shadow_coach_assignments').select('client_id, shadow_coach_id, starts_on, ends_on').eq('status', 'active'),
  ]);
  for (const res of [todaysRes, cancelledRes, rescheduledRes, manualRes, demoRes, shadowAssignmentsRes]) {
    if (res.error) throw res.error;
  }

  let shadow: AdminSchedulingRow[] = [];
  const assignments = shadowAssignmentsRes.data ?? [];
  if (assignments.length > 0) {
    const clientIds = [...new Set(assignments.map((a) => a.client_id))];
    const { data: candidateBookings, error: candidateError } = await supabase
      .from('bookings')
      .select(select)
      .in('client_id', clientIds)
      .in('status', ['upcoming', 'completed'])
      .order('scheduled_start', { ascending: false })
      .limit(100);
    if (candidateError) throw candidateError;
    shadow = (candidateBookings ?? [])
      .filter((b) =>
        assignments.some(
          (a) =>
            a.client_id === b.client_id &&
            a.shadow_coach_id === b.coach_id &&
            b.scheduled_start >= `${a.starts_on}T00:00:00+05:30` &&
            b.scheduled_start < `${a.ends_on}T23:59:59+05:30`
        )
      )
      .map(withNames);
  }

  return {
    todaysChanges: (todaysRes.data ?? []).map(withNames),
    cancelled: (cancelledRes.data ?? []).map(withNames),
    rescheduled: (rescheduledRes.data ?? []).map(withNames),
    manual: (manualRes.data ?? []).map(withNames),
    demo: (demoRes.data ?? []).map(withNames),
    shadow,
  };
}
