/**
 * Coach lookup — New PRD.md §4.A "My Coach": `getMyCoachAction` "prefers
 * real recurring coach; falls back to upcoming-demo coach; else null."
 *
 * Confirmed against the real schema: there is no durable "assigned
 * coach" column anywhere on client_profiles or profiles. The primary
 * relationship lives on `recurring_slots` (client_id, coach_id,
 * status='active') — a client's coach is whoever coaches their active
 * weekly recurring slot(s). A demo-only client (no recurring slot yet)
 * has no such row, so this falls back to the coach of their most recent
 * assessment booking — the fix this file was missing before this pass
 * (a real, PRD-documented gap, not a new invented behavior).
 */
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';
import type { CoachProfile } from './types';

async function getCoachProfileById(coachId: string): Promise<CoachProfile | null> {
  const { data: coach, error } = await supabase
    .from('coach_profiles')
    .select('id, profile_id, bio, specialization, secondary_specializations, rating, profiles(full_name, photo_url)')
    .eq('id', coachId)
    .single();
  if (error || !coach) return null;

  const profile = Array.isArray(coach.profiles) ? coach.profiles[0] : coach.profiles;
  return {
    id: coach.id,
    profile_id: coach.profile_id,
    bio: coach.bio,
    specialization: coach.specialization,
    secondary_specializations: coach.secondary_specializations,
    rating: coach.rating,
    full_name: profile?.full_name,
    photo_url: profile?.photo_url,
  } as CoachProfile;
}

export async function getMyCoach(): Promise<CoachProfile | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data: slot } = await supabase
    .from('recurring_slots')
    .select('coach_id')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (slot?.coach_id) return getCoachProfileById(slot.coach_id);

  // No recurring coach — fall back to the most recent assessment booking's coach.
  const { data: demoBooking } = await supabase
    .from('bookings')
    .select('coach_id')
    .eq('client_id', clientId)
    .eq('session_type', 'assessment')
    .order('scheduled_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (demoBooking?.coach_id) return getCoachProfileById(demoBooking.coach_id);

  return null;
}
