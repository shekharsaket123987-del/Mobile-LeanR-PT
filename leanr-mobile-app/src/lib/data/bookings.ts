/**
 * Booking reads/writes — LEANR_PT_MOBILE_PRD.md §5 (My Sessions),
 * §8e (reschedule), §8f (cancel).
 *
 * cancelBooking/rescheduleBooking call RPC functions whose exact
 * parameter lists ARE given verbatim in the functional PRD (§8e/§8f) —
 * unlike most other write paths in this app, these were safe to wire
 * without guessing a schema. Everything else in this file is a read.
 */
import { supabase } from '@/lib/supabase/client';
import type { Booking, BookingStatus } from './types';

export async function getUpcomingBookings(limit = 5) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'upcoming')
    .order('scheduled_start', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function getSessionsByStatus(status: BookingStatus) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', status)
    .order('scheduled_start', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Booking[];
}

/**
 * §8f: RPC cancel_booking(booking_id, cancelled_by, reason, enforce_cutoff).
 * `cancelled_by` is the caller's own user id — the server-side cutoff-hour
 * rule (§13) is enforced by the function itself, not here.
 */
export async function cancelBooking(bookingId: string, reason: string | null, enforceCutoff = true) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('cancel_booking', {
    booking_id: bookingId,
    cancelled_by: userData.user?.id,
    reason,
    enforce_cutoff: enforceCutoff,
  });
  if (error) throw error;
}

/**
 * §8e: RPC reschedule_booking(booking_id, new_start, new_duration,
 * enforce_cutoff, new_coach_id=null).
 */
export async function rescheduleBooking(
  bookingId: string,
  newStart: string,
  newDurationMinutes: number,
  enforceCutoff = true
) {
  const { error } = await supabase.rpc('reschedule_booking', {
    booking_id: bookingId,
    new_start: newStart,
    new_duration: newDurationMinutes,
    enforce_cutoff: enforceCutoff,
    new_coach_id: null,
  });
  if (error) throw error;
}

/**
 * §10 "Rate Session": direct column update, not an RPC —
 * `bookings.quality_rating/trainer_rating/rating_note` are named exactly
 * in the PRD.
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
