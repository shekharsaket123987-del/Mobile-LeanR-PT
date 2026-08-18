/**
 * Coach Availability (view) + Request Leave — LEANR_PT_MOBILE_PRD.md §5
 * "Availability (view + leave request)", §13 rules 11-12, §16
 * "Coaches are read-only on their own working hours in the app — only
 * admins set coach_availability. The mobile coach app must not offer an
 * 'edit my hours' control; only a 'Request Leave' control." (migration
 * 0045). Confirmed against the real schema/RLS/constraints on
 * 2026-08-19:
 *
 * - `coach_availability` has no coach INSERT/UPDATE policy at all (only
 *   `coach_availability_admin_all` + broad SELECT) — read-only is not
 *   just a UI choice, RLS enforces it.
 * - `coach_leave` DOES let a coach INSERT their own rows
 *   (`coach_leave_insert_own`, `coach_id = my_coach_id()`). Three real
 *   CHECK constraints do the structural validation: `ends_on >=
 *   starts_on`, partial leave requires both partial times set (full-day
 *   requires them null), and partial leave must be single-day
 *   (`starts_on = ends_on`) — §13 rule 12.
 * - **§13 rule 11's "24h notice" is NOT a DB constraint** — no trigger,
 *   no CHECK enforces it (confirmed via `information_schema.triggers` +
 *   `pg_constraint`). This file enforces it client-side only, matching
 *   the web app's stated behavior ("no admin bypass in the request
 *   flow"), but a request that violates it would still be accepted by
 *   the database itself if this check were bypassed.
 */
import { getMyCoachProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';

export type WeeklyAvailability = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function dayName(dow: number) {
  return DAY_NAMES[dow] ?? String(dow);
}

export async function getMyWeeklyAvailability(): Promise<WeeklyAvailability[]> {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  const { data, error } = await supabase
    .from('coach_availability')
    .select('id, day_of_week, start_time, end_time')
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .order('day_of_week', { ascending: true });
  if (error) throw error;
  return (data ?? []) as WeeklyAvailability[];
}

export type LeaveType = 'full_day' | 'partial';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export type LeaveRequest = {
  id: string;
  starts_on: string;
  ends_on: string;
  leave_type: LeaveType;
  partial_start_time: string | null;
  partial_end_time: string | null;
  reason: string | null;
  status: LeaveStatus;
  created_at: string;
};

export async function getMyLeaveRequests(): Promise<LeaveRequest[]> {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  const { data, error } = await supabase
    .from('coach_leave')
    .select('id, starts_on, ends_on, leave_type, partial_start_time, partial_end_time, reason, status, created_at')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeaveRequest[];
}

export async function requestLeave(input: {
  startsOn: string; // YYYY-MM-DD
  endsOn: string; // YYYY-MM-DD
  leaveType: LeaveType;
  partialStartTime?: string | null; // HH:MM:SS
  partialEndTime?: string | null;
  reason: string | null;
}): Promise<void> {
  const coachId = await getMyCoachProfileId();
  if (!coachId) throw new Error('Could not resolve your coach profile.');

  const hoursNotice = (new Date(`${input.startsOn}T00:00:00`).getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursNotice < 24) {
    throw new Error('Leave requests need at least 24 hours notice.');
  }
  if (input.leaveType === 'partial' && input.startsOn !== input.endsOn) {
    throw new Error('Partial-day leave must be a single day.');
  }

  const { error } = await supabase.from('coach_leave').insert({
    coach_id: coachId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    leave_type: input.leaveType,
    partial_start_time: input.leaveType === 'partial' ? input.partialStartTime : null,
    partial_end_time: input.leaveType === 'partial' ? input.partialEndTime : null,
    reason: input.reason,
  });
  if (error) throw error;
}
