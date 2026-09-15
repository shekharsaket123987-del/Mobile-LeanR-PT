/**
 * Admin Coach Management — New PRD.md §4.C "Screen: Coaches (list)" and
 * "Screen: Coach Detail (second-richest)". Admin RLS (`*_admin_all`,
 * confirmed live) grants full read/write on `coach_profiles`,
 * `profiles`, `coach_availability`, `coach_leave`, `recurring_slots`,
 * `bookings` — no service-role key needed for any of these.
 */
import { supabase } from '@/lib/supabase/client';
import { transferClientCoach } from './admin-clients';

export type AdminCoachListRow = {
  id: string;
  full_name: string;
  photo_url: string | null;
  employeeCode: string;
  specialization: string | null;
  status: string;
  rating: number | null;
  activeClients: number;
  utilizationPct: number | null;
};

export async function listAdminCoaches(): Promise<AdminCoachListRow[]> {
  const [coachesRes, utilizationRes] = await Promise.all([
    supabase.from('coach_profiles').select('id, employee_code, specialization, status, profiles(full_name, photo_url)').order('created_at', { ascending: false }),
    supabase.from('coach_utilization_view').select('coach_id, active_clients, utilization_pct'),
  ]);
  if (coachesRes.error) throw coachesRes.error;
  if (utilizationRes.error) throw utilizationRes.error;

  const utilByCoach = new Map((utilizationRes.data ?? []).map((u) => [u.coach_id as string, u]));

  const coachIds = (coachesRes.data ?? []).map((c) => c.id);
  const ratingsRes = coachIds.length > 0 ? await supabase.from('bookings').select('coach_id, trainer_rating').in('coach_id', coachIds).not('trainer_rating', 'is', null) : { data: [], error: null };
  if (ratingsRes.error) throw ratingsRes.error;
  const ratingsByCoach = new Map<string, number[]>();
  for (const row of ratingsRes.data ?? []) {
    const list = ratingsByCoach.get(row.coach_id) ?? [];
    list.push(row.trainer_rating as number);
    ratingsByCoach.set(row.coach_id, list);
  }

  return (coachesRes.data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const util = utilByCoach.get(row.id);
    const ratings = ratingsByCoach.get(row.id) ?? [];
    return {
      id: row.id,
      full_name: profile?.full_name ?? 'Coach',
      photo_url: profile?.photo_url ?? null,
      employeeCode: row.employee_code,
      specialization: row.specialization,
      status: row.status,
      rating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
      activeClients: Number(util?.active_clients ?? 0),
      utilizationPct: util ? Number(util.utilization_pct) : null,
    };
  });
}

export type WorkingHoursRow = { day_of_week: number; start_time: string; end_time: string; is_active: boolean };

export type AssignedClient = { id: string; full_name: string; packageName: string | null; sessionsRemaining: number | null };

export type AdminCoachDetail = AdminCoachListRow & {
  profileId: string;
  phone: string | null;
  yearsExperience: number | null;
  bio: string | null;
  secondarySpecializations: string[];
  languages: string[];
  skills: string[];
  maxCapacity: number | null;
  gender: string | null;
  workingHours: WorkingHoursRow[];
  assignedClients: AssignedClient[];
  completedSessions: number;
  upcomingSessions: number;
  missedSessions: number;
};

export async function getAdminCoachDetail(coachId: string): Promise<AdminCoachDetail | null> {
  const { data: row, error } = await supabase
    .from('coach_profiles')
    .select(
      'id, profile_id, employee_code, specialization, secondary_specializations, years_experience, bio, languages, skills, status, gender, max_capacity, profiles(full_name, photo_url, phone)'
    )
    .eq('id', coachId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

  const [utilRes, ratingsRes, workingHoursRes, slotsRes, countsRes] = await Promise.all([
    supabase.from('coach_utilization_view').select('active_clients, utilization_pct').eq('coach_id', coachId).maybeSingle(),
    supabase.from('bookings').select('trainer_rating').eq('coach_id', coachId).not('trainer_rating', 'is', null),
    supabase.from('coach_availability').select('day_of_week, start_time, end_time, is_active').eq('coach_id', coachId).order('day_of_week', { ascending: true }),
    supabase.from('recurring_slots').select('client_id, client_profiles(profiles(full_name))').eq('coach_id', coachId).eq('status', 'active'),
    Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).eq('status', 'completed'),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).eq('status', 'upcoming'),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).eq('status', 'missed'),
    ]),
  ]);
  if (utilRes.error) throw utilRes.error;
  if (ratingsRes.error) throw ratingsRes.error;
  if (workingHoursRes.error) throw workingHoursRes.error;
  if (slotsRes.error) throw slotsRes.error;

  const ratings = (ratingsRes.data ?? []).map((r) => r.trainer_rating as number);
  const seenClients = new Map<string, string>();
  for (const s of slotsRes.data ?? []) {
    const cp = Array.isArray(s.client_profiles) ? s.client_profiles[0] : s.client_profiles;
    const p = cp ? (Array.isArray(cp.profiles) ? cp.profiles[0] : cp.profiles) : null;
    if (!seenClients.has(s.client_id)) seenClients.set(s.client_id, p?.full_name ?? 'Client');
  }
  const [completedRes, upcomingRes, missedRes] = countsRes;

  // Matches web's admin-coach.actions.ts:107-108 (packageName/sessionsRemaining
  // per assigned client) — sessionsRemaining derived the same way it is
  // everywhere else in this codebase (sessions_total minus a live count of
  // `completed` bookings on that subscription), not web's subscription_usage_view.
  const clientIds = [...seenClients.keys()];
  const activeSubsRes =
    clientIds.length > 0
      ? await supabase.from('subscriptions').select('id, client_id, sessions_total, package:package_tiers(name)').eq('status', 'active').in('client_id', clientIds)
      : { data: [], error: null };
  if (activeSubsRes.error) throw activeSubsRes.error;
  const activeSubs = activeSubsRes.data ?? [];
  const subCompletedRes =
    activeSubs.length > 0
      ? await supabase
          .from('bookings')
          .select('subscription_id')
          .eq('status', 'completed')
          .in(
            'subscription_id',
            activeSubs.map((s) => s.id)
          )
      : { data: [], error: null };
  if (subCompletedRes.error) throw subCompletedRes.error;
  const usedBySubscription = new Map<string, number>();
  for (const b of subCompletedRes.data ?? []) {
    if (!b.subscription_id) continue;
    usedBySubscription.set(b.subscription_id, (usedBySubscription.get(b.subscription_id) ?? 0) + 1);
  }
  const subByClient = new Map(activeSubs.map((s) => [s.client_id, s]));

  return {
    id: row.id,
    profileId: row.profile_id,
    full_name: profile?.full_name ?? 'Coach',
    photo_url: profile?.photo_url ?? null,
    phone: profile?.phone ?? null,
    employeeCode: row.employee_code,
    specialization: row.specialization,
    secondarySpecializations: row.secondary_specializations ?? [],
    yearsExperience: row.years_experience,
    bio: row.bio,
    languages: row.languages ?? [],
    skills: row.skills ?? [],
    status: row.status,
    gender: row.gender,
    maxCapacity: row.max_capacity,
    rating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    activeClients: Number(utilRes.data?.active_clients ?? 0),
    utilizationPct: utilRes.data ? Number(utilRes.data.utilization_pct) : null,
    workingHours: (workingHoursRes.data ?? []) as WorkingHoursRow[],
    assignedClients: [...seenClients.entries()].map(([id, full_name]) => {
      const sub = subByClient.get(id);
      const pkg = sub ? (Array.isArray(sub.package) ? sub.package[0] : sub.package) : null;
      return {
        id,
        full_name,
        packageName: pkg?.name ?? null,
        sessionsRemaining: sub ? (sub.sessions_total as number) - (usedBySubscription.get(sub.id) ?? 0) : null,
      };
    }),
    completedSessions: completedRes.count ?? 0,
    upcomingSessions: upcomingRes.count ?? 0,
    missedSessions: missedRes.count ?? 0,
  };
}

export async function updateCoach(
  coachId: string,
  profileId: string,
  updates: { full_name?: string; specialization?: string; years_experience?: number; bio?: string; secondary_specializations?: string[]; languages?: string[] }
): Promise<void> {
  const { full_name, ...coachUpdates } = updates;
  if (full_name !== undefined) {
    const { error } = await supabase.from('profiles').update({ full_name }).eq('id', profileId);
    if (error) throw error;
  }
  if (Object.keys(coachUpdates).length > 0) {
    const { error } = await supabase.from('coach_profiles').update(coachUpdates).eq('id', coachId);
    if (error) throw error;
  }
}

export async function updateCoachSkills(coachId: string, skills: string[]): Promise<void> {
  const { error } = await supabase.from('coach_profiles').update({ skills }).eq('id', coachId);
  if (error) throw error;
}

/** The only admin write path for a coach's recurring template (New PRD.md §4.C) — replaces the full week. */
export async function setCoachAvailability(coachId: string, rows: WorkingHoursRow[]): Promise<void> {
  const { error: deleteError } = await supabase.from('coach_availability').delete().eq('coach_id', coachId);
  if (deleteError) throw deleteError;
  const activeRows = rows.filter((r) => r.is_active);
  if (activeRows.length === 0) return;
  const { error: insertError } = await supabase.from('coach_availability').insert(activeRows.map((r) => ({ coach_id: coachId, ...r })));
  if (insertError) throw insertError;
}

/** Override/Block Slot — a pre-approved one-day leave override, same table the coach's own leave requests use (New PRD.md §4.C). */
export async function blockCoachSlot(coachId: string, date: string, reason: string | null): Promise<void> {
  const { error } = await supabase.from('coach_leave').insert({
    coach_id: coachId,
    starts_on: date,
    ends_on: date,
    leave_type: 'full_day',
    status: 'approved',
    reason: reason || 'Blocked by admin',
  });
  if (error) throw error;
}

export type ReassignResult = { reassignedCount: number; failed: { clientId: string; clientName: string; error: string }[] };

/** Bulk reassignment — per-client independent try/catch (New PRD.md §4.C: one client's failure never blocks the rest). */
export async function reassignCoachClients(fromCoachId: string, newCoachId: string): Promise<ReassignResult> {
  const { data: slots, error } = await supabase
    .from('recurring_slots')
    .select('client_id, client_profiles(profiles(full_name))')
    .eq('coach_id', fromCoachId)
    .eq('status', 'active');
  if (error) throw error;

  const clients = new Map<string, string>();
  for (const s of slots ?? []) {
    const cp = Array.isArray(s.client_profiles) ? s.client_profiles[0] : s.client_profiles;
    const p = cp ? (Array.isArray(cp.profiles) ? cp.profiles[0] : cp.profiles) : null;
    clients.set(s.client_id, p?.full_name ?? 'Client');
  }

  let reassignedCount = 0;
  const failed: ReassignResult['failed'] = [];
  for (const [clientId, clientName] of clients) {
    try {
      await transferClientCoach(clientId, newCoachId, true);
      reassignedCount++;
    } catch (err) {
      failed.push({ clientId, clientName, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { reassignedCount, failed };
}

/** Soft-disable only — no hard delete exists for any entity (New PRD.md §4.C). */
export async function disableCoach(coachId: string): Promise<void> {
  const { error } = await supabase.from('coach_profiles').update({ status: 'inactive' }).eq('id', coachId);
  if (error) throw error;
}

export type AdminCoachPerformance = {
  sessionsScheduledToday: number;
  attendancePct: number;
  clientNoShowPct: number;
  coachNoShowPct: number;
  maxCapacity: number;
  availableCapacity: number;
  totalWeeklySessions: number;
  totalMonthlySessions: number;
  avgSessionDurationMinutes: number;
  escalationsRaised: number;
  coachChangeRequestsReceived: number;
};

/**
 * Workload-balancing / coaching-quality panel — mirrors web's
 * computePerformance() in coachPerformance.service.ts exactly (same
 * queries, same definitions), scoped here to the admin coach-detail
 * "Performance" section. `listAdminCoaches`/`getAdminCoachDetail` above
 * already cover activeClients/utilizationPct/rating/completed-upcoming-
 * missed counts; this covers the remaining web-only metrics.
 */
export async function getAdminCoachPerformance(coachId: string): Promise<AdminCoachPerformance> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [coachRes, todayRes, weekRes, monthRes, completedRes, outcomeRes, changeReqRes, escalationsRes] = await Promise.all([
    supabase.from('coach_profiles').select('max_capacity').eq('id', coachId).maybeSingle(),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).eq('status', 'upcoming').gte('scheduled_start', todayStart.toISOString()).lt('scheduled_start', todayEnd.toISOString()),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).gte('scheduled_start', weekStart.toISOString()),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).gte('scheduled_start', monthStart.toISOString()),
    supabase.from('bookings').select('id, duration_minutes').eq('coach_id', coachId).eq('status', 'completed'),
    supabase.from('bookings').select('id, no_show_party').eq('coach_id', coachId).in('status', ['completed', 'missed', 'cancelled']),
    supabase.from('coach_change_requests').select('id', { count: 'exact', head: true }).eq('current_coach_id', coachId),
    supabase.from('escalations').select('id', { count: 'exact', head: true }).eq('coach_id', coachId),
  ]);
  if (coachRes.error) throw coachRes.error;
  if (todayRes.error) throw todayRes.error;
  if (weekRes.error) throw weekRes.error;
  if (monthRes.error) throw monthRes.error;
  if (completedRes.error) throw completedRes.error;
  if (outcomeRes.error) throw outcomeRes.error;
  if (changeReqRes.error) throw changeReqRes.error;
  if (escalationsRes.error) throw escalationsRes.error;

  const completedRows = completedRes.data ?? [];
  const avgSessionDurationMinutes =
    completedRows.length > 0 ? Math.round(completedRows.reduce((s, b) => s + (b.duration_minutes ?? 0), 0) / completedRows.length) : 0;

  const outcomes = outcomeRes.data ?? [];
  const totalOutcomes = outcomes.length;
  const clientNoShowPct = totalOutcomes > 0 ? Math.round((outcomes.filter((o) => o.no_show_party === 'client').length / totalOutcomes) * 100) : 0;
  const coachNoShowPct = totalOutcomes > 0 ? Math.round((outcomes.filter((o) => o.no_show_party === 'coach').length / totalOutcomes) * 100) : 0;

  let attendancePct = 0;
  const completedBookingIds = completedRows.map((b) => b.id);
  if (completedBookingIds.length > 0) {
    const { data: attendanceRows, error: attendanceError } = await supabase.from('attendance').select('status').in('booking_id', completedBookingIds);
    if (attendanceError) throw attendanceError;
    const attendance = attendanceRows ?? [];
    attendancePct = Math.round((attendance.filter((a) => a.status === 'present').length / completedBookingIds.length) * 100);
  }

  const maxCapacity = coachRes.data?.max_capacity ?? 50;
  const utilRes = await supabase.from('coach_utilization_view').select('active_clients').eq('coach_id', coachId).maybeSingle();
  if (utilRes.error) throw utilRes.error;
  const currentCapacity = Number(utilRes.data?.active_clients ?? 0);

  return {
    sessionsScheduledToday: todayRes.count ?? 0,
    attendancePct,
    clientNoShowPct,
    coachNoShowPct,
    maxCapacity,
    availableCapacity: Math.max(0, maxCapacity - currentCapacity),
    totalWeeklySessions: weekRes.count ?? 0,
    totalMonthlySessions: monthRes.count ?? 0,
    avgSessionDurationMinutes,
    escalationsRaised: escalationsRes.count ?? 0,
    coachChangeRequestsReceived: changeReqRes.count ?? 0,
  };
}
