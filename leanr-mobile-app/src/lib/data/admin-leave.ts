/**
 * Admin Leave Requests — LEANR_PT_MOBILE_PRD.md §10 "Screen: Leave
 * Requests (admin)". Confirmed live on 2026-08-19: `coach_leave_admin_all`
 * gives admin full read/write via `is_admin()`, no extra gate.
 */
import { supabase } from '@/lib/supabase/client';
import type { LeaveStatus, LeaveType } from './coach-availability';

export type AdminLeaveRequest = {
  id: string;
  coachName: string;
  starts_on: string;
  ends_on: string;
  leave_type: LeaveType;
  partial_start_time: string | null;
  partial_end_time: string | null;
  reason: string | null;
  status: LeaveStatus;
  created_at: string;
};

export async function getPendingLeaveRequests(): Promise<AdminLeaveRequest[]> {
  const { data, error } = await supabase
    .from('coach_leave')
    .select('id, starts_on, ends_on, leave_type, partial_start_time, partial_end_time, reason, status, created_at, coach_profiles(profiles(full_name))')
    .eq('status', 'pending')
    .order('starts_on', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const coachProfile = Array.isArray(row.coach_profiles) ? row.coach_profiles[0] : row.coach_profiles;
    const profile = coachProfile ? (Array.isArray(coachProfile.profiles) ? coachProfile.profiles[0] : coachProfile.profiles) : null;
    return {
      id: row.id,
      coachName: profile?.full_name ?? 'Coach',
      starts_on: row.starts_on,
      ends_on: row.ends_on,
      leave_type: row.leave_type,
      partial_start_time: row.partial_start_time,
      partial_end_time: row.partial_end_time,
      reason: row.reason,
      status: row.status,
      created_at: row.created_at,
    };
  });
}

export async function resolveLeaveRequest(id: string, status: 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase.from('coach_leave').update({ status }).eq('id', id);
  if (error) throw error;
}
