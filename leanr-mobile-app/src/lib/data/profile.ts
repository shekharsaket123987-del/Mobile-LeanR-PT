/**
 * Profile edit + password change — LEANR_PT_MOBILE_PRD.md §5 "Coach
 * Profile (self-service subset)/Password Change", client "Profile".
 * Confirmed against the real schema/RLS on 2026-08-19: `profiles`,
 * `client_profiles`, and `coach_profiles` all have an `_update_own`
 * policy keyed off `profile_id = auth.uid()` (or `id = auth.uid()` on
 * `profiles` itself) — real, direct write access, not a boundary like
 * coach-change stage 2 or payments.
 *
 * Field scope: `profiles` (name/phone/emergency contact/photo), client
 * `goals`/`equipment`/`medical_notes`, coach `bio`/`specialization`/
 * `certifications`/`languages`/`skills` (the latter three are
 * `text[]` columns, edited as comma-separated text same as
 * goals/equipment — same `_update_own` RLS as everything else here,
 * confirmed live).
 *
 * Photo upload (`uploadAvatarImage`) — confirmed live (2026-08-28) via
 * direct `pg_policies` introspection of the `avatars` bucket:
 * `avatars_owner_write`/`_update`/`_delete` all require the object
 * path's first folder segment to equal `auth.uid()`, `avatars_public_read`
 * allows anyone to read — matches PRD §12 exactly ("Owner (path segment
 * 1 = auth.uid()) writes"). Uploaded as an ArrayBuffer, same pattern as
 * `uploadChatImage` (chat.ts) for the same React-Native-Blob-support
 * reason documented there.
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

export async function updateMyProfile(updates: {
  full_name?: string;
  phone?: string | null;
  emergency_contact?: string | null;
  photo_url?: string | null;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in.');

  const { error } = await supabase.from('profiles').update(updates).eq('id', userData.user.id);
  if (error) throw error;
}

/** Uploads to the `avatars` bucket at `${auth.uid()}/...` (required by RLS) and returns the public URL. Does not save it to `profiles.photo_url` — call `updateMyProfile({photo_url})` with the result. */
export async function uploadAvatarImage(localUri: string, mimeType: string | undefined): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in.');

  const arrayBuffer = await fetch(localUri).then((res) => res.arrayBuffer());
  const ext = mimeType?.split('/')[1] ?? 'jpg';
  const path = `${userData.user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('avatars').upload(path, arrayBuffer, { contentType: mimeType ?? 'image/jpeg' });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

export type MyClientDetails = { goals: string[]; equipment: string[]; medical_notes: string | null };

export async function getMyClientDetails(): Promise<MyClientDetails | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('client_profiles')
    .select('goals, equipment, medical_notes')
    .eq('profile_id', userData.user.id)
    .single();
  if (error) throw error;
  return data as MyClientDetails;
}

export async function updateMyClientDetails(updates: {
  goals?: string[];
  equipment?: string[];
  medical_notes?: string | null;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in.');

  const { error } = await supabase.from('client_profiles').update(updates).eq('profile_id', userData.user.id);
  if (error) throw error;
}

export type MyCoachDetails = {
  bio: string | null;
  specialization: string | null;
  certifications: string[];
  languages: string[];
  skills: string[];
};

export async function getMyCoachDetails(): Promise<MyCoachDetails | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('coach_profiles')
    .select('bio, specialization, certifications, languages, skills')
    .eq('profile_id', userData.user.id)
    .single();
  if (error) throw error;
  return data as MyCoachDetails;
}

export async function updateMyCoachDetails(updates: {
  bio?: string | null;
  specialization?: string | null;
  certifications?: string[];
  languages?: string[];
  skills?: string[];
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in.');

  const { error } = await supabase.from('coach_profiles').update(updates).eq('profile_id', userData.user.id);
  if (error) throw error;
}

export async function changeMyPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
