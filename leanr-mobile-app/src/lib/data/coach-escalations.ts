/**
 * Coach Escalations (read-only) — LEANR_PT_MOBILE_PRD.md §5
 * "Escalations (read-only)", §3 "read-only escalations for own clients
 * (cannot resolve — admin-only)". Confirmed against the real schema/RLS
 * on 2026-08-19: `escalations_select_by_coach` (`coach_client_linked(my_coach_id(),
 * client_id)`) auto-scopes the plain SELECT below to the coach's own
 * linked clients — no explicit `.eq('coach_id', ...)` needed or even
 * correct, since escalations aren't necessarily filed with `coach_id`
 * set to the *current* coach if a coach change happened since.
 *
 * `escalation_notes` (the client-visible admin notes) has NO coach SELECT
 * policy at all (only admin + the escalation's own client) — confirmed
 * live, not assumed. So unlike the client's My Concerns screen, this
 * view has no notes/resolution detail beyond the escalation row itself.
 */
import { supabase } from '@/lib/supabase/client';

export type CoachEscalation = {
  id: string;
  reason: string;
  description: string | null;
  category: string | null;
  status: 'open' | 'in_progress' | 'resolved';
  created_at: string;
  client_name: string | null;
};

export async function getLinkedEscalations(): Promise<CoachEscalation[]> {
  const { data, error } = await supabase
    .from('escalations')
    .select('id, reason, description, category, status, created_at, client_profiles(profiles(full_name))')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const clientProfile = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
    const profile = clientProfile ? (Array.isArray(clientProfile.profiles) ? clientProfile.profiles[0] : clientProfile.profiles) : null;
    return {
      id: row.id,
      reason: row.reason,
      description: row.description,
      category: row.category,
      status: row.status,
      created_at: row.created_at,
      client_name: profile?.full_name ?? null,
    };
  });
}
