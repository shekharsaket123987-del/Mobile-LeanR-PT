/**
 * Coach-change stage 2 — New PRD.md §3.5/§8.9: once an admin approves a
 * coach-change request WITHOUT picking a coach, the client self-serves
 * "pick your new schedule" -> Find Available Coach -> Confirm. This is a
 * privileged, multi-table operation `src/lib/data/coach-change.ts`'s own
 * header comment already correctly identified as blocked from a plain
 * client call: `coach_change_requests` has no client UPDATE RLS policy
 * (only `coach_change_admin_all`), and neither does `conversations`
 * (`conversations_admin_all` only) — the old conversation must close and a
 * new one open for the new coach (New PRD.md §6 "Chat": a coach change
 * always closes the old thread and opens a new one, never merges).
 *
 * Mirrors `setUpRecurringSchedule` (recurring-schedule.ts)'s insert+generate
 * loop for the actual slot creation — `generate_bookings_from_recurring_slot`
 * does its own per-occurrence conflict skipping, so this doesn't duplicate
 * that check. Not a real DB transaction across the multiple insert calls
 * (same non-atomic acknowledgment as that file's own header comment) — a
 * partial failure here is at least fully attributable to a single admin
 * action, unlike the fully client-facing flow.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// The real POST carries an Authorization header, which forces a browser CORS
// preflight (OPTIONS) first. Without an explicit OPTIONS handler, that
// preflight fell through to "Method not allowed" (405), so the browser never
// sent the real POST at all — same root cause as razorpay/zoom-meeting's fix.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  try {
    return await handleRequest(req);
  } catch (err) {
    console.error("[coach-change-actions] unhandled error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected server error." }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Not authenticated." }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "Not authenticated." }, 401);

  const { data: clientProfile, error: clientError } = await supabase
    .from("client_profiles")
    .select("id")
    .eq("profile_id", userData.user.id)
    .single();
  if (clientError || !clientProfile) return jsonResponse({ error: "Only clients can complete a coach change." }, 403);
  const clientId = clientProfile.id as string;

  const body = await req.json().catch(() => ({}));
  if (body.action !== "complete") return jsonResponse({ error: "Unknown action." }, 400);

  const requestId = body.requestId as string | undefined;
  const newCoachId = body.newCoachId as string | undefined;
  const days = body.days as number[] | undefined;
  const hour = body.hour as number | undefined;
  const durationMinutes = body.durationMinutes as number | undefined;
  if (!requestId || !newCoachId || !days?.length || hour === undefined || !durationMinutes) {
    return jsonResponse({ error: "requestId, newCoachId, days, hour, and durationMinutes are required." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: request, error: requestError } = await admin
    .from("coach_change_requests")
    .select("id, client_id, current_coach_id, status, new_coach_id")
    .eq("id", requestId)
    .single();
  if (requestError || !request) return jsonResponse({ error: "Coach-change request not found." }, 404);
  if (request.client_id !== clientId) return jsonResponse({ error: "Not your request." }, 403);
  if (request.status !== "approved") return jsonResponse({ error: "This request hasn't been approved yet." }, 409);
  if (request.new_coach_id) return jsonResponse({ error: "This request has already been completed." }, 409);

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "active")
    .maybeSingle();

  // Retire the old recurring pattern — scoped to the OLD coach specifically
  // (web ground truth: coachChange.service.ts's completeCoachChange filters
  // both the slot cancellation and the booking cancellation below to
  // request.current_coach_id's slots, not just "any active slot the client
  // has"), so this can't cancel a pattern with some other coach the client
  // may also have (shouldn't normally happen, but matches web exactly).
  const { data: oldSlots, error: oldSlotsError } = await admin
    .from("recurring_slots")
    .select("id")
    .eq("client_id", clientId)
    .eq("coach_id", request.current_coach_id)
    .eq("status", "active");
  if (oldSlotsError) return jsonResponse({ error: oldSlotsError.message }, 500);
  const oldSlotIds = (oldSlots ?? []).map((s) => s.id);

  if (oldSlotIds.length > 0) {
    const { error: cancelError } = await admin.from("recurring_slots").update({ status: "cancelled" }).in("id", oldSlotIds);
    if (cancelError) return jsonResponse({ error: cancelError.message }, 500);

    // GAP-03 / web spec BR-32: cancel the client's still-upcoming bookings tied to the
    // old coach's retired slots BEFORE generating new ones below — otherwise they're left
    // dangling as duplicate sessions with a coach the client no longer has a schedule with.
    // Scoped by recurring_slot_id (not just client+status) to match web exactly and avoid
    // cancelling an unrelated upcoming booking (e.g. a one-off demo/assessment session).
    const { error: cancelBookingsError } = await admin
      .from("bookings")
      .update({ status: "cancelled", cancelled_by: "system", cancel_reason: "Client changed coaches" })
      .in("recurring_slot_id", oldSlotIds)
      .eq("status", "upcoming");
    if (cancelBookingsError) return jsonResponse({ error: cancelBookingsError.message }, 500);
  }

  const startTime = `${pad(hour)}:00:00`;
  for (const dayOfWeek of days) {
    const { data: slot, error: slotError } = await admin
      .from("recurring_slots")
      .insert({
        client_id: clientId,
        coach_id: newCoachId,
        subscription_id: subscription?.id ?? null,
        day_of_week: dayOfWeek,
        start_time: startTime,
        duration_minutes: durationMinutes,
        status: "active",
      })
      .select("id")
      .single();
    if (slotError) return jsonResponse({ error: slotError.message }, 500);

    await admin.rpc("generate_bookings_from_recurring_slot", { p_recurring_slot_id: slot.id, p_count: 4 });
  }

  // Chat: close the old thread, open a new one with the new coach (New PRD.md §6).
  await admin.from("conversations").update({ status: "closed", closed_at: new Date().toISOString() }).eq("client_id", clientId).eq("status", "active");
  await admin.from("conversations").insert({ client_id: clientId, coach_id: newCoachId, status: "active", opened_at: new Date().toISOString() });

  const { error: updateRequestError } = await admin
    .from("coach_change_requests")
    .update({ new_coach_id: newCoachId })
    .eq("id", requestId);
  if (updateRequestError) return jsonResponse({ error: updateRequestError.message }, 500);

  return jsonResponse({ success: true });
}
