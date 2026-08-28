/**
 * Anonymous demo/assessment booking — the public entry point for a
 * prospect with no account, per LEANR_PT_MOBILE_PRD.md §15
 * (`createAssessmentBooking()`), README.md "Open items" #5.
 *
 * Deliberately does NOT replicate `demo-booking.ts`'s client-side
 * coach-matching (`findDemoMatch`/`getOpenSlotsForCoachOnDate`) — those
 * rely on RLS read access to `coach_availability`/`coach_leave`/
 * `coach_shifts`/`bookings` that only an authenticated user has.
 * `assessment_sessions` itself has no anon INSERT policy at all
 * (confirmed live, 2026-08-28), so this calls the privileged
 * `create-assessment-booking` Edge Function instead — same reasoning as
 * why `payments.ts`/`zoom.ts` call their own Edge Functions rather than
 * writing `payments`/`bookings.zoom_*` columns directly.
 */
import { extractFunctionErrorMessage } from '@/lib/data/edge-functions';
import { supabase } from '@/lib/supabase/client';

import type { IstDate } from './booking-wizard';

export type AnonymousDemoMatch = {
  coachId: string | null;
  coachName: string | null;
  slots: string[];
  durationMinutes: number;
};

export async function findAnonymousDemoSlots(date: IstDate): Promise<AnonymousDemoMatch> {
  const { data, error } = await supabase.functions.invoke('create-assessment-booking', {
    body: { action: 'find-slots', date },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Could not check available times.'));
  return data as AnonymousDemoMatch;
}

export type AnonymousDemoBookingInput = {
  prospectName: string;
  prospectEmail?: string;
  prospectPhone?: string;
  coachId: string;
  slotStart: string;
};

export type AnonymousDemoBookingResult = { id: string; coachName: string; scheduledStart: string };

export async function confirmAnonymousDemoBooking(input: AnonymousDemoBookingInput): Promise<AnonymousDemoBookingResult> {
  const { data, error } = await supabase.functions.invoke('create-assessment-booking', {
    body: { action: 'confirm', ...input },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Could not book your free demo — please try again.'));
  return data as AnonymousDemoBookingResult;
}
