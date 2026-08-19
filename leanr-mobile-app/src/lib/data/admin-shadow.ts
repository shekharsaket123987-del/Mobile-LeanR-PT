/**
 * Admin Shadow Coverage — LEANR_PT_MOBILE_PRD.md §10 "Screen: Client
 * Detail (admin)" Assign Shadow Coach flow, §9 Feature Dependency Map
 * ("Coach Leave → Admin Approval → Shadow Coach Assignment"). Confirmed
 * against the real schema/RLS on 2026-08-19: `assign_shadow_coach(p_client_id,
 * p_primary_coach_id, p_shadow_coach_id, p_starts_on, p_ends_on, p_reason)`
 * is a single RPC that both records the assignment (`shadow_coach_assignments`,
 * status='active') AND reassigns the client's affected `upcoming` bookings'
 * `coach_id` to the shadow coach for that date range — confirmed by
 * reading the function body directly, not assumed from the PRD prose.
 *
 * "Uncovered leave-affected sessions" (the web app's
 * `listShadowCoverageGapsAction`) is reproduced here as a simplified,
 * direct computation rather than a port of that service: for every
 * `approved` leave whose window hasn't fully passed, find the leave-
 * taking coach's `upcoming` bookings that fall inside the leave window
 * and are STILL pointed at that coach (i.e. `assign_shadow_coach` was
 * never called for them) — grouped per client, since the RPC assigns
 * coverage one client at a time.
 */
import { supabase } from '@/lib/supabase/client';

export type ShadowGap = {
  leaveId: string;
  clientId: string;
  clientName: string;
  primaryCoachId: string;
  primaryCoachName: string;
  startsOn: string;
  endsOn: string;
  affectedSessions: number;
};

/** Exclusive end bound for a date-only range filter — plain UTC date arithmetic, no timezone ambiguity. */
function dayAfter(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function getShadowCoverageGaps(): Promise<ShadowGap[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: leaves, error } = await supabase
    .from('coach_leave')
    .select('id, coach_id, starts_on, ends_on, coach_profiles(profiles(full_name))')
    .eq('status', 'approved')
    .eq('leave_type', 'full_day')
    .gte('ends_on', today);
  if (error) throw error;
  if (!leaves || leaves.length === 0) return [];

  const gaps: ShadowGap[] = [];

  for (const leave of leaves) {
    const coachProfile = Array.isArray(leave.coach_profiles) ? leave.coach_profiles[0] : leave.coach_profiles;
    const profile = coachProfile ? (Array.isArray(coachProfile.profiles) ? coachProfile.profiles[0] : coachProfile.profiles) : null;
    const primaryCoachName = profile?.full_name ?? 'Coach';

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('client_id, client_profiles(profiles(full_name))')
      .eq('coach_id', leave.coach_id)
      .eq('status', 'upcoming')
      .gte('scheduled_start', `${leave.starts_on}T00:00:00+05:30`)
      .lt('scheduled_start', `${dayAfter(leave.ends_on)}T00:00:00+05:30`);
    if (bookingsError) throw bookingsError;
    if (!bookings || bookings.length === 0) continue;

    const byClient = new Map<string, { name: string; count: number }>();
    for (const b of bookings) {
      const clientProfile = Array.isArray(b.client_profiles) ? b.client_profiles[0] : b.client_profiles;
      const clientProfileRow = clientProfile
        ? Array.isArray(clientProfile.profiles)
          ? clientProfile.profiles[0]
          : clientProfile.profiles
        : null;
      const existing = byClient.get(b.client_id);
      if (existing) {
        existing.count += 1;
      } else {
        byClient.set(b.client_id, { name: clientProfileRow?.full_name ?? 'Client', count: 1 });
      }
    }

    for (const [clientId, info] of byClient) {
      gaps.push({
        leaveId: leave.id,
        clientId,
        clientName: info.name,
        primaryCoachId: leave.coach_id,
        primaryCoachName,
        startsOn: leave.starts_on,
        endsOn: leave.ends_on,
        affectedSessions: info.count,
      });
    }
  }

  return gaps;
}

export type ActiveCoachOption = { id: string; full_name: string };

export async function getActiveCoachOptions(): Promise<ActiveCoachOption[]> {
  const { data, error } = await supabase.from('coach_profiles').select('id, status, profiles(full_name)').eq('status', 'active');
  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { id: row.id as string, full_name: profile?.full_name ?? 'Coach' };
  });
}

export async function assignShadowCoach(input: {
  clientId: string;
  primaryCoachId: string;
  shadowCoachId: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('assign_shadow_coach', {
    p_client_id: input.clientId,
    p_primary_coach_id: input.primaryCoachId,
    p_shadow_coach_id: input.shadowCoachId,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_reason: input.reason,
  });
  if (error) throw error;
}
