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
 */
import { supabase } from '@/lib/supabase/client';

export type AdminCoachChangeRequest = {
  id: string;
  clientId: string;
  clientName: string;
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

export async function listCoachChangeRequests(status: 'pending' | 'resolved'): Promise<AdminCoachChangeRequest[]> {
  let query = supabase
    .from('coach_change_requests')
    .select('id, client_id, current_coach_id, reason, status, created_at, client_profiles(profiles(full_name)), coach_profiles!coach_change_requests_current_coach_id_fkey(profiles(full_name))')
    .order('created_at', { ascending: false });
  query = status === 'pending' ? query.eq('status', 'pending') : query.neq('status', 'pending');

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    clientId: row.client_id,
    clientName: pickName(row.client_profiles) ?? 'Client',
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
  const { error } = await supabase.from('coach_change_requests').update({ status: 'rejected', resolved_by: user?.id, resolved_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/** Approve with no coach picked — client self-serves the schedule search afterward (New PRD.md §4.C). */
export async function approveCoachChangeRequestBlank(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('coach_change_requests').update({ status: 'approved', resolved_by: user?.id, resolved_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/** Approve + pick the new coach directly — repoints the client's existing recurring pattern immediately. */
export async function approveCoachChangeRequestWithCoach(id: string, clientId: string, newCoachId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: activeSlots, error: slotsError } = await supabase
    .from('recurring_slots')
    .select('day_of_week, start_time, duration_minutes, subscription_id')
    .eq('client_id', clientId)
    .eq('status', 'active');
  if (slotsError) throw slotsError;

  const { error: cancelError } = await supabase.from('recurring_slots').update({ status: 'cancelled' }).eq('client_id', clientId).eq('status', 'active');
  if (cancelError) throw cancelError;

  for (const slot of activeSlots ?? []) {
    const { data: newSlot, error: insertError } = await supabase
      .from('recurring_slots')
      .insert({
        client_id: clientId,
        coach_id: newCoachId,
        subscription_id: slot.subscription_id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        duration_minutes: slot.duration_minutes,
        status: 'active',
      })
      .select('id')
      .single();
    if (insertError) throw insertError;
    await supabase.rpc('generate_bookings_from_recurring_slot', { p_recurring_slot_id: newSlot.id, p_count: 4 });
  }

  await supabase.from('conversations').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('client_id', clientId).eq('status', 'active');
  await supabase.from('conversations').insert({ client_id: clientId, coach_id: newCoachId, status: 'active', opened_at: new Date().toISOString() });

  const { error: updateError } = await supabase
    .from('coach_change_requests')
    .update({ status: 'approved', new_coach_id: newCoachId, resolved_by: user?.id, resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (updateError) throw updateError;
}
