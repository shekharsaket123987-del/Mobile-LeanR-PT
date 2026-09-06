/**
 * Admin Provisioning — New PRD.md §4.C "Add Client" (migration wizard)
 * and "Add Coach". Account creation (`auth.admin.createUser`) requires
 * the service-role key, which must never ship inside the mobile bundle
 * (New PRD.md §24) — same pattern as `subscription-lifecycle` and
 * `coach-change-actions` in this same functions directory: verify the
 * caller via their own JWT first, then use a service-role client for the
 * privileged part.
 *
 * `handle_new_user()` (DB trigger, confirmed live) already creates the
 * `profiles` row (reading `role` from `raw_app_meta_data`, never
 * client-declarable — New PRD.md §24) plus a bare `client_profiles`/
 * `coach_profiles` row keyed to the new `profile_id`. This function only
 * needs to UPDATE that auto-created row with the remaining fields, not
 * INSERT a second one.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

Deno.serve(async (req: Request) => {
  try {
    return await handleRequest(req);
  } catch (err) {
    console.error("[admin-provisioning] unhandled error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected server error." }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Not authenticated." }, 401);

  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "Not authenticated." }, 401);

  const { data: callerProfile, error: callerProfileError } = await caller.from("profiles").select("role").eq("id", userData.user.id).single();
  if (callerProfileError || callerProfile?.role !== "admin") return jsonResponse({ error: "Admin access required." }, 403);

  const body = await req.json().catch(() => ({}));
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (body.action === "create_client") return handleCreateClient(admin, body);
  if (body.action === "create_coach") return handleCreateCoach(admin, body);
  return jsonResponse({ error: "Unknown action." }, 400);
}

// deno-lint-ignore no-explicit-any
async function handleCreateClient(admin: any, body: Record<string, unknown>): Promise<Response> {
  const { fullName, phone, email, password, packageId, sessionsRemaining, originalPlanSize, pauseDaysAllowed, coachId, days, hour, durationMinutes } = body as {
    fullName: string;
    phone: string | null;
    email: string;
    password: string;
    packageId: string;
    sessionsRemaining: number;
    originalPlanSize: number | null;
    pauseDaysAllowed: number;
    coachId: string | null;
    days: number[];
    hour: number | null;
    durationMinutes: number;
  };
  if (!fullName || !email || !password || !packageId || !(sessionsRemaining > 0)) {
    return jsonResponse({ error: "fullName, email, password, packageId, and a positive sessionsRemaining are required." }, 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "client" },
    user_metadata: { full_name: fullName, phone },
  });
  if (createError || !created.user) return jsonResponse({ error: createError?.message ?? "Failed to create account." }, 500);
  const profileId = created.user.id;

  const { data: clientProfile, error: clientProfileError } = await admin.from("client_profiles").select("id").eq("profile_id", profileId).single();
  if (clientProfileError || !clientProfile) return jsonResponse({ error: "Client profile was not created." }, 500);
  const clientId = clientProfile.id as string;

  const { data: subscription, error: subError } = await admin
    .from("subscriptions")
    .insert({
      client_id: clientId,
      package_id: packageId,
      sessions_total: sessionsRemaining,
      status: "active",
      started_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
      pause_days_allowed: pauseDaysAllowed,
    })
    .select("id")
    .single();
  if (subError) return jsonResponse({ error: subError.message }, 500);

  await admin.from("client_timeline_events").insert({
    client_id: clientId,
    event_type: "client_migrated",
    title: "Client migrated",
    description: originalPlanSize ? `Migrated from an external roster (original plan size: ${originalPlanSize}).` : "Migrated from an external roster.",
    metadata: { originalPlanSize },
  });

  if (coachId && Array.isArray(days) && days.length > 0 && hour !== null) {
    const startTime = `${pad(hour)}:00:00`;
    for (const dayOfWeek of days) {
      const { data: slot, error: slotError } = await admin
        .from("recurring_slots")
        .insert({ client_id: clientId, coach_id: coachId, subscription_id: subscription.id, day_of_week: dayOfWeek, start_time: startTime, duration_minutes: durationMinutes, status: "active" })
        .select("id")
        .single();
      if (slotError) return jsonResponse({ error: slotError.message }, 500);
      await admin.rpc("generate_bookings_from_recurring_slot", { p_recurring_slot_id: slot.id, p_count: 4 });
    }
    await admin.from("conversations").insert({ client_id: clientId, coach_id: coachId, status: "active", opened_at: new Date().toISOString() });
  }

  return jsonResponse({ clientId });
}

// deno-lint-ignore no-explicit-any
async function handleCreateCoach(admin: any, body: Record<string, unknown>): Promise<Response> {
  const { fullName, employeeCode, email, password, specialization, additionalSkills, languages, slots } = body as {
    fullName: string;
    employeeCode: string;
    email: string;
    password: string;
    specialization: string;
    additionalSkills: string[];
    languages: string[];
    slots: { days: number[]; hour: number; durationMinutes: number }[];
  };
  if (!fullName || !employeeCode || !email || !password || !specialization || !languages?.length || !slots?.some((s) => s.days.length > 0)) {
    return jsonResponse({ error: "fullName, employeeCode, email, password, specialization, at least one language, and at least one weekly slot are required." }, 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "coach" },
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) return jsonResponse({ error: createError?.message ?? "Failed to create account." }, 500);
  const profileId = created.user.id;

  const { data: coachProfile, error: coachProfileError } = await admin.from("coach_profiles").select("id").eq("profile_id", profileId).single();
  if (coachProfileError || !coachProfile) return jsonResponse({ error: "Coach profile was not created." }, 500);
  const coachId = coachProfile.id as string;

  const { error: updateError } = await admin
    .from("coach_profiles")
    .update({ employee_code: employeeCode, specialization, skills: additionalSkills, languages, status: "active" })
    .eq("id", coachId);
  if (updateError) return jsonResponse({ error: updateError.message }, 500);

  const availabilityRows: { coach_id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean }[] = [];
  for (const slot of slots) {
    const startTime = `${pad(slot.hour)}:00:00`;
    const endMinutesTotal = slot.hour * 60 + slot.durationMinutes;
    const endTime = `${pad(Math.floor(endMinutesTotal / 60))}:${pad(endMinutesTotal % 60)}:00`;
    for (const day of slot.days) {
      availabilityRows.push({ coach_id: coachId, day_of_week: day, start_time: startTime, end_time: endTime, is_active: true });
    }
  }
  if (availabilityRows.length > 0) {
    const { error: availabilityError } = await admin.from("coach_availability").insert(availabilityRows);
    if (availabilityError) return jsonResponse({ error: availabilityError.message }, 500);
  }

  return jsonResponse({ coachId });
}
