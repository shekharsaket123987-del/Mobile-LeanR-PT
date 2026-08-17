/**
 * Subscription read — LEANR_PT_MOBILE_PRD.md §5 "Subscription & Payments".
 * Confirmed against the real schema: `subscriptions` has no
 * `sessions_used` column — "used" is derived by counting this
 * subscription's completed bookings.
 */
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

export async function getSessionsUsedCount(subscriptionId: string): Promise<number> {
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('subscription_id', subscriptionId)
    .eq('status', 'completed');
  if (error) throw error;
  return count ?? 0;
}
