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

/** `past` = Schedule screen's "Past" tab: completed/missed/cancelled, most recent first. */
export async function getCoachBookings(range: 'today' | 'upcoming' | 'past' = 'upcoming') {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  if (range === 'past') {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('coach_id', coachId)
      .in('status', ['completed', 'missed', 'cancelled'])
      .order('scheduled_start', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Booking[];
  }

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

/**
 * Pending Tasks — New PRD.md §4.B "any-day `upcoming` bookings already
 * past their time (owed attendance/notes)". `markAttendance` (present/
 * late) never flips `bookings.status` off 'upcoming' — only
 * `submitSessionNotes` does (status='completed') — so "status='upcoming'
 * AND past its end time" already covers both "nothing marked yet" and
 * "present/late marked, notes still owed" in one query.
 */
export async function getCoachPendingTasks() {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('coach_id', coachId)
    .eq('status', 'upcoming')
    .lt('scheduled_start', new Date().toISOString()) // cheap pre-filter; exact end-time cutoff applied below
    .order('scheduled_start', { ascending: true });
  if (error) throw error;

  const now = Date.now();
  return ((data ?? []) as Booking[]).filter((b) => now >= new Date(b.scheduled_start).getTime() + b.duration_minutes * 60_000);
}

function startOfWeek(d: Date) {
  const day = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Dashboard "This Week" KPI — any-status bookings scheduled Mon-Sun of the current week. */
export async function getCoachSessionsThisWeekCount() {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return 0;

  const start = startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .gte('scheduled_start', start.toISOString())
    .lt('scheduled_start', end.toISOString());
  if (error) throw error;
  return count ?? 0;
}

/** Dashboard "Upcoming (Next 3 Days, read-only)" widget. */
export async function getCoachUpcomingNext3Days() {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 3);
  end.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('coach_id', coachId)
    .eq('status', 'upcoming')
    .gte('scheduled_start', start.toISOString())
    .lte('scheduled_start', end.toISOString())
    .order('scheduled_start', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Booking[];
}

/** Dashboard "Cancelled Sessions (capped 5)" widget. */
export async function getCoachCancelledSessions() {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('coach_id', coachId)
    .eq('status', 'cancelled')
    .order('scheduled_start', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as Booking[];
}

/**
 * Dashboard "Rescheduled Sessions (capped 5)" widget — New PRD.md §19
 * documents that `reschedule_booking()` (migration 0041) silently stopped
 * writing `was_rescheduled`/`original_scheduled_start`, so this section
 * legitimately renders empty for any reschedule performed since — a real,
 * inherited web bug, not something to silently "fix" on mobile only.
 */
export async function getCoachRescheduledSessions() {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('coach_id', coachId)
    .eq('was_rescheduled', true)
    .order('scheduled_start', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as Booking[];
}

/**
 * Attendance lookup for a batch of bookings — Task Row (Dashboard/Pending
 * Tasks/Schedule Day view, New PRD.md §4.B) needs to tell "not yet marked"
 * apart from "present/late marked, notes still owed", and `bookings.status`
 * alone can't (see `getCoachPendingTasks` header) — this fills that gap.
 */
export async function getAttendanceMap(bookingIds: string[]): Promise<Record<string, 'present' | 'late' | 'absent'>> {
  if (bookingIds.length === 0) return {};
  const { data, error } = await supabase.from('attendance').select('booking_id, status').in('booking_id', bookingIds);
  if (error) throw error;
  const map: Record<string, 'present' | 'late' | 'absent'> = {};
  for (const row of data ?? []) map[row.booking_id] = row.status as 'present' | 'late' | 'absent';
  return map;
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
 * Session Detail's "up to 3 previous session notes" — New PRD.md §4.B
 * `getCoachSessionDetailAction` data list. Scoped to this coach's own
 * completed sessions with the same client (never another coach's notes).
 */
export async function getPreviousSessionNotes(clientId: string, excludeBookingId: string, limit = 3) {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, scheduled_start')
    .eq('client_id', clientId)
    .eq('coach_id', coachId)
    .eq('status', 'completed')
    .neq('id', excludeBookingId)
    .order('scheduled_start', { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!bookings || bookings.length === 0) return [];

  const { data: notes, error: notesError } = await supabase
    .from('workout_notes')
    .select('booking_id, notes, exercises_performed, performance_rating, homework')
    .in(
      'booking_id',
      bookings.map((b) => b.id)
    );
  if (notesError) throw notesError;

  const byBookingId = new Map((notes ?? []).map((n) => [n.booking_id, n]));
  return bookings
    .map((b) => ({ scheduledStart: b.scheduled_start, ...byBookingId.get(b.id) }))
    .filter((n): n is typeof n & { notes: string } => Boolean(n.notes));
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
    .select('id, profile_id, status, client_code, profiles(full_name, photo_url)')
    .in('id', clientIds);
  if (error) throw error;

  return (data ?? []).map((c) => {
    const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
    return {
      id: c.id,
      profile_id: c.profile_id,
      status: c.status,
      client_code: c.client_code,
      full_name: profile?.full_name,
      photo_url: profile?.photo_url,
    } as ClientProfile;
  });
}
