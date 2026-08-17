/**
 * Identity resolution — CONFIRMED against the real database schema
 * (not guessed): `auth.uid()` = `profiles.id`, but every business table
 * (bookings, subscriptions, recurring_slots, progress_logs, workout_notes,
 * conversations) references `client_profiles.id` / `coach_profiles.id`,
 * which are their OWN primary keys, linked back to `profiles` via a
 * separate `profile_id` foreign key — not the same value as the auth uid.
 *
 * Every earlier phase of this app queried business tables using the raw
 * auth uid directly (e.g. `bookings.eq('client_id', authUid)`), which
 * would have silently returned zero rows against the real schema. This
 * file is the fix: resolve the caller's actual client_profiles.id /
 * coach_profiles.id once, then use THAT everywhere.
 *
 * Confirmed via direct schema introspection (information_schema +
 * pg_constraint) against the real "LeanR PT" Supabase project on
 * 2026-08-17 — see git history for the session this was fixed in.
 */
import { supabase } from '@/lib/supabase/client';

export async function getMyClientProfileId(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('client_profiles')
    .select('id')
    .eq('profile_id', userData.user.id)
    .single();
  if (error || !data) return null;
  return data.id as string;
}

export async function getMyCoachProfileId(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('coach_profiles')
    .select('id')
    .eq('profile_id', userData.user.id)
    .single();
  if (error || !data) return null;
  return data.id as string;
}
