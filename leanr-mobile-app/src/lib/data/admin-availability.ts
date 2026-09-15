/**
 * Admin Availability Check — New PRD.md §4.C "Screen: Availability
 * Check" — cross-coach, single-day view; date navigator (server-side
 * re-fetch, defaults today IST); Booked/Free client-side filter pills;
 * free slots show a `freeReason` (e.g. prior cancellation).
 *
 * Grid basis matches web's `getAvailabilityCheck()` (scheduling.service.ts)
 * exactly: one shared hourly grid built from the admin-configured
 * `booking_window_start_hour`/`booking_window_end_hour` (via the same
 * `getBookingSettings()` booking-wizard.ts already uses for the client
 * booking flow), not a per-coach 45-minute walk. A synthetic (grid-only)
 * slot is filtered by the coach's own working-hours window and leave;
 * a REAL booking's own time is ground truth and always shows regardless
 * of whether it lands on the grid or the coach is later marked on leave —
 * the grid is widened with any actual booking/cancellation time per coach,
 * exactly mirroring web's `candidateTimes` construction. `coach_shifts`
 * (date-specific override) is deliberately NOT consulted here — web's
 * `getAvailabilityCheck()` doesn't use it either for this screen.
 */
import { supabase } from '@/lib/supabase/client';

import { getBookingSettings } from './booking-wizard';

export type AvailabilitySlot = {
  coachId: string;
  coachName: string;
  time: string; // HH:MM
  booked: boolean;
  clientName: string | null;
  freeReason: string | null;
};

function dayAfter(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function hourlyGrid(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) slots.push(`${String(h).padStart(2, '0')}:00`);
  return slots;
}

export async function getAvailabilityForDate(date: string): Promise<AvailabilitySlot[]> {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const { bookingWindowStartHour, bookingWindowEndHour } = await getBookingSettings();
  const grid = hourlyGrid(bookingWindowStartHour, bookingWindowEndHour);

  const [coachesRes, availabilityRes, leaveRes, bookingsRes, cancelledRes] = await Promise.all([
    supabase.from('coach_profiles').select('id, profiles(full_name)').eq('status', 'active'),
    supabase.from('coach_availability').select('coach_id, start_time, end_time').eq('day_of_week', dayOfWeek).eq('is_active', true),
    supabase
      .from('coach_leave')
      .select('coach_id, leave_type, partial_start_time, partial_end_time')
      .eq('status', 'approved')
      .lte('starts_on', date)
      .gte('ends_on', date),
    supabase
      .from('bookings')
      .select('coach_id, scheduled_start, client_profiles(profiles(full_name))')
      // Web's getAvailabilityCheck() treats any non-cancelled booking as occupying
      // the slot (.neq('status','cancelled')) — this also correctly counts 'missed'.
      .neq('status', 'cancelled')
      .gte('scheduled_start', `${date}T00:00:00+05:30`)
      .lt('scheduled_start', `${dayAfter(date)}T00:00:00+05:30`),
    supabase
      .from('bookings')
      .select('coach_id, scheduled_start, cancel_reason, canceller:profiles!cancelled_by(full_name)')
      .eq('status', 'cancelled')
      .gte('scheduled_start', `${date}T00:00:00+05:30`)
      .lt('scheduled_start', `${dayAfter(date)}T00:00:00+05:30`),
  ]);
  for (const res of [coachesRes, availabilityRes, leaveRes, bookingsRes, cancelledRes]) {
    if (res.error) throw res.error;
  }

  const availByCoach = new Map<string, { start_time: string; end_time: string }[]>();
  for (const a of availabilityRes.data ?? []) {
    const list = availByCoach.get(a.coach_id) ?? [];
    list.push(a);
    availByCoach.set(a.coach_id, list);
  }

  const fullDayLeaveCoaches = new Set((leaveRes.data ?? []).filter((l) => l.leave_type !== 'partial').map((l) => l.coach_id));
  const partialLeaveByCoach = new Map<string, { startMin: number; endMin: number }[]>();
  for (const l of leaveRes.data ?? []) {
    if (l.leave_type !== 'partial' || !l.partial_start_time || !l.partial_end_time) continue;
    const [psH, psM] = l.partial_start_time.split(':').map(Number);
    const [peH, peM] = l.partial_end_time.split(':').map(Number);
    const list = partialLeaveByCoach.get(l.coach_id) ?? [];
    list.push({ startMin: psH * 60 + psM, endMin: peH * 60 + peM });
    partialLeaveByCoach.set(l.coach_id, list);
  }

  const keyOf = (coachId: string, time: string) => `${coachId}|${time}`;
  const bookingByKey = new Map<string, string>(); // key -> clientName
  const actualTimesByCoach = new Map<string, Set<string>>();
  const addActualTime = (coachId: string, time: string) => {
    const set = actualTimesByCoach.get(coachId) ?? new Set<string>();
    set.add(time);
    actualTimesByCoach.set(coachId, set);
  };
  for (const b of bookingsRes.data ?? []) {
    const cp = Array.isArray(b.client_profiles) ? b.client_profiles[0] : b.client_profiles;
    const p = cp ? (Array.isArray(cp.profiles) ? cp.profiles[0] : cp.profiles) : null;
    const time = new Date(b.scheduled_start).toISOString().slice(11, 16);
    bookingByKey.set(keyOf(b.coach_id, time), p?.full_name ?? 'Client');
    addActualTime(b.coach_id, time);
  }
  // Text mirrors web's getAvailabilityCheck() freeReason format exactly.
  const cancelReasonByKey = new Map<string, string>();
  for (const b of cancelledRes.data ?? []) {
    const canceller = Array.isArray(b.canceller) ? b.canceller[0] : b.canceller;
    const time = new Date(b.scheduled_start).toISOString().slice(11, 16);
    const reason = `Cancelled by ${canceller?.full_name ?? 'someone'}${b.cancel_reason ? ` — "${b.cancel_reason}"` : ''}`;
    cancelReasonByKey.set(keyOf(b.coach_id, time), reason);
    addActualTime(b.coach_id, time);
  }

  const fitsWithinWindow = (h: number, m: number, windows: { start_time: string; end_time: string }[]) =>
    windows.some((w) => {
      const [wsH, wsM] = w.start_time.split(':').map(Number);
      const [weH, weM] = w.end_time.split(':').map(Number);
      return h * 60 + m >= wsH * 60 + wsM && h * 60 + m < weH * 60 + weM;
    });

  const slots: AvailabilitySlot[] = [];
  for (const coach of coachesRes.data ?? []) {
    const profile = Array.isArray(coach.profiles) ? coach.profiles[0] : coach.profiles;
    const coachName = profile?.full_name ?? 'Coach';
    const windows = availByCoach.get(coach.id) ?? [];
    const onFullDayLeave = fullDayLeaveCoaches.has(coach.id);
    const partialWindows = partialLeaveByCoach.get(coach.id) ?? [];
    const actualTimes = actualTimesByCoach.get(coach.id) ?? new Set<string>();

    // Widen the shared hourly grid with any actual booking/cancellation time
    // for this coach — a real booking is ground truth and must show even if
    // its time doesn't land on the standard grid (older/manual data).
    const candidateTimes = new Set<string>(grid);
    for (const t of actualTimes) candidateTimes.add(t);

    for (const time of Array.from(candidateTimes).sort()) {
      const [h, m] = time.split(':').map(Number);
      const isRealSlot = actualTimes.has(time);

      if (!isRealSlot) {
        if (!fitsWithinWindow(h, m, windows)) continue;
        const slotStartMin = h * 60 + m;
        const overlapsPartialLeave = partialWindows.some((w) => slotStartMin < w.endMin && slotStartMin >= w.startMin);
        if (onFullDayLeave || overlapsPartialLeave) continue; // excluded, not "free"
      }

      const key = keyOf(coach.id, time);
      const bookedClientName = bookingByKey.get(key);
      slots.push({
        coachId: coach.id,
        coachName,
        time,
        booked: Boolean(bookedClientName),
        clientName: bookedClientName ?? null,
        freeReason: !bookedClientName ? (cancelReasonByKey.get(key) ?? null) : null,
      });
    }
  }

  return slots.sort((a, b) => (a.time === b.time ? a.coachName.localeCompare(b.coachName) : a.time.localeCompare(b.time)));
}
