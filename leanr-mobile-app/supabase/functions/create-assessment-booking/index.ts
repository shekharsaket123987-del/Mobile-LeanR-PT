/**
 * Anonymous demo/assessment booking — LEANR_PT_MOBILE_PRD.md §15
 * "Demo/assessment booking" (`createAssessmentBooking()`), README.md
 * "Open items" #5. This is the PUBLIC entry point for a prospect who
 * has no account yet — the authenticated version (an existing client
 * booking their free assessment) lives client-side in
 * `src/lib/data/demo-booking.ts` and needs no privileged backend at all.
 *
 * Why this has to be a privileged (service-role) endpoint rather than a
 * direct anon-key insert: `assessment_sessions` RLS was confirmed live
 * (2026-08-28, via direct introspection of the "LeanR PT" Supabase
 * project) to have exactly two policies —
 * `assessment_sessions_admin_all` (admin full access) and
 * `assessment_sessions_select_assigned_coach` (coach reads their own) —
 * no INSERT policy for the `anon`/unauthenticated role exists at all.
 * That's exactly why the mobile team deferred this feature rather than
 * guess at a schema-risk workaround; this function is that missing
 * privileged path, same pattern as `razorpay`/`zoom-meeting`.
 *
 * No Authorization header is required or read — the caller has no
 * session by definition. Coach-matching mirrors the authenticated path's
 * `findDemoMatch()` (src/lib/data/demo-booking.ts): active coaches
 * ordered by ascending upcoming-booking count (lowest utilization
 * first), first one with an open slot on the requested IST date wins —
 * done server-side here since an anonymous caller has no RLS read
 * access to `coach_availability`/`coach_leave`/`coach_shifts`/`bookings`
 * to do this matching client-side even in an advisory way.
 *
 * Two actions:
 * - "find-slots": { year, month, day, durationMinutes? } -> the best-
 *   matched coach + their open whole-hour slots on that IST date.
 * - "confirm": { prospectName, prospectEmail?, prospectPhone?, coachId,
 *   slotStart, durationMinutes? } -> re-validates the slot is still open
 *   (advisory-but-real: checks both `bookings` and other `assessment_sessions`
 *   for the same coach/window, matching §15's "a stale client view can
 *   never over-book" spirit, though this table has no DB-level exclusion
 *   constraint the way `bookings` does — this is a lead-capture record,
 *   not a payment-gated reservation, so best-effort is the right bar),
 *   then inserts the row and notifies admins for human follow-up
 *   (`admin_alert` template — no dedicated "new lead" template exists in
 *   the 22-key catalog, and inventing a new `notification_templates` row
 *   is a schema change out of scope for this pass).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

type IstDate = { year: number; month: number; day: number };

function istDateKey(d: IstDate) {
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** Weekday (0=Sun..6=Sat) for an IST calendar date — matches Postgres `extract(dow from ...)`. */
function istDayOfWeek(d: IstDate): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

function istHourToUtcInstant(d: IstDate, hour: number): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day, hour, 0, 0) - IST_OFFSET_MS);
}

function addIstDays(d: IstDate, days: number): IstDate {
  const dt = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function isValidIstDate(d: unknown): d is IstDate {
  return (
    typeof d === "object" &&
    d !== null &&
    Number.isInteger((d as IstDate).year) &&
    Number.isInteger((d as IstDate).month) &&
    Number.isInteger((d as IstDate).day)
  );
}

type TimeWindow = { start_time: string; end_time: string };

/** Mirrors `getOpenSlotsForCoachOnDate` (src/lib/data/booking-wizard.ts), plus an assessment_sessions conflict check that file doesn't need. */
async function getOpenSlotsForCoach(
  admin: ReturnType<typeof createClient>,
  coachId: string,
  date: IstDate,
  durationMinutes: number,
  startHour: number,
  endHour: number
): Promise<string[]> {
  const dateKey = istDateKey(date);
  const dayStart = istHourToUtcInstant(date, 0);
  const dayEnd = istHourToUtcInstant(addIstDays(date, 1), 0);

  const [leaveRes, shiftsRes, availabilityRes, bookingsRes, assessmentsRes] = await Promise.all([
    admin
      .from("coach_leave")
      .select("leave_type, partial_start_time, partial_end_time")
      .eq("coach_id", coachId)
      .eq("status", "approved")
      .lte("starts_on", dateKey)
      .gte("ends_on", dateKey),
    admin.from("coach_shifts").select("start_time, end_time").eq("coach_id", coachId).eq("shift_date", dateKey),
    admin
      .from("coach_availability")
      .select("start_time, end_time")
      .eq("coach_id", coachId)
      .eq("day_of_week", istDayOfWeek(date))
      .eq("is_active", true),
    admin
      .from("bookings")
      .select("scheduled_start, duration_minutes")
      .eq("coach_id", coachId)
      .eq("status", "upcoming")
      .gte("scheduled_start", dayStart.toISOString())
      .lt("scheduled_start", dayEnd.toISOString()),
    admin
      .from("assessment_sessions")
      .select("scheduled_start")
      .eq("assigned_coach_id", coachId)
      .eq("status", "scheduled")
      .gte("scheduled_start", dayStart.toISOString())
      .lt("scheduled_start", dayEnd.toISOString()),
  ]);
  for (const res of [leaveRes, shiftsRes, availabilityRes, bookingsRes, assessmentsRes]) {
    if (res.error) throw res.error;
  }

  const leave = leaveRes.data ?? [];
  if (leave.some((l) => l.leave_type === "full_day")) return [];

  const shifts = shiftsRes.data ?? [];
  const windows: TimeWindow[] = shifts.length > 0 ? shifts : availabilityRes.data ?? [];
  if (windows.length === 0) return [];

  const bookings = bookingsRes.data ?? [];
  const assessments = assessmentsRes.data ?? [];
  const slots: string[] = [];

  for (let hour = startHour; hour < endHour; hour++) {
    const slotStartTime = `${pad(hour)}:00:00`;
    const endTotalMinutes = hour * 60 + durationMinutes;
    const slotEndTime = `${pad(Math.floor(endTotalMinutes / 60))}:${pad(endTotalMinutes % 60)}:00`;

    const withinWindow = windows.some((w) => w.start_time <= slotStartTime && w.end_time >= slotEndTime);
    if (!withinWindow) continue;

    const blockedByPartialLeave = leave.some(
      (l) =>
        l.leave_type !== "full_day" &&
        l.partial_start_time &&
        l.partial_end_time &&
        slotStartTime < l.partial_end_time &&
        slotEndTime > l.partial_start_time
    );
    if (blockedByPartialLeave) continue;

    const slotStart = istHourToUtcInstant(date, hour);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);

    const conflicts =
      bookings.some((b) => {
        const bStart = new Date(b.scheduled_start).getTime();
        const bEnd = bStart + b.duration_minutes * 60_000;
        return bStart < slotEnd.getTime() && bEnd > slotStart.getTime();
      }) ||
      assessments.some((a) => {
        const aStart = new Date(a.scheduled_start).getTime();
        const aEnd = aStart + durationMinutes * 60_000;
        return aStart < slotEnd.getTime() && aEnd > slotStart.getTime();
      });
    if (conflicts) continue;

    slots.push(slotStart.toISOString());
  }

  return slots;
}

async function getBookingWindow(admin: ReturnType<typeof createClient>) {
  const { data } = await admin
    .from("system_settings")
    .select("key, value")
    .in("key", ["booking_window_start_hour", "booking_window_end_hour", "assessment_session_duration_minutes"]);
  const byKey = Object.fromEntries((data ?? []).map((r) => [r.key, r.value as number]));
  return {
    startHour: byKey.booking_window_start_hour ?? 5,
    endHour: byKey.booking_window_end_hour ?? 22,
    durationMinutes: byKey.assessment_session_duration_minutes ?? 60,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (action === "find-slots") {
    if (!isValidIstDate(body.date)) return jsonResponse({ error: "A valid { year, month, day } date is required." }, 400);

    const window = await getBookingWindow(admin);
    const durationMinutes = Number(body.durationMinutes) || window.durationMinutes;

    const { data: coaches, error: coachError } = await admin
      .from("coach_profiles")
      .select("id, status, profiles(full_name)")
      .eq("status", "active");
    if (coachError) return jsonResponse({ error: coachError.message }, 500);

    const { data: upcomingBookings, error: bookingError } = await admin.from("bookings").select("coach_id").eq("status", "upcoming");
    if (bookingError) return jsonResponse({ error: bookingError.message }, 500);

    const utilization = new Map<string, number>();
    for (const b of upcomingBookings ?? []) {
      utilization.set(b.coach_id as string, (utilization.get(b.coach_id as string) ?? 0) + 1);
    }

    const ranked = (coaches ?? [])
      .map((c) => {
        const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
        return {
          id: c.id as string,
          fullName: (profile as { full_name?: string } | null)?.full_name ?? "Coach",
          utilization: utilization.get(c.id as string) ?? 0,
        };
      })
      .sort((a, b) => a.utilization - b.utilization);

    for (const coach of ranked) {
      const slots = await getOpenSlotsForCoach(admin, coach.id, body.date, durationMinutes, window.startHour, window.endHour);
      if (slots.length > 0) {
        return jsonResponse({ coachId: coach.id, coachName: coach.fullName, slots, durationMinutes });
      }
    }
    return jsonResponse({ coachId: null, coachName: null, slots: [], durationMinutes });
  }

  if (action === "confirm") {
    const prospectName = typeof body.prospectName === "string" ? body.prospectName.trim() : "";
    const prospectEmail = typeof body.prospectEmail === "string" ? body.prospectEmail.trim() : null;
    const prospectPhone = typeof body.prospectPhone === "string" ? body.prospectPhone.trim() : null;
    const coachId = body.coachId as string | undefined;
    const slotStart = body.slotStart as string | undefined;

    if (!prospectName) return jsonResponse({ error: "Your name is required." }, 400);
    if (!prospectEmail && !prospectPhone) return jsonResponse({ error: "An email or phone number is required so we can reach you." }, 400);
    if (!coachId || !slotStart || Number.isNaN(new Date(slotStart).getTime())) {
      return jsonResponse({ error: "coachId and a valid slotStart are required." }, 400);
    }

    const window = await getBookingWindow(admin);
    const durationMinutes = Number(body.durationMinutes) || window.durationMinutes;
    const slotStartDate = new Date(slotStart);
    const istInstant = new Date(slotStartDate.getTime() + IST_OFFSET_MS);
    const istDate: IstDate = { year: istInstant.getUTCFullYear(), month: istInstant.getUTCMonth() + 1, day: istInstant.getUTCDate() };

    // Re-validate server-side right before inserting — the slot list handed
    // back by "find-slots" is advisory (§15), same as every other booking
    // surface in this app; a stale client view must never produce a false
    // "confirmed" for a slot someone else took in the meantime.
    const stillOpenSlots = await getOpenSlotsForCoach(admin, coachId, istDate, durationMinutes, window.startHour, window.endHour);
    if (!stillOpenSlots.includes(slotStartDate.toISOString())) {
      return jsonResponse({ error: "That slot is no longer available — please pick another." }, 409);
    }

    const { data: coachProfile, error: coachError } = await admin
      .from("coach_profiles")
      .select("id, profiles(full_name)")
      .eq("id", coachId)
      .single();
    if (coachError || !coachProfile) return jsonResponse({ error: "Coach not found." }, 404);
    const coachProfileRel = Array.isArray(coachProfile.profiles) ? coachProfile.profiles[0] : coachProfile.profiles;
    const coachName = (coachProfileRel as { full_name?: string } | null)?.full_name ?? "your coach";

    const { data: assessment, error: insertError } = await admin
      .from("assessment_sessions")
      .insert({
        prospect_name: prospectName,
        prospect_email: prospectEmail,
        prospect_phone: prospectPhone,
        assigned_coach_id: coachId,
        scheduled_start: slotStartDate.toISOString(),
        status: "scheduled",
      })
      .select("id, scheduled_start")
      .single();
    if (insertError) return jsonResponse({ error: insertError.message }, 500);

    // Best-effort admin notification — a failure here must never fail the
    // booking itself, matching §13 rule 20's "best-effort side effect" spirit.
    try {
      const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
      const alertMessage = `New free demo booked by ${prospectName} (${prospectEmail ?? prospectPhone}) with ${coachName} at ${slotStartDate.toISOString()}.`;
      const rows = (admins ?? []).map((a) => ({
        user_id: a.id,
        template_key: "admin_alert",
        type: "system",
        title: "Admin alert",
        message: alertMessage,
        related_entity_type: "assessment_session",
        related_entity_id: assessment.id,
      }));
      if (rows.length > 0) await admin.from("notifications").insert(rows);
    } catch (err) {
      console.error("[create-assessment-booking] admin notification failed (non-fatal)", err);
    }

    return jsonResponse({ id: assessment.id, coachName, scheduledStart: assessment.scheduled_start });
  }

  return jsonResponse({ error: "Unknown action." }, 400);
});
