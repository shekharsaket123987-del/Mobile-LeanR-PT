/**
 * Coach-side reads/writes — LEANR_PT_MOBILE_PRD.md §5 (Coach Portal),
 * §8b (mark present), §8c (submit notes), §8d (mark absent).
 *
 * markAttendance/submitSessionNotes are wired with real confidence,
 * unlike the client-side booking wizard: the functional PRD gives the
 * exact table/column names for these operations (not just prose), e.g.
 * §8b: "UPSERT attendance(status='present', checked_in_at=scheduled_start,
 * checked_out_at=null); UPDATE bookings SET attendance_overdue=false".
 * The one guess here is the FK column name on `attendance` linking back
 * to the booking (`booking_id`) — standard Postgres convention, VERIFY
 * only that one column name before shipping.
 */
import { supabase } from '@/lib/supabase/client';
import type { Booking, ClientProfile } from './types';

export async function getCoachBookings(range: 'today' | 'upcoming' = 'upcoming') {
  const { data: userData } = await supabase.auth.getUser();
  const coachId = userData.user?.id;
  if (!coachId) return [];

  let query = supabase
    .from('bookings')
    .select('*')
    .eq('coach_id', coachId) // VERIFY column name, same guess used client-side
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
 * Sets bookings.coach_joined_at — original PRD §7g: "Join" → "Zoom opens +
 * coach_joined_at set". This phase has no real Zoom integration (Phase 5
 * per the roadmap), so "Join" here just records the timestamp used by
 * the Present/Late gating rule below — VERIFY the column name.
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

export async function getCoachClients() {
  const { data: userData } = await supabase.auth.getUser();
  const coachId = userData.user?.id;
  if (!coachId) return [];

  const { data, error } = await supabase
    .from('client_profiles')
    .select('*')
    .eq('coach_id', coachId); // VERIFY — same coach-assignment column used in src/lib/data/coach.ts
  if (error) throw error;
  return (data ?? []) as ClientProfile[];
}

/**
 * §8b/§8d: UPSERT attendance(status, checked_in_at, checked_out_at) keyed
 * by booking_id, plus the matching bookings-table side effect for each
 * status the PRD documents.
 */
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

  // present | late
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
 * Field names (summary, exercisesPerformed, performance, improvements,
 * homework, additionalRemarks) are as listed in the PRD's prose — mapped
 * to snake_case here per Postgres convention; VERIFY against the real
 * schema if this insert fails.
 */
export async function submitSessionNotes(
  bookingId: string,
  notes: {
    summary: string;
    exercisesPerformed?: string;
    performance?: string;
    improvements?: string[];
    homework?: string;
    additionalRemarks?: string;
  }
) {
  const { error: notesError } = await supabase.from('workout_notes').insert({
    booking_id: bookingId, // VERIFY FK column name
    summary: notes.summary,
    exercises_performed: notes.exercisesPerformed,
    performance: notes.performance,
    improvements: notes.improvements,
    homework: notes.homework,
    additional_remarks: notes.additionalRemarks,
  });
  if (notesError) throw notesError;

  const { error: bookingError } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', bookingId);
  if (bookingError) throw bookingError;
}
