/**
 * Admin Provisioning — thin client for the `admin-provisioning` Edge
 * Function (supabase/functions/admin-provisioning/index.ts). Account
 * creation (`auth.admin.createUser`) requires the service-role key,
 * which must never ship inside the mobile bundle (New PRD.md §24) — so
 * this is the one admin action that goes through a server function
 * instead of a direct `supabase.from()`/`.rpc()` call, same pattern
 * already established by `coach-change-actions`.
 */
import { supabase } from '@/lib/supabase/client';

export type CreateClientInput = {
  fullName: string;
  phone: string | null;
  email: string;
  password: string;
  packageId: string;
  sessionsRemaining: number;
  originalPlanSize: number | null;
  pauseDaysAllowed: number;
  coachId: string | null;
  days: number[];
  hour: number | null;
  durationMinutes: number;
};

export type CreateCoachInput = {
  fullName: string;
  employeeCode: string;
  email: string;
  password: string;
  specialization: string;
  additionalSkills: string[];
  languages: string[];
  slots: { days: number[]; hour: number; durationMinutes: number }[];
};

async function invoke<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-provisioning', { body: { action, ...payload } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function createMigratedClient(input: CreateClientInput): Promise<{ clientId: string }> {
  return invoke('create_client', input as unknown as Record<string, unknown>);
}

export async function createCoach(input: CreateCoachInput): Promise<{ coachId: string }> {
  return invoke('create_coach', input as unknown as Record<string, unknown>);
}
