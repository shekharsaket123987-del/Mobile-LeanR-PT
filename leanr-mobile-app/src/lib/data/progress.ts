/**
 * Progress logs — New PRD.md §4.A "Progress" (weekly measurement log, 8
 * numeric fields: weight/body_fat_pct/muscle_pct/waist/chest/hip/arms/
 * thigh — all confirmed real columns, same set `onboarding.ts` seeds as
 * the Day-1 baseline). `client_id` references `client_profiles.id`, not
 * the raw auth uid.
 */
import { getMyCoach } from '@/lib/data/coach';
import { getMyClientProfileId } from '@/lib/data/identity';
import { notifyProfile, resolveProfileIdForCoach } from '@/lib/data/notify';
import { logTimelineEvent } from '@/lib/data/timeline';
import { supabase } from '@/lib/supabase/client';
import type { ProgressLog } from './types';

const WEEKLY_CAP_MS = 7 * 24 * 60 * 60 * 1000;

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

export type LogProgressInput = {
  weight?: number;
  notes?: string;
  bodyFatPct?: number;
  musclePct?: number;
  waist?: number;
  chest?: number;
  hip?: number;
  arms?: number;
  thigh?: number;
};

/**
 * New PRD.md §6: "rated any booking within the last 7 days" is the
 * ratings rule's twin — this is the progress-log version: one update per
 * 7 days. `skipWeeklyLimit` is the Renewal Check-in escape hatch (§4.A
 * "bypasses the normal weekly cap") — not used by the plain Progress
 * screen.
 */
export async function logProgress(entry: LogProgressInput, options?: { skipWeeklyLimit?: boolean }) {
  const clientId = await getMyClientProfileId();
  if (!clientId) throw new Error('Not signed in as a client');

  if (!options?.skipWeeklyLimit) {
    const { data: latest, error: latestError } = await supabase
      .from('progress_logs')
      .select('logged_at')
      .eq('client_id', clientId)
      .order('logged_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    if (latest && Date.now() - new Date(latest.logged_at).getTime() < WEEKLY_CAP_MS) {
      throw new Error("You've already submitted a measurement update this week — next update available in a few days.");
    }
  }

  const { error } = await supabase.from('progress_logs').insert({
    client_id: clientId,
    weight: entry.weight ?? null,
    notes: entry.notes ?? null,
    body_fat_pct: entry.bodyFatPct ?? null,
    muscle_pct: entry.musclePct ?? null,
    waist: entry.waist ?? null,
    chest: entry.chest ?? null,
    hip: entry.hip ?? null,
    arms: entry.arms ?? null,
    thigh: entry.thigh ?? null,
    logged_at: new Date().toISOString(),
  });
  if (error) throw error;

  await logTimelineEvent(clientId, 'weekly_measurements_updated', 'Weekly measurements updated');

  // ClientPortal.md §15: "Progress/measurement updated" notifies the client's current coach,
  // in-app only. Best-effort — a notification failure must never surface as a save error.
  try {
    const coach = await getMyCoach();
    if (coach) {
      const coachProfileId = await resolveProfileIdForCoach(coach.id);
      await notifyProfile(coachProfileId, 'system', 'Measurement update', 'Your client logged a new measurement update.', 'progress_updated_coach');
    }
  } catch {
    // swallow — see the file-level note on save-vs-notify separation above.
  }
}
