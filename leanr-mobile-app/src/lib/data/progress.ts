/**
 * Progress logs — LEANR_PT_MOBILE_PRD.md §5 "Progress" (weekly
 * measurement log). Confirmed against the real schema: columns are
 * `weight`/`notes` (not `weight_kg`/`note`), and `client_id` references
 * `client_profiles.id`, not the raw auth uid.
 */
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';
import type { ProgressLog } from './types';

export async function getProgressLogs(limit = 12) {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('progress_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('logged_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProgressLog[];
}

export async function logProgress(entry: { weight?: number; notes?: string }) {
  const clientId = await getMyClientProfileId();
  if (!clientId) throw new Error('Not signed in as a client');

  const { error } = await supabase.from('progress_logs').insert({
    client_id: clientId,
    weight: entry.weight,
    notes: entry.notes,
    logged_at: new Date().toISOString(),
  });
  if (error) throw error;
}
