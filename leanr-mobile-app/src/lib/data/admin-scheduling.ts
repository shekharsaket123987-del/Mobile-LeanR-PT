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

// note mirrors web's per-bucket context string (cancel reason / "From <old
// time>" / "Covering <primary coach> through <end date>") — `id` is a real
// booking id for every bucket except `shadow`, where (matching web exactly)
// it's the shadow_coach_assignments row id, not a booking id.
export type AdminSchedulingRow = Booking & { coach_name: string | null; client_name: string | null; note: string | null };

function withNames(row: Record<string, unknown>, note: string | null = null): AdminSchedulingRow {
  const coachProfile = row.coach_profiles as { profiles?: { full_name?: string } | { full_name?: string }[] } | null;
  const coachP = coachProfile ? (Array.isArray(coachProfile.profiles) ? coachProfile.profiles[0] : coachProfile.profiles) : null;
  const clientProfile = row.client_profiles as { profiles?: { full_name?: string } | { full_name?: string }[] } | null;
  const clientP = clientProfile ? (Array.isArray(clientProfile.profiles) ? clientProfile.profiles[0] : clientProfile.profiles) : null;
  const { coach_profiles: _c, client_profiles: _cl, ...rest } = row;
  return { ...rest, coach_name: coachP?.full_name ?? null, client_name: clientP?.full_name ?? null, note } as AdminSchedulingRow;
}

export async function getAdminScheduling(): Promise<Record<SchedulingBucket, AdminSchedulingRow[]>> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();
  const todayStr = now.toDateString();

  const select = '*, coach_profiles(profiles(full_name)), client_profiles(profiles(full_name))';

  const [todaysCandidatesRes, cancelledRes, rescheduledRes, manualRes, demoRes, shadowAssignmentsRes] = await Promise.all([
    // Web's todaysChanges predicate needs updated_at/created_at/status/was_rescheduled
    // together, not expressible server-side as one filter — fetch today's
    // candidates, then apply the exact same predicate as admin-scheduling.actions.ts.
    supabase.from('bookings').select(select).or(`updated_at.gte.${todayIso},created_at.gte.${todayIso}`).order('updated_at', { ascending: false }).limit(100),
    supabase.from('bookings').select(select).eq('status', 'cancelled').order('scheduled_start', { ascending: false }).limit(30),
    supabase.from('bookings').select(select).eq('was_rescheduled', true).order('scheduled_start', { ascending: false }).limit(30),
    supabase.from('bookings').select(select).is('recurring_slot_id', null).is('assessment_session_id', null).order('scheduled_start', { ascending: false }).limit(30),
    supabase.from('bookings').select(select).eq('session_type', 'assessment').order('scheduled_start', { ascending: false }).limit(30),
    supabase
      .from('shadow_coach_assignments')
      .select(
        'id, starts_on, ends_on, status, client:client_profiles(profiles(full_name)), primary_coach:coach_profiles!primary_coach_id(profiles(full_name)), shadow_coach:coach_profiles!shadow_coach_id(profiles(full_name))'
      )
      .order('created_at', { ascending: false })
      .limit(30),
  ]);
  for (const res of [todaysCandidatesRes, cancelledRes, rescheduledRes, manualRes, demoRes, shadowAssignmentsRes]) {
    if (res.error) throw res.error;
  }

  // Mirrors admin-scheduling.actions.ts's todaysChanges filter exactly:
  // (cancelled AND updated today) OR (was_rescheduled AND updated today) OR created today.
  const todaysChanges = (todaysCandidatesRes.data ?? []).filter((b: any) => {
    const updatedToday = new Date(b.updated_at).toDateString() === todayStr;
    const createdToday = new Date(b.created_at).toDateString() === todayStr;
    return (b.status === 'cancelled' && updatedToday) || (b.was_rescheduled && updatedToday) || createdToday;
  });

  // Mirrors web exactly: one row per shadow_coach_assignments record (not a
  // derived booking match) — id is the assignment id.
  const shadow: AdminSchedulingRow[] = (shadowAssignmentsRes.data ?? []).map((a: any) => {
    const clientName = firstProfile(a.client)?.full_name ?? 'Client';
    const shadowCoachName = firstProfile(a.shadow_coach)?.full_name ?? 'Coach';
    const primaryCoachName = firstProfile(a.primary_coach)?.full_name ?? 'primary coach';
    return {
      id: a.id,
      client_name: clientName,
      coach_name: shadowCoachName,
      session_type: 'regular',
      scheduled_start: a.starts_on,
      status: a.status,
      note: `Covering ${primaryCoachName} through ${a.ends_on}`,
    } as unknown as AdminSchedulingRow;
  });

  return {
    todaysChanges: todaysChanges.map((b: any) => withNames(b)),
    cancelled: (cancelledRes.data ?? []).map((b: any) => withNames(b, b.cancel_reason ?? null)),
    rescheduled: (rescheduledRes.data ?? []).map((b: any) =>
      withNames(b, b.original_scheduled_start ? `From ${new Date(b.original_scheduled_start).toLocaleString()}` : null)
    ),
    manual: (manualRes.data ?? []).map((b: any) => withNames(b)),
    demo: (demoRes.data ?? []).map((b: any) => withNames(b)),
    shadow,
  };
}

function firstProfile(rel: unknown): { full_name?: string } | null {
  const outer = rel as { profiles?: { full_name?: string } | { full_name?: string }[] } | { profiles?: { full_name?: string } | { full_name?: string }[] }[] | null;
  const o = Array.isArray(outer) ? outer[0] : outer;
  const p = o?.profiles;
  return Array.isArray(p) ? p[0] ?? null : p ?? null;
}
