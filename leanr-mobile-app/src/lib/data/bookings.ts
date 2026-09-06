/**
 * Booking reads/writes — LEANR_PT_MOBILE_PRD.md §5 (My Sessions), §8e
 * (reschedule), §8f (cancel). Confirmed against the real schema: queries
 * filter by `client_profiles.id` (via identity.ts), not the raw auth
 * uid, and the RPC calls use the real `p_`-prefixed parameter names
 * (pulled directly from pg_proc — the earlier unprefixed names would
 * have failed outright).
 */
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';
import type { Booking, BookingStatus } from './types';

const BOOKING_SELECT_WITH_COACH = '*, coach_profiles(profiles(full_name))';

/** Flattens the nested `coach_profiles.profiles.full_name` join onto `coach_name`. */
function withCoachName(row: Record<string, unknown>): Booking {
  const coachProfile = row.coach_profiles as { profiles?: { full_name?: string } | { full_name?: string }[] } | null;
  const profile = coachProfile ? (Array.isArray(coachProfile.profiles) ? coachProfile.profiles[0] : coachProfile.profiles) : null;
  const { coach_profiles: _coachProfiles, ...rest } = row;
  return { ...rest, coach_name: profile?.full_name ?? null } as Booking;
}

export async function getUpcomingBookings(limit = 5) {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT_WITH_COACH)
    .eq('client_id', clientId)
    .eq('status', 'upcoming')
    .order('scheduled_start', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(withCoachName);
}

export async function getSessionsByStatus(status: BookingStatus) {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT_WITH_COACH)
    .eq('client_id', clientId)
    .eq('status', status)
    .order('scheduled_start', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(withCoachName);
}

export async function getClientBookingById(bookingId: string): Promise<Booking | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT_WITH_COACH)
    .eq('id', bookingId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data ? withCoachName(data) : null;
}

/** §8f: RPC cancel_booking(p_booking_id, p_cancelled_by, p_reason, p_enforce_cutoff). */
export async function cancelBooking(bookingId: string, reason: string | null, enforceCutoff = true) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_cancelled_by: userData.user?.id,
    p_reason: reason,
    p_enforce_cutoff: enforceCutoff,
  });
  if (error) throw error;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** IST calendar-day key for an ISO instant — local to this file since bookings.ts doesn't need the fuller IstDate machinery in booking-wizard.ts. */
function istDayKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

const RESCHEDULE_WEEKLY_CAP = 2;

/**
 * New PRD.md §6: "reschedules-this-week >= 2" rejects. Re-derived here
 * (client-side, before calling the RPC) because — confirmed directly
 * against the live `reschedule_booking` function body — the RPC itself
 * enforces only the cutoff, not this cap or the same-day check below; the
 * PRD itself notes these are web-JS-only checks, not DB-enforced.
 *
 * Approximation, noted rather than hidden: this counts *bookings* flagged
 * `was_rescheduled` with a recent `updated_at`, not a reschedule-event log
 * (none exists) — rescheduling the exact same booking twice in one week
 * would undercount by one. A reasonable proxy given the schema, not a
 * precise event count.
 */
async function countReschedulesThisWeek(clientId: string): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('was_rescheduled', true)
    .gte('updated_at', sevenDaysAgo);
  if (error) throw error;
  return count ?? 0;
}

/** New PRD.md §6: "the new date already has another upcoming booking for this client" rejects. */
async function hasAnotherUpcomingBookingOnDate(clientId: string, dateIso: string, excludeBookingId: string): Promise<boolean> {
  const targetKey = istDayKey(dateIso);

  const { data, error } = await supabase
    .from('bookings')
    .select('id, scheduled_start')
    .eq('client_id', clientId)
    .eq('status', 'upcoming')
    .neq('id', excludeBookingId);
  if (error) throw error;

  return (data ?? []).some((b) => istDayKey(b.scheduled_start as string) === targetKey);
}

/**
 * §8e: `reschedule_booking` has two live overloads — a 4-arg one (used
 * here) that sets `was_rescheduled`/`original_scheduled_start` (confirmed
 * live via direct introspection — still correctly tracked in THIS
 * project's schema, unlike New PRD.md's note about a regression on the
 * web app's own database), and a 5-arg one (adds `p_new_coach_id`) that
 * changes the coach instead and does NOT track `was_rescheduled` at all.
 * This client never does a coach-swap reschedule, so the second overload
 * is intentionally unused.
 */
export async function rescheduleBooking(bookingId: string, newStart: string, newDurationMinutes: number, enforceCutoff = true) {
  const clientId = await getMyClientProfileId();
  if (!clientId) throw new Error('Could not resolve your client profile.');

  if (enforceCutoff) {
    // Both caps are client-only rules (New PRD.md §6) — admin reschedules
    // (enforceCutoff=false, not used by this client-facing screen today)
    // bypass them exactly like the web app's own admin path does.
    const [weeklyCount, sameDayConflict] = await Promise.all([
      countReschedulesThisWeek(clientId),
      hasAnotherUpcomingBookingOnDate(clientId, newStart, bookingId),
    ]);
    if (weeklyCount >= RESCHEDULE_WEEKLY_CAP) {
      throw new Error('You have reached the maximum reschedule limit for this week.');
    }
    if (sameDayConflict) {
      throw new Error('You already have another session booked on that day.');
    }
  }

  const { error } = await supabase.rpc('reschedule_booking', {
    p_booking_id: bookingId,
    p_new_start: newStart,
    p_new_duration_minutes: newDurationMinutes,
    p_enforce_cutoff: enforceCutoff,
  });
  if (error) throw error;
}

export async function getRescheduledSessions() {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT_WITH_COACH)
    .eq('client_id', clientId)
    .eq('was_rescheduled', true)
    .order('scheduled_start', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(withCoachName);
}

/**
 * New PRD.md §6: "rated any booking within the last 7 days" rejects a new
 * rating GLOBALLY across all the client's bookings, not per-booking — so
 * this checks the client's most recent `rated_at` across every booking,
 * not just the one being rated.
 */
export async function canRateThisWeek(clientId: string): Promise<boolean> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('rated_at', sevenDaysAgo);
  if (error) throw error;
  return (count ?? 0) === 0;
}

/**
 * §10 "Rate Session": direct column update, not an RPC —
 * `bookings.quality_rating/trainer_rating/rating_note/rated_at` are
 * confirmed real columns. Caller must check `canRateThisWeek` first (the
 * 7-day global cap, New PRD.md §6) — this function itself doesn't
 * re-check it, matching how the rest of this file separates the cap
 * checks from the mutation for reschedule above.
 */
export async function rateSession(
  bookingId: string,
  rating: { qualityRating?: number; trainerRating?: number; note?: string }
) {
  const { error } = await supabase
    .from('bookings')
    .update({
      quality_rating: rating.qualityRating,
      trainer_rating: rating.trainerRating,
      rating_note: rating.note,
      rated_at: new Date().toISOString(),
    })
    .eq('id', bookingId);
  if (error) throw error;
}
