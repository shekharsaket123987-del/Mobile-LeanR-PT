/**
 * Phone OTP — MSG91's OTP v5 API. `MSG91_AUTH_KEY` is already provisioned
 * on this project (`supabase/.env.local`, comment: "signup phone
 * verification, PhoneGateModal") but was never wired to any code before
 * this — New PRD.md §10/§19.3 describes the web app's own phone-OTP as
 * currently non-functional (MSG91 KYC/DLT approval pending there), but
 * that's a fact about the *web app's* MSG91 account, not necessarily this
 * mobile project's — so this is a real implementation, not a stub.
 *
 * The secret can never live in the mobile bundle, hence an edge function
 * rather than a direct client call (same reasoning as `razorpay`). Unlike
 * `razorpay`/`subscription-lifecycle`, this function does NOT touch the
 * database at all — it's a pure third-party proxy. The caller (mobile
 * client) writes `profiles.phone` itself after a successful `verify`,
 * using the same own-row UPDATE policy `profile.ts` already relies on —
 * no service-role client needed here.
 *
 * `MSG91_OTP_TEMPLATE_ID` is optional: if the MSG91 account has a single
 * default OTP template configured in its dashboard, `template_id` can be
 * omitted from the request entirely; this reads it only if explicitly set,
 * and passes through MSG91's own error text on any failure so a real
 * account-configuration issue is diagnosable rather than silently eaten.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MSG91_AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY");
const MSG91_OTP_TEMPLATE_ID = Deno.env.get("MSG91_OTP_TEMPLATE_ID");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** MSG91 expects digits only, with country code, no leading '+'. A bare 10-digit number is assumed Indian (91). */
function normalizeMobile(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

Deno.serve(async (req: Request) => {
  try {
    return await handleRequest(req);
  } catch (err) {
    console.error("[phone-otp] unhandled error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected server error." }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!MSG91_AUTH_KEY) {
    return jsonResponse({ error: "Phone verification isn't configured on the server yet — MSG91_AUTH_KEY is missing." }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Not authenticated." }, 401);
  // No Supabase client needed (this function never touches the DB), but
  // requiring the header keeps this from being a fully open SMS-spam relay.

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const rawMobile = body.mobile as string | undefined;
  if (!rawMobile) return jsonResponse({ error: "mobile is required." }, 400);
  const mobile = normalizeMobile(rawMobile);
  if (!mobile) return jsonResponse({ error: "Enter a valid mobile number." }, 400);

  if (action === "send") {
    const params = new URLSearchParams({ mobile, authkey: MSG91_AUTH_KEY, otp_expiry: "10" });
    if (MSG91_OTP_TEMPLATE_ID) params.set("template_id", MSG91_OTP_TEMPLATE_ID);

    const res = await fetch(`https://control.msg91.com/api/v5/otp?${params.toString()}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.type === "error") {
      return jsonResponse({ error: data.message || "Could not send the verification code." }, 400);
    }
    return jsonResponse({ success: true });
  }

  if (action === "verify") {
    const otp = body.otp as string | undefined;
    if (!otp) return jsonResponse({ error: "otp is required." }, 400);

    const params = new URLSearchParams({ mobile, otp, authkey: MSG91_AUTH_KEY });
    const res = await fetch(`https://control.msg91.com/api/v5/otp/verify?${params.toString()}`, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.type === "error") {
      return jsonResponse({ error: data.message || "That code didn't match — check it and try again." }, 400);
    }
    return jsonResponse({ success: true, mobile });
  }

  return jsonResponse({ error: "Unknown action." }, 400);
}
