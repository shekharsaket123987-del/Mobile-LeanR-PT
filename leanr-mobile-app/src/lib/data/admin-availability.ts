/**
 * Admin Availability Check — New PRD.md §4.C "Screen: Availability
 * Check" — cross-coach, single-day view; date navigator (server-side
 * re-fetch, defaults today IST); Booked/Free client-side filter pills;
 * free slots show a `freeReason` (e.g. prior cancellation).
 *
 * `coach_shifts` (date-specific override) takes priority over
 * `coach_availability` (weekly template) for that date — same priority
 * order `is_slot_within_working_hours` uses (New PRD.md §7.2).
 */
import { supabase } from '@/lib/supabase/client';

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

export async function getAvailabilityForDate(date: string, slotMinutes = 45): Promise<AvailabilitySlot[]> {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();

  const [coachesRes, availabilityRes, shiftsRes, leaveRes, bookingsRes, cancelledRes] = await Promise.all([
    supabase.from('coach_profiles').select('id, profiles(full_name)').eq('status', 'active'),
    supabase.from('coach_availability').select('coach_id, start_time, end_time').eq('day_of_week', dayOfWeek).eq('is_active', true),
    supabase.from('coach_shifts').select('coach_id, start_time, end_time').eq('shift_date', date),
    supabase.from('coach_leave').select('coach_id, leave_type, partial_start_time, partial_end_time').eq('status', 'approved').lte('starts_on', date).gte('ends_on', date),
    supabase
      .from('bookings')
      .select('coach_id, scheduled_start, client_profiles(profiles(full_name))')
      .in('status', ['upcoming', 'completed'])
      .gte('scheduled_start', `${date}T00:00:00+05:30`)
      .lt('scheduled_start', `${dayAfter(date)}T00:00:00+05:30`),
    supabase
      .from('bookings')
      .select('coach_id, scheduled_start')
      .eq('status', 'cancelled')
      .gte('scheduled_start', `${date}T00:00:00+05:30`)
      .lt('scheduled_start', `${dayAfter(date)}T00:00:00+05:30`),
  ]);
  for (const res of [coachesRes, availabilityRes, shiftsRes, leaveRes, bookingsRes, cancelledRes]) {
    if (res.error) throw res.error;
  }

  const shiftsByCoach = new Map<string, { start_time: string; end_time: string }>();
  for (const s of shiftsRes.data ?? []) shiftsByCoach.set(s.coach_id, s);
  const availabilityByCoach = new Map<string, { start_time: string; end_time: string }>();
  for (const a of availabilityRes.data ?? []) availabilityByCoach.set(a.coach_id, a);
  const fullDayLeaveCoaches = new Set((leaveRes.data ?? []).filter((l) => l.leave_type === 'full_day').map((l) => l.coach_id));
  const partialLeaveByCoach = new Map((leaveRes.data ?? []).filter((l) => l.leave_type === 'partial').map((l) => [l.coach_id, l]));

  const bookedByCoachTime = new Map<string, string>();
  for (const b of bookingsRes.data ?? []) {
    const cp = Array.isArray(b.client_profiles) ? b.client_profiles[0] : b.client_profiles;
    const p = cp ? (Array.isArray(cp.profiles) ? cp.profiles[0] : cp.profiles) : null;
    const time = new Date(b.scheduled_start).toISOString().slice(11, 16);
    bookedByCoachTime.set(`${b.coach_id}|${time}`, p?.full_name ?? 'Client');
  }
  const cancelledTimes = new Set((cancelledRes.data ?? []).map((b) => `${b.coach_id}|${new Date(b.scheduled_start).toISOString().slice(11, 16)}`));

  const slots: AvailabilitySlot[] = [];
  for (const coach of coachesRes.data ?? []) {
    if (fullDayLeaveCoaches.has(coach.id)) continue;
    const profile = Array.isArray(coach.profiles) ? coach.profiles[0] : coach.profiles;
    const coachName = profile?.full_name ?? 'Coach';

    const window = shiftsByCoach.get(coach.id) ?? availabilityByCoach.get(coach.id);
    if (!window) continue;
    const partialLeave = partialLeaveByCoach.get(coach.id);

    const [sh, sm] = window.start_time.split(':').map(Number);
    const [eh, em] = window.end_time.split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;

    for (let m = startMinutes; m + slotMinutes <= endMinutes; m += slotMinutes) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      const time = `${hh}:${mm}`;

      if (partialLeave?.partial_start_time && partialLeave?.partial_end_time) {
        const leaveStart = partialLeave.partial_start_time.slice(0, 5);
        const leaveEnd = partialLeave.partial_end_time.slice(0, 5);
        if (time >= leaveStart && time < leaveEnd) continue;
      }

      const key = `${coach.id}|${time}`;
      const bookedClient = bookedByCoachTime.get(key);
      slots.push({
        coachId: coach.id,
        coachName,
        time,
        booked: Boolean(bookedClient),
        clientName: bookedClient ?? null,
        freeReason: !bookedClient && cancelledTimes.has(key) ? 'Prior cancellation' : null,
      });
    }
  }

  return slots.sort((a, b) => (a.time === b.time ? a.coachName.localeCompare(b.coachName) : a.time.localeCompare(b.time)));
}
