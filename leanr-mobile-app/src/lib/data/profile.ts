/**
 * Profile edit + password change — LEANR_PT_MOBILE_PRD.md §5 "Coach
 * Profile (self-service subset)/Password Change", client "Profile".
 * Confirmed against the real schema/RLS on 2026-08-19: `profiles`,
 * `client_profiles`, and `coach_profiles` all have an `_update_own`
 * policy keyed off `profile_id = auth.uid()` (or `id = auth.uid()` on
 * `profiles` itself) — real, direct write access, not a boundary like
 * coach-change stage 2 or payments.
 *
 * Deliberately scoped to the common `profiles` fields (name/phone/
 * emergency contact) plus a small role-specific subset — client
 * goals/equipment, coach bio/specialization — rather than every column
 * on `client_profiles`/`coach_profiles` (e.g. `medical_notes`,
 * `certifications`, `languages`, `skills`). Those are real, writable,
 * and not built here — a reasonable first-pass cut, not a schema gap.
 * Photo upload isn't wired either (same class of work as the chat image
 * picker, not repeated here for a single avatar field).
 */
import { supabase } from '@/lib/supabase/client';

export type MyProfile = {
  full_name: string;
  phone: string | null;
  photo_url: string | null;
  emergency_contact: string | null;
};

export async function getMyProfile(): Promise<MyProfile | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, phone, photo_url, emergency_contact')
    .eq('id', userData.user.id)
    .single();
  if (error) throw error;
  return data as MyProfile;
}

export async function updateMyProfile(updates: { full_name?: string; phone?: string | null; emergency_contact?: string | null }): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in.');

  const { error } = await supabase.from('profiles').update(updates).eq('id', userData.user.id);
  if (error) throw error;
}

export type MyClientDetails = { goals: string[]; equipment: string[] };

export async function getMyClientDetails(): Promise<MyClientDetails | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('client_profiles')
    .select('goals, equipment')
    .eq('profile_id', userData.user.id)
    .single();
  if (error) throw error;
  return data as MyClientDetails;
}

export async function updateMyClientDetails(updates: { goals?: string[]; equipment?: string[] }): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in.');

  const { error } = await supabase.from('client_profiles').update(updates).eq('profile_id', userData.user.id);
  if (error) throw error;
}

export type MyCoachDetails = { bio: string | null; specialization: string | null };

export async function getMyCoachDetails(): Promise<MyCoachDetails | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('coach_profiles')
    .select('bio, specialization')
    .eq('profile_id', userData.user.id)
    .single();
  if (error) throw error;
  return data as MyCoachDetails;
}

export async function updateMyCoachDetails(updates: { bio?: string | null; specialization?: string | null }): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in.');

  const { error } = await supabase.from('coach_profiles').update(updates).eq('profile_id', userData.user.id);
  if (error) throw error;
}

export async function changeMyPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
