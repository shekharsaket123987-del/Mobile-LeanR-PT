/**
 * Push notification sending — LEANR_PT_NEXTGEN_APP_PRD.md §11, PRD §26
 * ("the single largest new backend requirement"). Fired by a Postgres
 * trigger (`trigger_send_push_notification()`, see the
 * `push_tokens_and_send_trigger` migration) via `pg_net.http_post` on
 * every INSERT into `notifications` — not called directly by the app.
 *
 * `verify_jwt: false` because the caller here is Postgres itself, not a
 * logged-in app user — there's no user JWT to check. This intentionally
 * leaves the endpoint open (no shared-secret check): the worst a caller
 * who guesses/enumerates a real `notificationId` can do is cause one
 * extra push resend to that notification's own recipient — no data
 * exposure, no write access beyond what the trigger already grants
 * itself via the service-role key. Hardening this with a shared secret
 * is a reasonable follow-up if wanted (would need one more Edge Function
 * secret set via the dashboard).
 *
 * Uses Expo's push API directly (https://exp.host/--/api/v2/push/send)
 * — no Firebase/APNs credentials needed for Expo-token-based push, only
 * the token itself (already collected by register-push-token.ts).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const notificationId = body.notificationId as string | undefined;
  if (!notificationId) return jsonResponse({ error: "notificationId is required." }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: notification, error: notificationError } = await admin
    .from("notifications")
    .select("id, user_id, title, message, template_key")
    .eq("id", notificationId)
    .single();
  if (notificationError || !notification) return jsonResponse({ error: "Notification not found." }, 404);

  const { data: pushToken } = await admin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("user_id", notification.user_id)
    .maybeSingle();
  if (!pushToken?.expo_push_token) {
    // Not an error -- most users won't have push registered yet (needs a
    // dev build, not Expo Go) or opted out. Nothing to send.
    return jsonResponse({ sent: false, reason: "No push token registered for this user." });
  }

  const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      to: pushToken.expo_push_token,
      title: notification.title,
      body: notification.message,
      data: { notificationId: notification.id, templateKey: notification.template_key },
    }),
  });
  const expoResult = await expoRes.json().catch(() => null);
  if (!expoRes.ok) {
    return jsonResponse({ error: `Expo push send failed: ${JSON.stringify(expoResult)}` }, 502);
  }

  return jsonResponse({ sent: true, expoResult });
});
