/**
 * Admin Coach Change Requests — New PRD.md §4.C "Screen: Coach Change
 * Requests". Reject is immediate; Approve is a two-step choice
 * (optionally pick a new coach directly — repoints the existing pattern
 * immediately, mirroring the same recurring_slots-repoint +
 * conversation-close/open logic already proven in
 * `supabase/functions/coach-change-actions/index.ts` — or leave blank
 * for client self-serve). Admin RLS grants full write on
 * `coach_change_requests`/`recurring_slots`/`bookings`/`conversations`
 * (confirmed `*_admin_all` policies), so this repoint is a direct client
 * call, unlike the client-facing edge function which needed service role
 * only because a plain client has no such RLS.
 *
 * Notifications (Gap Verification Report Area 6): reject/approve-blank
 * notify the client only (`coach_change_request_rejected_client`/
 * `_approved_client`); approve-with-coach notifies the client
 * (`coach_changed_client`), the outgoing coach (`client_transferred`), and
 * the new coach (`new_client_assigned`) — matching web's `resolveCoachChangeRequest`.
 */
import { supabase } from '@/lib/supabase/client';
import { notifyProfile, resolveProfileIdForClient, resolveProfileIdForCoach } from './notify';

export type AdminCoachChangeRequest = {
  id: string;
  clientId: string;
  clientName: string;
  clientPhotoUrl: string | null;
  currentCoachId: string | null;
  currentCoachName: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

function pickName(rel: unknown): string | null {
  const row = Array.isArray(rel) ? rel[0] : rel;
  if (!row) return null;
  const profile = Array.isArray((row as { profiles?: unknown }).profiles)
    ? ((row as { profiles?: unknown[] }).profiles as { full_name?: string }[])[0]
    : ((row as { profiles?: { full_name?: string } }).profiles ?? null);
  return profile?.full_name ?? null;
}

function pickPhoto(rel: unknown): string | null {
  const row = Array.isArray(rel) ? rel[0] : rel;
  if (!row) return null;
  const profile = Array.isArray((row as { profiles?: unknown }).profiles)
    ? ((row as { profiles?: unknown[] }).profiles as { photo_url?: string }[])[0]
    : ((row as { profiles?: { photo_url?: string } }).profiles ?? null);
  return profile?.photo_url ?? null;
}

export async function listCoachChangeRequests(status: 'pending' | 'resolved'): Promise<AdminCoachChangeRequest[]> {
  let query = supabase
    .from('coach_change_requests')
    .select(
      'id, client_id, current_coach_id, reason, status, created_at, client_profiles(profiles(full_name, photo_url)), coach_profiles!coach_change_requests_current_coach_id_fkey(profiles(full_name))'
    )
    .order('created_at', { ascending: false });
  query = status === 'pending' ? query.eq('status', 'pending') : query.neq('status', 'pending');

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    clientId: row.client_id,
    clientName: pickName(row.client_profiles) ?? 'Client',
    clientPhotoUrl: pickPhoto(row.client_profiles),
    currentCoachId: row.current_coach_id,
    currentCoachName: pickName((row as unknown as Record<string, unknown>).coach_profiles),
    reason: row.reason,
    status: row.status,
    created_at: row.created_at,
  }));
}

export async function rejectCoachChangeRequest(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: row, error: fetchError } = await supabase.from('coach_change_requests').select('client_id').eq('id', id).single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('coach_change_requests').update({ status: 'rejected', resolved_by: user?.id, resolved_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;

  const clientProfileId = await resolveProfileIdForClient(row.client_id);
  await notifyProfile(clientProfileId, 'booking', 'Coach change request declined', 'Your coach change request was not approved.', 'coach_change_request_rejected_client');
}

/** Approve with no coach picked — client self-serves the schedule search afterward (New PRD.md §4.C). */
export async function approveCoachChangeRequestBlank(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: row, error: fetchError } = await supabase.from('coach_change_requests').select('client_id').eq('id', id).single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('coach_change_requests').update({ status: 'approved', resolved_by: user?.id, resolved_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;

  const clientProfileId = await resolveProfileIdForClient(row.client_id);
  await notifyProfile(
    clientProfileId,
    'booking',
    'Coach change approved',
    'Your coach change request was approved — choose your new coach to continue.',
    'coach_change_request_approved_client'
  );
}

/**
 * Approve + pick the new coach directly — REPOINTS the client's existing
 * recurring pattern and upcoming bookings onto the new coach, same day/time.
 *
 * Web ground truth (`coachChange.service.ts` `resolveCoachChangeRequest` ->
 * `clients.service.ts` `reassignClientCoach`): this fast path never cancels
 * or recreates anything — it keeps the SAME `recurring_slots`/`bookings`
 * rows and just updates `coach_id`, scoped to the OLD coach
 * (`current_coach_id`) so it can't touch slots/bookings belonging to some
 * other coach. It also blocks if the new coach has no availability on a
 * day the client is already booked — web has no "force" override on this
 * screen, so this mirrors that: the guard always applies, matching
 * `transferClientCoach` in `admin-clients.ts` (the other place this exact
 * repoint pattern already exists correctly, for the manual "Transfer Coach"
 * action — not reused directly here to avoid a cross-file dependency,
 * logic intentionally kept in lockstep with it).
 *
 * Previously (until this fix) this function instead cancelled ALL of the
 * client's active recurring_slots and upcoming bookings outright (not
 * scoped to the old coach) and recreated only 4 new bookings per slot —
 * wrong shape (web repoints, doesn't cancel+recreate, for this specific
 * "admin picks the coach directly, same schedule" path) and unsafe (could
 * cancel bookings with an unrelated coach, e.g. a demo/assessment booking).
 */
export async function approveCoachChangeRequestWithCoach(id: string, clientId: string, newCoachId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: requestRow, error: requestError } = await supabase
    .from('coach_change_requests')
    .select('current_coach_id, client_profiles(profiles(full_name))')
    .eq('id', id)
    .single();
  if (requestError) throw requestError;
  const oldCoachId = requestRow.current_coach_id as string | null;

  if (oldCoachId) {
    const { data: activeSlots, error: slotsError } = await supabase
      .from('recurring_slots')
      .select('day_of_week')
      .eq('client_id', clientId)
      .eq('coach_id', oldCoachId)
      .eq('status', 'active');
    if (slotsError) throw slotsError;

    const { data: availability, error: availabilityError } = await supabase
      .from('coach_availability')
      .select('day_of_week')
      .eq('coach_id', newCoachId)
      .eq('is_active', true);
    if (availabilityError) throw availabilityError;
    const availableDays = new Set((availability ?? []).map((a) => a.day_of_week));
    const uncovered = (activeSlots ?? []).some((s) => !availableDays.has(s.day_of_week));
    if (uncovered) {
      throw new Error('This coach has not set availability for one or more of the client’s scheduled days.');
    }

    const { error: slotUpdateError } = await supabase
      .from('recurring_slots')
      .update({ coach_id: newCoachId })
      .eq('client_id', clientId)
      .eq('coach_id', oldCoachId)
      .eq('status', 'active');
    if (slotUpdateError) throw slotUpdateError;
  }

  if (oldCoachId) {
    const { error: bookingUpdateError } = await supabase
      .from('bookings')
      .update({ coach_id: newCoachId })
      .eq('client_id', clientId)
      .eq('coach_id', oldCoachId)
      .eq('status', 'upcoming');
    if (bookingUpdateError) throw bookingUpdateError;
  }

  await supabase.from('conversations').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('client_id', clientId).eq('status', 'active');
  await supabase.from('conversations').insert({ client_id: clientId, coach_id: newCoachId, status: 'active', opened_at: new Date().toISOString() });

  const { error: updateError } = await supabase
    .from('coach_change_requests')
    .update({ status: 'approved', new_coach_id: newCoachId, resolved_by: user?.id, resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (updateError) throw updateError;

  const clientProfile = Array.isArray(requestRow.client_profiles) ? requestRow.client_profiles[0] : requestRow.client_profiles;
  const clientProfileRow = clientProfile ? (Array.isArray(clientProfile.profiles) ? clientProfile.profiles[0] : clientProfile.profiles) : null;
  const clientName = clientProfileRow?.full_name ?? 'Client';

  const { data: newCoachRow, error: newCoachError } = await supabase.from('coach_profiles').select('profile_id, profiles(full_name)').eq('id', newCoachId).maybeSingle();
  if (newCoachError) throw newCoachError;
  const newCoachProfile = newCoachRow ? (Array.isArray(newCoachRow.profiles) ? newCoachRow.profiles[0] : newCoachRow.profiles) : null;
  const newCoachName = newCoachProfile?.full_name ?? 'your new coach';

  const clientProfileId = await resolveProfileIdForClient(clientId);
  await notifyProfile(clientProfileId, 'booking', 'Coach changed', `You've been moved to ${newCoachName}.`, 'coach_changed_client');

  if (requestRow.current_coach_id) {
    const oldCoachProfileId = await resolveProfileIdForCoach(requestRow.current_coach_id);
    await notifyProfile(oldCoachProfileId, 'booking', 'Client transferred', `${clientName} has been transferred to another coach.`, 'client_transferred');
  }

  await notifyProfile(newCoachRow?.profile_id ?? null, 'booking', 'New client assigned', `${clientName} has been assigned to you.`, 'new_client_assigned');
}
