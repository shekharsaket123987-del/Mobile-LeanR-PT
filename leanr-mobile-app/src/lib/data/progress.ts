/**
 * Progress logs — LEANR_PT_MOBILE_PRD.md §5 "Progress" (weekly
 * measurement log). Table name (`progress_logs`) is documented; the
 * measurement column names are not, so `logProgress`'s payload shape is
 * VERIFY — confirm against the real schema before shipping the write.
 */
import { supabase } from '@/lib/supabase/client';
import type { ProgressLog } from './types';

export async function getProgressLogs(limit = 12) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('progress_logs')
    .select('*')
    .eq('client_id', userId) // VERIFY: FK column name on progress_logs
    .order('logged_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProgressLog[];
}

export async function logProgress(entry: { weightKg?: number; note?: string }) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');

  const { error } = await supabase.from('progress_logs').insert({
    client_id: userId, // VERIFY
    weight_kg: entry.weightKg, // VERIFY
    note: entry.note, // VERIFY
    logged_at: new Date().toISOString(), // VERIFY
  });
  if (error) throw error;
}
