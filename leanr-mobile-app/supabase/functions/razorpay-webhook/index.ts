/**
 * Razorpay webhook reconciliation — server-to-server safety net for the
 * case `razorpay/index.ts`'s `verify-payment` action never fires (tab
 * closed, crash, lost network right after a successful charge).
 * ClientPortal.md §7: "A webhook (`/api/webhooks/razorpay`) reconciles the
 * rare case where the browser never gets to report success."
 *
 * INVESTIGATION FINDING (recorded here, not silently assumed): this repo
 * has NO separate backend — the mobile app is the only client of this
 * Supabase project's Razorpay integration (confirmed: no
 * `RAZORPAY_WEBHOOK_SECRET` anywhere in `supabase/.env.local` or any edge
 * function; `razorpay/index.ts`'s only mention of "webhook" is a comment
 * describing this as a *future* safety net, not a built one). The
 * `RAZORPAY_KEY_ID`/`_SECRET` currently set are **live** keys
 * (`rzp_live_...`, per README.md's own note) — this gap is real, not
 * hypothetical, and was previously unverified rather than confirmed safe.
 *
 * DEPLOYMENT NOTE — this function does nothing until wired up manually:
 * 1. Deploy it: `supabase functions deploy razorpay-webhook --no-verify-jwt`
 *    (Razorpay's servers send no Supabase auth header — this must be
 *    reachable without a user JWT, unlike every other function in this repo).
 * 2. In the Razorpay dashboard (Settings -> Webhooks), add this function's
 *    URL, subscribe to the `payment.captured` event, and copy the
 *    generated webhook secret.
 * 3. `supabase secrets set RAZORPAY_WEBHOOK_SECRET=... --project-ref <ref>`.
 * These are account-level actions outside this codebase — flagged as
 * REQUIRES CONFIRMATION/ACTION from the user/ops team, not something a
 * code change alone can complete.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  try {
    return await handleRequest(req);
  } catch (err) {
    console.error("[razorpay-webhook] unhandled error:", err);
    // Always 200 to Razorpay even on internal failure — see file header; a failure here must
    // never cause Razorpay to retry indefinitely against an endpoint that keeps erroring.
    return jsonResponse({ received: true });
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!RAZORPAY_WEBHOOK_SECRET) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not set — see this file's header for setup steps.");
    return jsonResponse({ received: true });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) return jsonResponse({ received: true });

  const expected = await hmacSha256Hex(RAZORPAY_WEBHOOK_SECRET, rawBody);
  if (expected !== signature) {
    console.error("[razorpay-webhook] signature mismatch — rejecting.");
    return jsonResponse({ received: true });
  }

  const event = JSON.parse(rawBody);
  if (event.event !== "payment.captured") return jsonResponse({ received: true });

  const paymentEntity = event.payload?.payment?.entity;
  const razorpayOrderId = paymentEntity?.order_id as string | undefined;
  const razorpayPaymentId = paymentEntity?.id as string | undefined;
  if (!razorpayOrderId || !razorpayPaymentId) return jsonResponse({ received: true });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: payment } = await admin
    .from("payments")
    .select("id, client_id, package_id, status, subscription_id")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();
  if (!payment) return jsonResponse({ received: true });

  // Already resolved (the client-side verify-payment callback got there first) — pure no-op.
  if (payment.status === "paid" || payment.status === "paid_unfulfilled") {
    return jsonResponse({ received: true });
  }

  await admin
    .from("payments")
    .update({ status: "paid", razorpay_payment_id: razorpayPaymentId, paid_at: new Date().toISOString() })
    .eq("id", payment.id);

  const { data: pkg } = await admin
    .from("package_tiers")
    .select("sessions_count, default_pause_days")
    .eq("id", payment.package_id)
    .single();
  if (!pkg) {
    await admin.from("payments").update({ status: "paid_unfulfilled" }).eq("id", payment.id);
    return jsonResponse({ received: true });
  }

  // Same TOCTOU guard as razorpay/index.ts's verify-payment path — the renewal exception applies
  // here too, using the identical upcoming+completed counting rule.
  const { data: existingSub } = await admin
    .from("subscriptions")
    .select("id, sessions_total")
    .eq("client_id", payment.client_id)
    .in("status", ["active", "awaiting_activation"])
    .maybeSingle();
  if (existingSub) {
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", existingSub.id)
      .in("status", ["upcoming", "completed"]);
    const remaining = (existingSub.sessions_total as number) - (count ?? 0);
    if (remaining > 5) {
      await admin.from("payments").update({ status: "paid_unfulfilled" }).eq("id", payment.id);
      return jsonResponse({ received: true });
    }
  }

  const { data: subscription, error: subError } = await admin
    .from("subscriptions")
    .insert({
      client_id: payment.client_id,
      package_id: payment.package_id,
      sessions_total: pkg.sessions_count,
      status: "awaiting_activation",
      started_at: new Date().toISOString(),
      pause_days_allowed: pkg.default_pause_days,
    })
    .select("id")
    .single();
  if (subError) {
    await admin.from("payments").update({ status: "paid_unfulfilled" }).eq("id", payment.id);
    return jsonResponse({ received: true });
  }

  await admin.from("payments").update({ subscription_id: subscription.id }).eq("id", payment.id);

  return jsonResponse({ received: true });
}
