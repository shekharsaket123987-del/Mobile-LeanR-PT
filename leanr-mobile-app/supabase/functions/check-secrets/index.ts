/**
 * Temporary diagnostic — reports ONLY whether each secret env var is
 * present (boolean), never the value. Deployed on request to verify the
 * razorpay/zoom-meeting secrets after the project owner set them via the
 * dashboard, since neither this tool nor the deployed payment/meeting
 * functions can be safely invoked to check (one would create a real live
 * Razorpay order, the other needs a real booking + logged-in user).
 *
 * Confirmed live on 2026-08-19: all 5 secrets present (RAZORPAY_KEY_ID/
 * _SECRET, ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET). This
 * only proves the env vars are non-empty, not that the values are
 * correct — the real test is an actual order/meeting creation call from
 * a running app with a logged-in user, which hasn't happened yet in
 * this environment.
 *
 * `verify_jwt: false` (publicly reachable, no auth) — safe, since it
 * only ever returns booleans and has no side effects. Not deleted via
 * this repo's tooling (no delete_edge_function capability available
 * here) — safe to remove whenever convenient via the Supabase dashboard
 * (Edge Functions → check-secrets → delete) or
 * `supabase functions delete check-secrets`. Not referenced by the app.
 */
Deno.serve(() => {
  const present = (key: string) => Boolean(Deno.env.get(key) && Deno.env.get(key)!.length > 0);
  return new Response(
    JSON.stringify({
      RAZORPAY_KEY_ID: present("RAZORPAY_KEY_ID"),
      RAZORPAY_KEY_SECRET: present("RAZORPAY_KEY_SECRET"),
      ZOOM_ACCOUNT_ID: present("ZOOM_ACCOUNT_ID"),
      ZOOM_CLIENT_ID: present("ZOOM_CLIENT_ID"),
      ZOOM_CLIENT_SECRET: present("ZOOM_CLIENT_SECRET"),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
