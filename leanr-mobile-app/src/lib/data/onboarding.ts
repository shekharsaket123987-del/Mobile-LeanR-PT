/**
 * Client onboarding intake — `client_onboarding` (age/gender/height/weight/
 * medical fields/fitness_goal) PLUS a `progress_logs` row for the same
 * measurements, the Day-1 baseline the Home screen's "Progress Since Day 1"
 * delta grid and the Progress tab's chart both read from (per New PRD.md
 * §9.2: `submitOnboardingAction` DB effect is listed as
 * "`client_onboarding`, `progress_logs` insert", not `client_onboarding`
 * alone). RLS (`client_onboarding_insert_own`, `progress_logs_manage_own`)
 * lets a client insert/read only their own rows directly. There's no DB
 * unique constraint enforcing "one row per client" on `client_onboarding`
 * (confirmed via information_schema) — the "already submitted" one-time
 * lock is enforced here, client-side, by checking for an existing row
 * first, mirroring the web app's own one-time-insert UX.
 */
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';
import type { ClientOnboarding, FitnessGoal } from './types';

export async function getMyOnboarding(): Promise<ClientOnboarding | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data, error } = await supabase
    .from('client_onboarding')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data as ClientOnboarding | null;
}

export type OnboardingInput = {
  weightKg: number;
  fitnessGoal: FitnessGoal;
  age?: number;
  gender?: string;
  heightCm?: number;
  medicalConditions?: string;
  injuries?: string;
  medications?: string;
  exerciseRestrictions?: string;
  bodyFatPct?: number;
  musclePct?: number;
  waist?: number;
  chest?: number;
  hip?: number;
  arms?: number;
  thigh?: number;
};

export async function submitOnboarding(input: OnboardingInput): Promise<void> {
  const clientId = await getMyClientProfileId();
  if (!clientId) throw new Error('Not signed in as a client');

  const existing = await getMyOnboarding();
  if (existing) throw new Error('Onboarding has already been submitted — contact support to make changes.');

  const { error } = await supabase.from('client_onboarding').insert({
    client_id: clientId,
    weight_kg: input.weightKg,
    fitness_goal: input.fitnessGoal,
    age: input.age ?? null,
    gender: input.gender ?? null,
    height_cm: input.heightCm ?? null,
    medical_conditions: input.medicalConditions ?? null,
    injuries: input.injuries ?? null,
    medications: input.medications ?? null,
    exercise_restrictions: input.exerciseRestrictions ?? null,
  });
  if (error) throw error;

  // Day-1 baseline — the Home screen's "Progress Since Day 1" grid and the
  // Progress tab's chart both read the earliest progress_logs row.
  const { error: progressError } = await supabase.from('progress_logs').insert({
    client_id: clientId,
    logged_at: new Date().toISOString(),
    weight: input.weightKg,
    body_fat_pct: input.bodyFatPct ?? null,
    muscle_pct: input.musclePct ?? null,
    waist: input.waist ?? null,
    chest: input.chest ?? null,
    hip: input.hip ?? null,
    arms: input.arms ?? null,
    thigh: input.thigh ?? null,
  });
  if (progressError) throw progressError;
}
