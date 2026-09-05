/**
 * Marketing plans read — LEANR_PT_MOBILE_PRD.md §5 "Choose Your Plan".
 * Confirmed against the real schema: the table is `package_tiers`, not
 * `packages`, and price is a plain numeric amount, not integer paise.
 */
import { supabase } from '@/lib/supabase/client';
import type { Plan } from './types';

export async function getMarketingPlans() {
  const { data, error } = await supabase
    .from('package_tiers')
    .select('id, name, sessions_count, price, is_active')
    .eq('is_active', true)
    .order('price', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Plan[];
}

/** Not filtered to `is_active` — a subscription can reference a since-retired package (soft-deleted, never hard-deleted). */
export async function getPackageById(packageId: string): Promise<Plan | null> {
  const { data, error } = await supabase
    .from('package_tiers')
    .select('id, name, sessions_count, price, is_active')
    .eq('id', packageId)
    .maybeSingle();
  if (error) throw error;
  return data as Plan | null;
}
