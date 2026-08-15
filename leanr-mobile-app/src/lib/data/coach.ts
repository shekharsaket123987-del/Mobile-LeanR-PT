/**
 * Coach lookup — LEANR_PT_MOBILE_PRD.md §5 "My Coach", §9 Feature
 * Dependency Map ("Client Assignment (admin-set coach_id)").
 *
 * VERIFY: the PRD confirms a coach assignment exists but does not name
 * the exact column/table it lives on. `client_profiles.coach_id` is the
 * most PRD-consistent guess (client_profiles is the client's own-profile
 * extension table per §3) — confirm against the real schema.
 */
import { supabase } from '@/lib/supabase/client';
import type { CoachProfile } from './types';

export async function getMyCoach(): Promise<CoachProfile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data: clientProfile, error: clientError } = await supabase
    .from('client_profiles')
    .select('coach_id')
    .eq('id', userId)
    .single();
  if (clientError || !clientProfile?.coach_id) return null;

  const { data: coach, error: coachError } = await supabase
    .from('coach_profiles')
    .select('*')
    .eq('id', clientProfile.coach_id)
    .single();
  if (coachError || !coach) return null;

  return coach as CoachProfile;
}
