/**
 * Shadow-coach client banner — GAP-05 / web spec §3.2, §16: the assignment/repoint backend
 * (admin-shadow.ts) was already correct; the client never had a "Covering for {coach}"
 * banner. Requires migration 20260914110000 (client SELECT/UPDATE RLS on
 * `shadow_coach_assignments`, which was admin-only before).
 */
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';

export type ActiveShadowCoverage = {
  id: string;
  shadowCoachName: string;
  primaryCoachName: string;
  startsOn: string;
  endsOn: string;
  acknowledged: boolean;
};

export async function getMyActiveShadowCoverage(): Promise<ActiveShadowCoverage | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('shadow_coach_assignments')
    .select(
      'id, starts_on, ends_on, client_acknowledged_at, shadow_coach:coach_profiles!shadow_coach_assignments_shadow_coach_id_fkey(profiles(full_name)), primary_coach:coach_profiles!shadow_coach_assignments_primary_coach_id_fkey(profiles(full_name))'
    )
    .eq('client_id', clientId)
    .eq('status', 'active')
    .gte('ends_on', today)
    .order('starts_on', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const pickName = (rel: unknown): string => {
    const row = Array.isArray(rel) ? rel[0] : rel;
    const profile = row ? (Array.isArray((row as { profiles?: unknown }).profiles) ? (row as { profiles?: { full_name?: string }[] }).profiles?.[0] : (row as { profiles?: { full_name?: string } }).profiles) : null;
    return profile?.full_name ?? 'your coach';
  };

  return {
    id: data.id as string,
    shadowCoachName: pickName((data as Record<string, unknown>).shadow_coach),
    primaryCoachName: pickName((data as Record<string, unknown>).primary_coach),
    startsOn: data.starts_on as string,
    endsOn: data.ends_on as string,
    acknowledged: data.client_acknowledged_at != null,
  };
}

export async function acknowledgeShadowCoverage(id: string): Promise<void> {
  const { error } = await supabase.from('shadow_coach_assignments').update({ client_acknowledged_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export type ShadowAssignmentLite = { shadowCoachId: string; startsOn: string; endsOn: string; primaryCoachName: string };

/**
 * Web spec §10 (Client) / §14.10 — backs the per-session "Shadow Coach" badge, distinct from
 * the single-latest-unread banner above: every active assignment for this client, so a session
 * card can be matched against whichever one actually covers its coach + date. Complementary to
 * the banner, not redundant with it (checklist item 9).
 */
export async function listMyActiveShadowAssignments(): Promise<ShadowAssignmentLite[]> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('shadow_coach_assignments')
    .select('shadow_coach_id, starts_on, ends_on, primary_coach:coach_profiles!shadow_coach_assignments_primary_coach_id_fkey(profiles(full_name))')
    .eq('client_id', clientId)
    .eq('status', 'active');
  if (error) throw error;

  const pickName = (rel: unknown): string => {
    const row = Array.isArray(rel) ? rel[0] : rel;
    const profile = row ? (Array.isArray((row as { profiles?: unknown }).profiles) ? (row as { profiles?: { full_name?: string }[] }).profiles?.[0] : (row as { profiles?: { full_name?: string } }).profiles) : null;
    return profile?.full_name ?? 'your coach';
  };

  return (data ?? []).map((row) => ({
    shadowCoachId: row.shadow_coach_id as string,
    startsOn: row.starts_on as string,
    endsOn: row.ends_on as string,
    primaryCoachName: pickName((row as Record<string, unknown>).primary_coach),
  }));
}

/** §14.10 `findShadowCoverage` verbatim: a booking's coach + IST calendar date must match one
 * active assignment's shadow coach and date range for the badge to apply. */
export function findShadowCoverageForBooking(coachId: string | null | undefined, sessionDateIst: string, assignments: ShadowAssignmentLite[]): ShadowAssignmentLite | null {
  if (!coachId) return null;
  return assignments.find((a) => a.shadowCoachId === coachId && sessionDateIst >= a.startsOn && sessionDateIst <= a.endsOn) ?? null;
}
