/**
 * Coach change requests — LEANR_PT_MOBILE_PRD.md §7e, §10 "My Coach"
 * row. Confirmed against the real schema/RLS on 2026-08-18, and this is
 * the one place this pass found a genuine structural boundary rather
 * than "just build the UI":
 *
 * §7e's client-side flow is actually TWO stages — (1) submit a reason,
 * status='pending', [admin reviews]; only once approved does (2) "pick
 * your new schedule" -> Find Available Coach -> Confirm unlock. Stage 2
 * (`completeCoachChangeAction` in the web app) is NOT reproducible from
 * this mobile-only repo: `coach_change_requests` has no client UPDATE
 * policy at all (only `coach_change_admin_all`), and closing/reopening
 * the client's `conversations` row — which §20 says a completed coach
 * change must do — is admin-only too (no client/coach write policy on
 * `conversations`, confirmed in chat.ts). Both are the same class of
 * problem as Razorpay payments (§8g, see plans.tsx): a privileged,
 * multi-table server-side operation this app has no elevated context to
 * perform, not a missing RPC to look harder for.
 *
 * So this file only builds what the RLS actually allows a client to do:
 * submit a request (stage 1) and see its own request history/status.
 */
import { getMyCoach } from '@/lib/data/coach';
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';

export type CoachChangeStatus = 'pending' | 'approved' | 'rejected';

export type CoachChangeRequest = {
  id: string;
  reason: string | null;
  status: CoachChangeStatus;
  created_at: string;
  overall_experience: number | null;
  coach_rating: number | null;
};

export async function getMyCoachChangeRequests(): Promise<CoachChangeRequest[]> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('coach_change_requests')
    .select('id, reason, status, created_at, overall_experience, coach_rating')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CoachChangeRequest[];
}

export async function requestCoachChange(input: {
  reason: string;
  overallExperience: number | null;
  coachRating: number | null;
  additionalComments: string | null;
}): Promise<void> {
  const clientId = await getMyClientProfileId();
  if (!clientId) throw new Error('Could not resolve your client profile.');
  const coach = await getMyCoach();
  if (!coach) throw new Error('No current coach to request a change from.');

  const { error } = await supabase.from('coach_change_requests').insert({
    client_id: clientId,
    current_coach_id: coach.id,
    reason: input.reason,
    overall_experience: input.overallExperience,
    coach_rating: input.coachRating,
    additional_comments: input.additionalComments,
  });
  if (error) throw error;
}
