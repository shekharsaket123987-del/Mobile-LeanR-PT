/**
 * Coach lookup — LEANR_PT_MOBILE_PRD.md §5 "My Coach".
 *
 * Confirmed against the real schema: there is no durable "assigned
 * coach" column anywhere on client_profiles or profiles. The actual
 * relationship lives on `recurring_slots` (client_id, coach_id,
 * status='active') — a client's coach is whoever coaches their active
 * weekly recurring slot(s). This matches the original PRD's Feature
 * Dependency Map (§9): "Client Assignment (admin-set coach_id)" flowing
 * into "Recurring Schedule Setup".
 */
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';
import type { CoachProfile } from './types';

export async function getMyCoach(): Promise<CoachProfile | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data: slot, error: slotError } = await supabase
    .from('recurring_slots')
    .select('coach_id')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (slotError || !slot?.coach_id) return null;

  const { data: coach, error: coachError } = await supabase
    .from('coach_profiles')
    .select('id, profile_id, bio, specialization, profiles(full_name, photo_url)')
    .eq('id', slot.coach_id)
    .single();
  if (coachError || !coach) return null;

  const profile = Array.isArray(coach.profiles) ? coach.profiles[0] : coach.profiles;
  return {
    id: coach.id,
    profile_id: coach.profile_id,
    bio: coach.bio,
    specialization: coach.specialization,
    full_name: profile?.full_name,
    photo_url: profile?.photo_url,
  } as CoachProfile;
}
