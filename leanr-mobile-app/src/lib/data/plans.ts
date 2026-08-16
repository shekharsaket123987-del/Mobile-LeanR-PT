/**
 * Marketing plans read — LEANR_PT_MOBILE_PRD.md §5 "Choose Your Plan"
 * (`listMarketingPlansAction`). Table name (`packages`, inferred from
 * admin's `createPackageAction`/`updatePackageAction`/`deletePackageAction`
 * naming in §5 admin settings) and its columns are all VERIFY — this is
 * a read only, so a wrong guess surfaces as an empty/error screen, not a
 * bad write.
 */
import { supabase } from '@/lib/supabase/client';
import type { Plan } from './types';

export async function getMarketingPlans() {
  const { data, error } = await supabase.from('packages').select('*').order('price_paise', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Plan[];
}
