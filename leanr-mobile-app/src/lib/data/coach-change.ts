/**
 * Coach change requests — New PRD.md §3.5, §4.A "My Coach". Confirmed
 * against the real schema/RLS: `coach_change_requests` has no client
 * UPDATE policy (only `coach_change_admin_all`), and neither does
 * `conversations` — so stage 2 ("pick your new schedule" -> Find
 * Available Coach -> Confirm, once an admin approves a request without
 * picking a coach) can't be a plain client write, same class of problem
 * as Razorpay payments/subscription activation. `completeCoachChange`
 * below calls the `coach-change-actions` edge function (service-role),
 * which does the whole privileged sequence: retire the old recurring
 * pattern, create the new one, close the old chat thread and open a new
 * one with the new coach, and set `new_coach_id` on the request.
 */
import { extractFunctionErrorMessage } from '@/lib/data/edge-functions';
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
  /** Null on an approved-without-a-coach-picked request — the trigger for the client's own "pick your new schedule" completion card. */
  new_coach_id: string | null;
};

export async function getMyCoachChangeRequests(): Promise<CoachChangeRequest[]> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('coach_change_requests')
    .select('id, reason, status, created_at, overall_experience, coach_rating, new_coach_id')
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

export async function completeCoachChange(input: {
  requestId: string;
  newCoachId: string;
  days: number[];
  hour: number;
  durationMinutes: number;
}): Promise<void> {
  const { error } = await supabase.functions.invoke('coach-change-actions', {
    body: { action: 'complete', ...input },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Could not complete the coach change.'));
}
