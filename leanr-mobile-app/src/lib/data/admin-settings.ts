/**
 * Admin Settings — New PRD.md §4.C "Screen: Settings" — Package Types
 * card (create/edit/soft-delete) + Session Rules card (4 sliders, only
 * 2 of which are genuinely live server-side per §27 — reproduced as-is,
 * not silently "fixed"). Confirmed live columns: `package_tiers.name,
 * category(advance|addon), sessions_count, price, original_price,
 * features[], highlighted, is_active, default_pause_days`.
 */
import { supabase } from '@/lib/supabase/client';

export type PackageTier = {
  id: string;
  name: string;
  category: 'advance' | 'addon';
  sessions_count: number;
  price: number;
  original_price: number | null;
  features: string[];
  highlighted: boolean;
  is_active: boolean;
  default_pause_days: number | null;
};

export async function listAllPackages(): Promise<PackageTier[]> {
  const { data, error } = await supabase.from('package_tiers').select('*').order('price', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PackageTier[];
}

export type PackageInput = {
  name: string;
  category: 'advance' | 'addon';
  sessions_count: number;
  price: number;
  original_price: number | null;
  features: string[];
  highlighted: boolean;
  default_pause_days: number;
};

export async function createPackage(input: PackageInput): Promise<void> {
  const { error } = await supabase.from('package_tiers').insert({ ...input, is_active: true });
  if (error) throw error;
}

export async function updatePackage(id: string, input: PackageInput): Promise<void> {
  const { error } = await supabase.from('package_tiers').update(input).eq('id', id);
  if (error) throw error;
}

/** Always a soft delete — no hard-delete action exists for any entity (New PRD.md §4.C). */
export async function deletePackage(id: string): Promise<void> {
  const { error } = await supabase.from('package_tiers').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

const SESSION_RULE_KEYS = ['default_session_duration_minutes', 'cancellation_cutoff_hours', 'reschedule_cutoff_hours', 'inactivity_threshold_days'] as const;
export type SessionRuleKey = (typeof SESSION_RULE_KEYS)[number];

export async function getSessionRules(): Promise<Record<SessionRuleKey, number>> {
  const { data, error } = await supabase.from('system_settings').select('key, value').in('key', SESSION_RULE_KEYS as unknown as string[]);
  if (error) throw error;
  const byKey = new Map((data ?? []).map((r) => [r.key, Number(r.value)]));
  return {
    default_session_duration_minutes: byKey.get('default_session_duration_minutes') ?? 45,
    cancellation_cutoff_hours: byKey.get('cancellation_cutoff_hours') ?? 12,
    reschedule_cutoff_hours: byKey.get('reschedule_cutoff_hours') ?? 1,
    inactivity_threshold_days: byKey.get('inactivity_threshold_days') ?? 30,
  };
}

export async function saveSessionRules(values: Record<SessionRuleKey, number>): Promise<void> {
  await Promise.all(
    SESSION_RULE_KEYS.map(async (key) => {
      const { error } = await supabase.from('system_settings').update({ value: values[key], updated_at: new Date().toISOString() }).eq('key', key);
      if (error) throw error;
    })
  );
}
