/**
 * Coach's own shadow-coverage list — web spec §10 (Shadow coach): "Own list of all their
 * shadow assignments (past + active), scoped to themselves only." Distinct from the admin's
 * platform-wide list (admin-scheduling.ts) and from the affected sessions themselves, which
 * already appear in the coach's normal upcoming list via `bookings.coach_id` (no separate
 * inbox/accept-decline step — explicitly out of scope, §10).
 */
import { getMyCoachProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';

export type MyShadowAssignment = {
  id: string;
  clientName: string;
  primaryCoachName: string;
  startsOn: string;
  endsOn: string;
  status: 'active' | 'cancelled';
  createdAt: string;
};

export async function listMyShadowAssignments(): Promise<MyShadowAssignment[]> {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  const { data, error } = await supabase
    .from('shadow_coach_assignments')
    .select(
      'id, starts_on, ends_on, status, created_at, client:client_profiles(profiles(full_name)), primary_coach:coach_profiles!shadow_coach_assignments_primary_coach_id_fkey(profiles(full_name))'
    )
    .eq('shadow_coach_id', coachId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const pickName = (rel: unknown): string => {
    const row = Array.isArray(rel) ? rel[0] : rel;
    const profile = row
      ? Array.isArray((row as { profiles?: unknown }).profiles)
        ? (row as { profiles?: { full_name?: string }[] }).profiles?.[0]
        : (row as { profiles?: { full_name?: string } }).profiles
      : null;
    return profile?.full_name ?? 'Client';
  };

  return (data ?? []).map((row) => ({
    id: row.id as string,
    clientName: pickName((row as Record<string, unknown>).client),
    primaryCoachName: pickName((row as Record<string, unknown>).primary_coach),
    startsOn: row.starts_on as string,
    endsOn: row.ends_on as string,
    status: row.status as 'active' | 'cancelled',
    createdAt: row.created_at as string,
  }));
}
