/**
 * Subscription read — LEANR_PT_MOBILE_PRD.md §5 "Subscription & Payments".
 * `subscriptions.status` values (active|inactive|paused|awaiting_activation)
 * are documented exactly (§7j); the session-count columns are not, so
 * they're VERIFY.
 */
import { supabase } from '@/lib/supabase/client';
import type { Subscription } from './types';

export async function getMySubscription(): Promise<Subscription | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('client_id', userId) // VERIFY: FK column name on subscriptions
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data as Subscription | null;
}
