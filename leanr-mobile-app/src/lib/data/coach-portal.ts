/**
 * Coach-side reads/writes — LEANR_PT_MOBILE_PRD.md §5 (Coach Portal),
 * §8b (mark present), §8c (submit notes), §8d (mark absent). Confirmed
 * against the real schema: `coach_id`/`client_id` everywhere reference
 * `coach_profiles.id`/`client_profiles.id` (resolved via identity.ts),
 * `attendance.booking_id` FK is real, and `workout_notes` columns are
 * `notes`/`performance_rating` (not `summary`/`performance`) plus
 * required `client_id`/`coach_id` FKs pulled from the booking itself.
 */
import { getMyCoachProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';
import type { Booking, ClientProfile } from './types';

export async function getCoachBookings(range: 'today' | 'upcoming' = 'upcoming') {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  let query = supabase
    .from('bookings')
    .select('*')
    .eq('coach_id', coachId)
    .eq('status', 'upcoming')
    .order('scheduled_start', { ascending: true });

  if (range === 'today') {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    query = query.gte('scheduled_start', startOfDay.toISOString()).lte('scheduled_start', endOfDay.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function getBookingById(bookingId: string) {
  const { data, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
  if (error) throw error;
  return data as Booking;
}

/**
 * Sets bookings.coach_joined_at — original PRD §7g: "Join" -> "Zoom
 * opens + coach_joined_at set". Confirmed real column.
 */
export async function markJoined(bookingId: string) {
  const { error } = await supabase.from('bookings').update({ coach_joined_at: new Date().toISOString() }).eq('id', bookingId);
  if (error) throw error;
}

/**
 * §8b business logic: "assert now >= scheduled_start+duration; assert
 * (not today) OR coach_joined_at set". Client-side guidance only — the
 * real enforcement, if any, lives server-side; this just avoids showing
 * enabled buttons that would fail.
 */
export function attendanceEligible(booking: Booking): boolean {
  const start = new Date(booking.scheduled_start).getTime();
  const end = start + booking.duration_minutes * 60_000;
  const now = Date.now();
  const isToday = new Date(booking.scheduled_start).toDateString() === new Date().toDateString();
  return now >= end && (!isToday || Boolean(booking.coach_joined_at));
}

/** §8b/§8d: UPSERT attendance(booking_id, status, checked_in_at, checked_out_at). */
export async function markAttendance(booking: Booking, status: 'present' | 'late' | 'absent') {
  const now = new Date().toISOString();

  if (status === 'absent') {
    const { error: attendanceError } = await supabase
      .from('attendance')
      .upsert({ booking_id: booking.id, status: 'absent', checked_out_at: now }, { onConflict: 'booking_id' });
    if (attendanceError) throw attendanceError;

    const { error: bookingError } = await supabase
      .from('bookings')
      .update({ status: 'missed', no_show_party: 'client' })
      .eq('id', booking.id);
    if (bookingError) throw bookingError;
    return;
  }

  const { error: attendanceError } = await supabase.from('attendance').upsert(
    {
      booking_id: booking.id,
      status,
      checked_in_at: booking.scheduled_start,
      checked_out_at: null,
    },
    { onConflict: 'booking_id' }
  );
  if (attendanceError) throw attendanceError;

  const { error: bookingError } = await supabase
    .from('bookings')
    .update({ attendance_overdue: false })
    .eq('id', booking.id);
  if (bookingError) throw bookingError;
}

/**
 * §8c: INSERT workout_notes; UPDATE bookings SET status='completed'.
 * `client_id`/`coach_id` are required NOT NULL columns on workout_notes
 * — pulled directly from the booking rather than re-resolved.
 */
export async function submitSessionNotes(
  booking: Booking,
  notes: {
    notes: string;
    exercisesPerformed?: string;
    performanceRating?: string;
    improvements?: string[];
    homework?: string;
    additionalRemarks?: string;
  }
) {
  const { error: notesError } = await supabase.from('workout_notes').insert({
    booking_id: booking.id,
    client_id: booking.client_id,
    coach_id: booking.coach_id,
    notes: notes.notes,
    exercises_performed: notes.exercisesPerformed,
    performance_rating: notes.performanceRating,
    improvements: notes.improvements,
    homework: notes.homework,
    additional_remarks: notes.additionalRemarks,
  });
  if (notesError) throw notesError;

  const { error: bookingError } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', booking.id);
  if (bookingError) throw bookingError;
}

/**
 * Coach's client roster — confirmed there is no direct coach_id on
 * client_profiles; the relationship lives on recurring_slots, same as
 * the client-side getMyCoach() lookup, just reversed.
 */
export async function getCoachClients() {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  const { data: slots, error: slotsError } = await supabase
    .from('recurring_slots')
    .select('client_id')
    .eq('coach_id', coachId)
    .eq('status', 'active');
  if (slotsError) throw slotsError;

  const clientIds = [...new Set((slots ?? []).map((s) => s.client_id))];
  if (clientIds.length === 0) return [];

  const { data, error } = await supabase
    .from('client_profiles')
    .select('id, profile_id, status, profiles(full_name)')
    .in('id', clientIds);
  if (error) throw error;

  return (data ?? []).map((c) => {
    const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
    return { id: c.id, profile_id: c.profile_id, status: c.status, full_name: profile?.full_name } as ClientProfile;
  });
}
