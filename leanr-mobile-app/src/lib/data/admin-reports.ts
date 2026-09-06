/**
 * Admin Reports — New PRD.md §4.C "Screen: Reports" — 5 fixed report
 * cards (Client, Coach, Monthly PT, Revenue, Cancellation/No-Show).
 * `jspdf`/CSV-blob-download (web-only, browser APIs) has no mobile
 * equivalent — this generates the same underlying data as CSV text and
 * hands it to React Native's built-in `Share` sheet (no new native
 * dependency required) rather than a fabricated download.
 */
import { supabase } from '@/lib/supabase/client';

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

export async function generateClientReportCsv(): Promise<string> {
  const { data, error } = await supabase.from('client_profiles').select('client_code, status, joined_date, profiles(full_name, phone)');
  if (error) throw error;
  const rows = (data ?? []).map((row) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return [row.client_code, p?.full_name ?? '', p?.phone ?? '', row.status, row.joined_date ?? ''];
  });
  return toCsv(['Client Code', 'Name', 'Phone', 'Status', 'Joined Date'], rows);
}

export async function generateCoachReportCsv(): Promise<string> {
  const [coachesRes, utilRes] = await Promise.all([
    supabase.from('coach_profiles').select('employee_code, specialization, status, profiles(full_name)'),
    supabase.from('coach_utilization_view').select('coach_id, active_clients, utilization_pct'),
  ]);
  if (coachesRes.error) throw coachesRes.error;
  if (utilRes.error) throw utilRes.error;
  const utilByCoach = new Map((utilRes.data ?? []).map((u) => [u.coach_id, u]));
  const rows = (coachesRes.data ?? []).map((row) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const util = utilByCoach.get((row as unknown as { id?: string }).id ?? '');
    return [row.employee_code, p?.full_name ?? '', row.specialization ?? '', row.status, util?.active_clients ?? 0, util ? Number(util.utilization_pct).toFixed(0) + '%' : ''];
  });
  return toCsv(['Employee Code', 'Name', 'Specialization', 'Status', 'Active Clients', 'Utilization'], rows);
}

export async function generateMonthlyPtReportCsv(): Promise<string> {
  const { data, error } = await supabase.from('revenue_trend_view').select('month, revenue, sessions').order('month', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []).map((row) => [new Date(row.month).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), row.sessions, Number(row.revenue).toFixed(2)]);
  return toCsv(['Month', 'Sessions', 'Revenue'], rows);
}

export async function generateRevenueReportCsv(): Promise<string> {
  const { data, error } = await supabase.from('sales_view').select('*').order('sale_date', { ascending: false }).limit(500);
  if (error) throw error;
  const rows = (data ?? []).map((row) => [row.client_code, row.client_name, row.package_name, Number(row.amount).toFixed(2), new Date(row.sale_date).toISOString().slice(0, 10)]);
  return toCsv(['Client Code', 'Client', 'Package', 'Amount', 'Sale Date'], rows);
}

export async function generateCancellationReportCsv(): Promise<string> {
  const { data, error } = await supabase
    .from('bookings')
    .select('scheduled_start, status, cancel_reason, no_show_party, client_profiles(profiles(full_name)), coach_profiles(profiles(full_name))')
    .in('status', ['cancelled', 'missed'])
    .order('scheduled_start', { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []).map((row) => {
    const cp = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
    const clientP = cp ? (Array.isArray(cp.profiles) ? cp.profiles[0] : cp.profiles) : null;
    const cop = Array.isArray(row.coach_profiles) ? row.coach_profiles[0] : row.coach_profiles;
    const coachP = cop ? (Array.isArray(cop.profiles) ? cop.profiles[0] : cop.profiles) : null;
    return [new Date(row.scheduled_start).toISOString(), row.status, clientP?.full_name ?? '', coachP?.full_name ?? '', row.cancel_reason ?? '', row.no_show_party ?? ''];
  });
  return toCsv(['Scheduled Start', 'Status', 'Client', 'Coach', 'Cancel Reason', 'No-Show Party'], rows);
}
