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

export async function getUpcomingBookings(limit = 5) {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'upcoming')
    .order('scheduled_start', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function getSessionsByStatus(status: BookingStatus) {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', status)
    .order('scheduled_start', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function getClientBookingById(bookingId: string): Promise<Booking | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data as Booking | null;
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

/**
 * §8e: `reschedule_booking` has two live overloads — a 4-arg one (used
 * here) that sets `was_rescheduled`/`original_scheduled_start`, and a
 * 5-arg one (adds `p_new_coach_id`) that changes the coach instead and
 * does NOT track `was_rescheduled` at all. Confirmed via direct
 * introspection on 2026-08-17. Passing exactly these 4 named params
 * resolves to the tracked overload — this client never does a coach-swap
 * reschedule, so the second overload is intentionally unused.
 */
export async function rescheduleBooking(bookingId: string, newStart: string, newDurationMinutes: number, enforceCutoff = true) {
  const { error } = await supabase.rpc('reschedule_booking', {
    p_booking_id: bookingId,
    p_new_start: newStart,
    p_new_duration_minutes: newDurationMinutes,
    p_enforce_cutoff: enforceCutoff,
  });
  if (error) throw error;
}

/**
 * §10 "Rate Session": direct column update, not an RPC —
 * `bookings.quality_rating/trainer_rating/rating_note` are confirmed
 * real columns.
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
    })
    .eq('id', bookingId);
  if (error) throw error;
}
