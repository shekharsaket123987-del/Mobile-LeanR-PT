/**
 * Subscription read — LEANR_PT_MOBILE_PRD.md §5 "Subscription & Payments".
 * Confirmed against the real schema: `subscriptions` has no
 * `sessions_used` column — "used" is derived by counting this
 * subscription's completed bookings.
 */
import { extractFunctionErrorMessage } from '@/lib/data/edge-functions';
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';
import type { Subscription } from './types';

export async function getMySubscription(): Promise<Subscription | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data as Subscription | null;
}

/** A subscription awaiting the client's one-time "pick a start date" step. */
export async function getPendingActivationSubscription(): Promise<Subscription | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'awaiting_activation')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Subscription | null;
}

/** Most recent subscription regardless of status — used for journey gating and the Subscription screen, where a paused/awaiting row still matters. */
export async function getLatestSubscription(): Promise<Subscription | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Subscription | null;
}

export async function getSessionsUsedCount(subscriptionId: string): Promise<number> {
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('subscription_id', subscriptionId)
    .eq('status', 'completed');
  if (error) throw error;
  return count ?? 0;
}

/** `subscriptions` has no client write RLS policy — these three go through the `subscription-lifecycle` edge function, which uses the service-role key after verifying ownership (see that function's source). */
async function invokeLifecycle(action: 'activate' | 'pause' | 'resume', body: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke('subscription-lifecycle', { body: { action, ...body } });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Could not update your subscription.'));
}

/** `startDateIso` should be an IST calendar date (>= tomorrow) — enforced server-side regardless of client input. */
export async function activateSubscription(subscriptionId: string, startDateIso: string): Promise<void> {
  await invokeLifecycle('activate', { subscriptionId, startDate: startDateIso });
}

export async function pauseSubscription(subscriptionId: string): Promise<void> {
  await invokeLifecycle('pause', { subscriptionId });
}

export async function resumeSubscription(subscriptionId: string): Promise<void> {
  await invokeLifecycle('resume', { subscriptionId });
}
