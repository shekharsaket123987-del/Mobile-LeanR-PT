/**
 * Session reminders (~1h before start) + no-show warnings — invoked every
 * 5 minutes by pg_cron via net.http_post (see the
 * session_reminders_and_no_show_warnings migration), same pattern as
 * send-push's insert trigger. verify_jwt:false because the caller is
 * Postgres itself, not a logged-in app user (same reasoning as send-push).
 *
 * Three passes per run, each independently fail-soft (one broken row never
 * blocks the others):
 * 1. Reminder — client + coach, ~session_reminder_lead_minutes before start.
 * 2. Coach no-show — coach_joined_at still null no_show_grace_minutes past start.
 * 3. Client no-show/late — client_joined_at still null no_show_grace_minutes past start.
 *
 * Sends both an in-app+push notification (via the existing `notifications`
 * table + its send-push trigger) and an email (Resend). SMS was
 * deliberately left out for now — MSG91's transactional/DLT approval status
 * for this account is unconfirmed (it's only wired for OTP today, see
 * phone-otp/index.ts's header), so this doesn't fire SMS sends that would
 * likely just fail or get blocked.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("REMINDER_EMAIL_FROM") ?? "onboarding@resend.dev";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function getSettingInt(admin: any, key: string, fallback: number): Promise<number> {
  const { data } = await admin.from("system_settings").select("value").eq("key", key).maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) ? n : fallback;
}

function formatSessionTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// deno-lint-ignore no-explicit-any
async function sendEmail(admin: any, toProfileId: string, subject: string, body: string): Promise<void> {
  if (!RESEND_API_KEY) return; // not configured -- push/in-app notification still goes out regardless
  try {
    const { data, error } = await admin.auth.admin.getUserById(toProfileId);
    if (error || !data?.user?.email) return;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [data.user.email],
        subject,
        html: `<p>${body}</p>`,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[session-reminders] Resend rejected send to ${data.user.email}: ${res.status} ${errBody}`);
    }
  } catch (err) {
    console.error("[session-reminders] email send failed:", err);
  }
}

// deno-lint-ignore no-explicit-any
async function notify(admin: any, profileId: string, type: string, title: string, message: string, templateKey: string): Promise<void> {
  try {
    await admin.from("notifications").insert({ user_id: profileId, type, title, message, template_key: templateKey });
  } catch (err) {
    console.error("[session-reminders] notification insert failed:", err);
  }
}

type ProfileEmbed = { full_name: string | null } | { full_name: string | null }[] | null;
type BookingRow = {
  id: string;
  scheduled_start: string;
  client_profiles: { profile_id: string; profiles: ProfileEmbed } | null;
  coach_profiles: { profile_id: string; profiles: ProfileEmbed } | null;
};

function flatten(row: BookingRow) {
  const cp = row.client_profiles;
  const cop = row.coach_profiles;
  const clientProfile = cp?.profiles ? (Array.isArray(cp.profiles) ? cp.profiles[0] : cp.profiles) : null;
  const coachProfile = cop?.profiles ? (Array.isArray(cop.profiles) ? cop.profiles[0] : cop.profiles) : null;
  return {
    id: row.id,
    scheduledStart: row.scheduled_start,
    clientProfileId: cp?.profile_id ?? null,
    clientName: clientProfile?.full_name ?? "the client",
    coachProfileId: cop?.profile_id ?? null,
    coachName: coachProfile?.full_name ?? "your coach",
  };
}

const BOOKING_SELECT = "id, scheduled_start, client_profiles(profile_id, profiles(full_name)), coach_profiles(profile_id, profiles(full_name))";

// deno-lint-ignore no-explicit-any
async function sendReminders(admin: any, leadMinutes: number): Promise<number> {
  const now = Date.now();
  const windowStart = new Date(now + (leadMinutes - 5) * 60_000).toISOString();
  const windowEnd = new Date(now + (leadMinutes + 5) * 60_000).toISOString();

  const { data, error } = await admin
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("status", "upcoming")
    .is("reminder_1h_sent_at", null)
    .gte("scheduled_start", windowStart)
    .lt("scheduled_start", windowEnd);
  if (error) throw error;

  let sent = 0;
  for (const row of (data ?? []) as BookingRow[]) {
    const b = flatten(row);
    const sessionTime = formatSessionTime(b.scheduledStart);
    try {
      if (b.clientProfileId) {
        const msg = `Your session with ${b.coachName} starts at ${sessionTime} (in about 1 hour). Don't forget to join!`;
        await notify(admin, b.clientProfileId, "reminder", "Session starting soon", msg, "session_reminder_1h_client");
        await sendEmail(admin, b.clientProfileId, "Your session starts in about 1 hour", msg);
      }
      if (b.coachProfileId) {
        const msg = `Your session with ${b.clientName} starts at ${sessionTime} (in about 1 hour).`;
        await notify(admin, b.coachProfileId, "reminder", "Session starting soon", msg, "session_reminder_1h_coach");
        await sendEmail(admin, b.coachProfileId, "Your session starts in about 1 hour", msg);
      }
      await admin.from("bookings").update({ reminder_1h_sent_at: new Date().toISOString() }).eq("id", b.id);
      sent++;
    } catch (err) {
      console.error(`[session-reminders] reminder failed for booking ${b.id}:`, err);
    }
  }
  return sent;
}

// deno-lint-ignore no-explicit-any
async function sendCoachNoShowWarnings(admin: any, graceMinutes: number): Promise<number> {
  const now = Date.now();
  // Only recent misses -- scheduled_start already past the grace period, but
  // not so old that the app's own mark_missed_bookings sweep has likely
  // already moved this booking off 'upcoming' entirely.
  const deadline = new Date(now - graceMinutes * 60_000).toISOString();
  const notTooOld = new Date(now - 6 * 60 * 60_000).toISOString();

  const { data, error } = await admin
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("status", "upcoming")
    .is("coach_joined_at", null)
    .is("coach_no_show_warned_at", null)
    .lt("scheduled_start", deadline)
    .gt("scheduled_start", notTooOld);
  if (error) throw error;

  let sent = 0;
  for (const row of (data ?? []) as BookingRow[]) {
    const b = flatten(row);
    if (!b.coachProfileId) continue;
    const sessionTime = formatSessionTime(b.scheduledStart);
    try {
      const message = `You missed your session with ${b.clientName} scheduled for ${sessionTime}. Please join on time for upcoming sessions.`;
      await notify(admin, b.coachProfileId, "system", "Session missed", message, "coach_no_show_warning");
      await sendEmail(admin, b.coachProfileId, "You missed a session", message);
      await admin.from("bookings").update({ coach_no_show_warned_at: new Date().toISOString() }).eq("id", b.id);
      sent++;
    } catch (err) {
      console.error(`[session-reminders] coach no-show warning failed for booking ${b.id}:`, err);
    }
  }
  return sent;
}

// deno-lint-ignore no-explicit-any
async function sendClientNoShowWarnings(admin: any, graceMinutes: number): Promise<number> {
  const now = Date.now();
  const deadline = new Date(now - graceMinutes * 60_000).toISOString();
  const notTooOld = new Date(now - 6 * 60 * 60_000).toISOString();

  const { data, error } = await admin
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("status", "upcoming")
    .is("client_joined_at", null)
    .is("client_no_show_warned_at", null)
    .lt("scheduled_start", deadline)
    .gt("scheduled_start", notTooOld);
  if (error) throw error;

  let sent = 0;
  for (const row of (data ?? []) as BookingRow[]) {
    const b = flatten(row);
    if (!b.clientProfileId) continue;
    const sessionTime = formatSessionTime(b.scheduledStart);
    try {
      const message = `Missing sessions can set back your progress. You didn't join your session with ${b.coachName} on ${sessionTime} — let's get back on track for the next one!`;
      await notify(admin, b.clientProfileId, "system", "You missed your session", message, "client_no_show_warning");
      await sendEmail(admin, b.clientProfileId, "You missed your session", message);
      await admin.from("bookings").update({ client_no_show_warned_at: new Date().toISOString() }).eq("id", b.id);
      sent++;
    } catch (err) {
      console.error(`[session-reminders] client no-show warning failed for booking ${b.id}:`, err);
    }
  }
  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const [leadMinutes, graceMinutes] = await Promise.all([
    getSettingInt(admin, "session_reminder_lead_minutes", 60),
    getSettingInt(admin, "no_show_grace_minutes", 10),
  ]);

  const results = { reminders: 0, coachNoShowWarnings: 0, clientNoShowWarnings: 0, errors: [] as string[] };

  try {
    results.reminders = await sendReminders(admin, leadMinutes);
  } catch (err) {
    results.errors.push(`reminders: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    results.coachNoShowWarnings = await sendCoachNoShowWarnings(admin, graceMinutes);
  } catch (err) {
    results.errors.push(`coachNoShowWarnings: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    results.clientNoShowWarnings = await sendClientNoShowWarnings(admin, graceMinutes);
  } catch (err) {
    results.errors.push(`clientNoShowWarnings: ${err instanceof Error ? err.message : String(err)}`);
  }

  return jsonResponse(results);
});
