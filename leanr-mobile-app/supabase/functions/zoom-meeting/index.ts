/**
 * Zoom meeting creation — LEANR_PT_MOBILE_PRD.md §7f (`ensureZoomMeetingForBooking()`),
 * §13 rule 20 ("lazily created... only when someone needs to join"). The
 * mobile app's zoom.ts always said this needed Zoom Server-to-Server
 * OAuth credentials the mobile repo shouldn't hold — this is that
 * server-side piece.
 *
 * Needs three secrets before this actually works —
 * `supabase secrets set ZOOM_ACCOUNT_ID=... ZOOM_CLIENT_ID=... ZOOM_CLIENT_SECRET=...`
 * (from a Zoom Server-to-Server OAuth app in the Zoom App Marketplace).
 * Until then this returns a clear 503.
 *
 * Unlike payments, this does NOT need the service-role key: a booking's
 * `zoom_join_url`/`zoom_start_url`/`zoom_meeting_id` are updated using the
 * caller's own forwarded JWT, relying on the real `bookings_update_own_client`/
 * `bookings_update_own_coach` RLS policies — the only thing that has to
 * stay server-side here is the Zoom API secret itself.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ZOOM_ACCOUNT_ID = Deno.env.get("ZOOM_ACCOUNT_ID");
const ZOOM_CLIENT_ID = Deno.env.get("ZOOM_CLIENT_ID");
const ZOOM_CLIENT_SECRET = Deno.env.get("ZOOM_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function getZoomAccessToken(): Promise<string> {
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`)}` },
  });
  if (!res.ok) throw new Error(`Zoom OAuth failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

function pickFullName(rel: unknown): string | null {
  const row = Array.isArray(rel) ? rel[0] : rel;
  if (!row) return null;
  const profiles = (row as { profiles?: unknown }).profiles;
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  return (profile as { full_name?: string } | null)?.full_name ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    return jsonResponse(
      { error: "Zoom isn't configured on the server yet — ZOOM_ACCOUNT_ID/ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET secrets are missing." },
      503
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Not authenticated." }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "Not authenticated." }, 401);

  const body = await req.json().catch(() => ({}));
  const bookingId = body.bookingId as string | undefined;
  if (!bookingId) return jsonResponse({ error: "bookingId is required." }, 400);

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, client_id, coach_id, scheduled_start, duration_minutes, status, zoom_join_url, client_profiles(profiles(full_name))"
    )
    .eq("id", bookingId)
    .single();
  if (bookingError || !booking) return jsonResponse({ error: "Booking not found." }, 404);

  // RLS's `bookings_select_authenticated` is broad (any authenticated user
  // can SELECT any booking), so ownership is re-checked explicitly here —
  // this function must not create a real meeting for a booking the caller
  // isn't actually part of.
  const [{ data: clientProfile }, { data: coachProfile }] = await Promise.all([
    supabase.from("client_profiles").select("id").eq("profile_id", userData.user.id).maybeSingle(),
    supabase.from("coach_profiles").select("id").eq("profile_id", userData.user.id).maybeSingle(),
  ]);
  const isParticipant = (clientProfile && clientProfile.id === booking.client_id) || (coachProfile && coachProfile.id === booking.coach_id);
  if (!isParticipant) return jsonResponse({ error: "You are not part of this session." }, 403);

  if (booking.zoom_join_url) {
    return jsonResponse({ joinUrl: booking.zoom_join_url, alreadyExisted: true });
  }
  if (booking.status !== "upcoming") return jsonResponse({ error: "Only upcoming sessions can get a meeting link." }, 400);

  let accessToken: string;
  try {
    accessToken = await getZoomAccessToken();
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 502);
  }

  const clientName = pickFullName(booking.client_profiles);

  const meetingRes = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: `LEANR session with ${clientName ?? "client"}`,
      type: 2,
      start_time: booking.scheduled_start,
      duration: booking.duration_minutes,
      timezone: "Asia/Kolkata",
      settings: { join_before_host: true, waiting_room: false },
    }),
  });
  if (!meetingRes.ok) {
    return jsonResponse({ error: `Zoom meeting creation failed: ${await meetingRes.text()}` }, 502);
  }
  const meeting = await meetingRes.json();

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ zoom_meeting_id: String(meeting.id), zoom_join_url: meeting.join_url, zoom_start_url: meeting.start_url })
    .eq("id", bookingId);
  if (updateError) return jsonResponse({ error: updateError.message }, 500);

  return jsonResponse({ joinUrl: meeting.join_url, alreadyExisted: false });
});
