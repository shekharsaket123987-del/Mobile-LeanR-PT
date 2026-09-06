/**
 * Admin Dashboard — New PRD.md §4.C "Screen: Dashboard" — 12 stat cards
 * (Total/Active Clients, Sessions Booked/Cancelled Today, Trainer
 * Utilization, Peak Booking Hour, Empty Slots, Revenue This Month,
 * Active Coaches, Avg Coach Rating, Avg Sessions/Day, Renewal Rate) +
 * Revenue Trend line chart + coach-utilization mini-bars + Bookings-by-
 * Hour bar chart. No filters/search, no buttons/forms (PRD: read-only).
 *
 * Sourced from the same shared, `security_invoker` DB views the web app
 * uses (`revenue_trend_view`, `coach_utilization_view`,
 * `bookings_by_hour_view`) — confirmed live against the active Supabase
 * project, not guessed from the PRD prose alone.
 *
 * Two KPIs (`emptySlots`, `renewalRate`) have no accessible source
 * formula — `adminDashboard.service.ts` lives only in the separate web
 * repo. Per New PRD.md §27, `default_session_duration_minutes` "only
 * shifts the admin dashboard's empty-slot KPI math" — i.e. web itself
 * treats this as a rough operational number, not a precisely-defined
 * one — so these are reconstructed here from first principles (documented
 * inline) rather than fabricated or omitted.
 */
import { supabase } from '@/lib/supabase/client';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istNow(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}
function istDayRangeUtc(d: Date): { start: string; end: string } {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const day = ist.getUTCDate();
  const startUtc = new Date(Date.UTC(y, m, day) - IST_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { start: startUtc.toISOString(), end: endUtc.toISOString() };
}
function istMonthStartUtc(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const startUtc = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
  return startUtc.toISOString();
}

export type AdminDashboard = {
  totalClients: number;
  activeClients: number;
  sessionsToday: number;
  cancelledToday: number;
  trainerUtilizationPct: number | null;
  peakBookingHour: number | null;
  emptySlotsToday: number;
  revenueThisMonth: number;
  activeCoaches: number;
  avgCoachRating: number | null;
  avgSessionsPerDay: number;
  renewalRatePct: number | null;
  revenueTrend: { month: string; revenue: number; sessions: number }[];
  bookingsByHour: { hour: number; bookings: number }[];
  coachUtilization: { coachId: string; coachName: string; utilizationPct: number }[];
};

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const now = istNow();
  const today = istDayRangeUtc(now);
  const monthStart = istMonthStartUtc(now);
  const daysElapsedInMonth = Math.max(1, Math.floor((now.getTime() - new Date(monthStart).getTime()) / (24 * 60 * 60 * 1000)) + 1);

  const [
    totalClientsRes,
    activeClientsRes,
    activeCoachesRes,
    todaysBookingsRes,
    monthBookingsRes,
    ratingsRes,
    revenueTrendRes,
    bookingsByHourRes,
    coachUtilizationRes,
    subscriptionsRes,
  ] = await Promise.all([
    supabase.from('client_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('client_profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('coach_profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('bookings').select('status').gte('scheduled_start', today.start).lt('scheduled_start', today.end),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('scheduled_start', monthStart).neq('status', 'cancelled'),
    supabase.from('bookings').select('trainer_rating').not('trainer_rating', 'is', null),
    supabase.from('revenue_trend_view').select('month, revenue, sessions').order('month', { ascending: true }),
    supabase.from('bookings_by_hour_view').select('hour_of_day, bookings'),
    supabase.from('coach_utilization_view').select('coach_id, coach_name, utilization_pct').order('utilization_pct', { ascending: false }),
    supabase.from('subscriptions').select('client_id'),
  ]);

  for (const res of [
    totalClientsRes,
    activeClientsRes,
    activeCoachesRes,
    todaysBookingsRes,
    monthBookingsRes,
    ratingsRes,
    revenueTrendRes,
    bookingsByHourRes,
    coachUtilizationRes,
    subscriptionsRes,
  ]) {
    if (res.error) throw res.error;
  }

  const todaysBookings = todaysBookingsRes.data ?? [];
  const sessionsToday = todaysBookings.filter((b) => b.status !== 'cancelled').length;
  const cancelledToday = todaysBookings.filter((b) => b.status === 'cancelled').length;

  const ratings = (ratingsRes.data ?? []).map((r) => r.trainer_rating as number);
  const avgCoachRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  const revenueTrend = (revenueTrendRes.data ?? []).map((r) => ({
    month: r.month as string,
    revenue: Number(r.revenue),
    sessions: Number(r.sessions),
  }));
  const thisMonthKey = new Date(monthStart).toISOString().slice(0, 7);
  const revenueThisMonth = revenueTrend.find((r) => r.month.slice(0, 7) === thisMonthKey)?.revenue ?? 0;

  const bookingsByHour = (bookingsByHourRes.data ?? [])
    .map((r) => ({ hour: r.hour_of_day as number, bookings: Number(r.bookings) }))
    .sort((a, b) => a.hour - b.hour);
  const peakBookingHour = bookingsByHour.length > 0 ? bookingsByHour.reduce((a, b) => (b.bookings > a.bookings ? b : a)).hour : null;

  const coachUtilization = (coachUtilizationRes.data ?? []).map((r) => ({
    coachId: r.coach_id as string,
    coachName: r.coach_name as string,
    utilizationPct: Number(r.utilization_pct),
  }));
  const trainerUtilizationPct =
    coachUtilization.length > 0 ? coachUtilization.reduce((a, b) => a + b.utilizationPct, 0) / coachUtilization.length : null;

  // Renewal rate: of clients who have ever had more than one subscription
  // (i.e. purchased again after their first ran its course — subscriptions
  // are never deleted, only superseded, New PRD.md §6), what fraction of
  // all clients-with-a-subscription-ever that represents.
  const subsByClient = new Map<string, number>();
  for (const row of subscriptionsRes.data ?? []) {
    subsByClient.set(row.client_id as string, (subsByClient.get(row.client_id as string) ?? 0) + 1);
  }
  const clientsWithAnySub = subsByClient.size;
  const clientsWithRenewal = [...subsByClient.values()].filter((n) => n > 1).length;
  const renewalRatePct = clientsWithAnySub > 0 ? (clientsWithRenewal / clientsWithAnySub) * 100 : null;

  // Empty slots today: sum of each active coach's today-of-week working-hour
  // capacity (in default-session-duration-sized slots), minus today's
  // non-cancelled bookings. Reconstructed formula — see file header.
  const istToday = new Date(now.getTime());
  const dayOfWeek = istToday.getUTCDay();
  const { data: settingRow } = await supabase.from('system_settings').select('value').eq('key', 'default_session_duration_minutes').maybeSingle();
  const slotMinutes = Number(settingRow?.value ?? 45) || 45;
  const { data: availabilityRows, error: availabilityError } = await supabase
    .from('coach_availability')
    .select('start_time, end_time, is_active, coach_profiles!inner(status)')
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .eq('coach_profiles.status', 'active');
  if (availabilityError) throw availabilityError;
  let capacitySlots = 0;
  for (const row of availabilityRows ?? []) {
    const [sh, sm] = (row.start_time as string).split(':').map(Number);
    const [eh, em] = (row.end_time as string).split(':').map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes > 0) capacitySlots += Math.floor(minutes / slotMinutes);
  }
  const emptySlotsToday = Math.max(0, capacitySlots - sessionsToday);

  return {
    totalClients: totalClientsRes.count ?? 0,
    activeClients: activeClientsRes.count ?? 0,
    sessionsToday,
    cancelledToday,
    trainerUtilizationPct,
    peakBookingHour,
    emptySlotsToday,
    revenueThisMonth,
    activeCoaches: activeCoachesRes.count ?? 0,
    avgCoachRating,
    avgSessionsPerDay: (monthBookingsRes.count ?? 0) / daysElapsedInMonth,
    renewalRatePct,
    revenueTrend,
    bookingsByHour,
    coachUtilization,
  };
}
