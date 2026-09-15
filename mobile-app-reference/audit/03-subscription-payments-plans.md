# Audit Section 3: Subscription, Payments, Plans, Demo Booking

Scope: `src/lib/data/{plans,payments,subscription,demo-booking,anonymous-demo-booking,edge-functions}.ts`,
`src/app/(client)/{plans,activate,subscription,payment-success,demo-booking,renewal-checkin,renewal-scheduling}.tsx`,
`src/app/(marketing)/plans.tsx`, `src/app/(auth)/book-free-demo.tsx`,
`supabase/functions/{razorpay,razorpay-webhook,subscription-lifecycle}/index.ts`,
`supabase/migrations/20260912{090000,100000,110000}_*.sql`.

Reference: `mobile-app-reference/ClientPortal.md` §7 (Purchase & Checkout), §8 (Post-Purchase), §9 (Subscription
Deep Analysis), §14 (Payment History), §20 (Pre→Post transformation), §26.A/C (trust-boundary rules).

## Functionality Inventory

| Feature | File(s) | Present? |
|---|---|---|
| Marketing plan browsing (logged-out) | `src/app/(marketing)/plans.tsx` | Yes |
| Plan browsing + purchase (logged-in, pre-purchase theme) | `src/app/(client)/plans.tsx` (`PrePurchasePlansScreen`) | Yes |
| Plan browsing + purchase (logged-in, has/had subscription) | `src/app/(client)/plans.tsx` (`EnrolledPlansScreen`) | Yes |
| Razorpay order creation | `supabase/functions/razorpay/index.ts` (`create-order`) | Yes |
| Razorpay native checkout | `src/lib/data/payments.ts` (`react-native-razorpay`) | Yes |
| Razorpay signature verification | `supabase/functions/razorpay/index.ts` (`verify-payment`) | Yes |
| Webhook reconciliation | `supabase/functions/razorpay-webhook/index.ts` | Code present; **not deployed/wired** (see Gaps) |
| Purchase-gate / renewal exception (`sessions_remaining<=5`) | `razorpay/index.ts` `hasBlockingSubscription()` | Yes |
| `paid_unfulfilled` failure path | `razorpay/index.ts`, `razorpay-webhook/index.ts` | Yes |
| Plan activation (start date, one-time lock) | `src/app/(client)/activate.tsx`, `subscription-lifecycle/index.ts` (`activate`) | Yes |
| Old-subscription atomic retirement on renewal activation | `subscription-lifecycle/index.ts` lines 121-127 | Yes, but **not transactionally atomic** (see Gaps) |
| Pause / Resume | `src/app/(client)/subscription.tsx`, `subscription-lifecycle/index.ts` (`pause`/`resume`) | Yes |
| Pause-days-used derivation | — | **Not implemented** |
| Subscription display (status/sessions/payments) | `src/app/(client)/subscription.tsx` | Yes, with gaps (see below) |
| Payment history list | `src/lib/data/payments.ts` (`getMyPayments`) | Yes, but unfiltered by status (see Gaps) |
| Demo booking (authenticated, free) | `src/lib/data/demo-booking.ts`, `src/app/(client)/demo-booking.tsx` | Yes, fully bypasses Razorpay |
| Demo booking (anonymous, free) | `src/lib/data/anonymous-demo-booking.ts`, `src/app/(auth)/book-free-demo.tsx` | Yes, fully bypasses Razorpay |
| Renewal check-in (fresh baseline, bypasses weekly cap) | `src/app/(client)/renewal-checkin.tsx` | Yes |
| Renewal scheduling (keep/change) | `src/app/(client)/renewal-scheduling.tsx`, `src/lib/data/recurring-schedule.ts` (`carryOverRecurringSchedule`) | Yes |
| Coupons/discounts/promo codes | — | Not implemented (matches web) |
| Subscription/plan cancellation | — | Not implemented (matches web) |
| Refunds (client-facing) | — | Not implemented (matches web) |
| Refunds (admin, audit-log only, no money movement) | `src/lib/data/admin-clients.ts:342` (`logRefundRequest`) | Present — additive, PRD-documented, out of client scope |
| Invoice/receipt download | — | Not implemented (matches web) |

## Payment Trust-Boundary Trace

```
Client (plans.tsx, onPurchase)
  │
  ▼
purchasePackage() [src/lib/data/payments.ts:38-80]
  │  supabase.functions.invoke('razorpay', { action: 'create-order', packageId })
  ▼
supabase/functions/razorpay/index.ts handleRequest() action='create-order' [lines 130-188]
  • authenticates caller via Authorization header → supabase.auth.getUser() [111-116]
  • resolves client_profiles row for that user, rejects non-clients (403) [118-124]
  • loads package_tiers, rejects if missing/inactive (404) [134-139]
  • hasBlockingSubscription(admin, clientId) [56-72] — counts bookings with
    status IN ('upcoming','completed') against sessions_total for any existing
    active/awaiting_activation subscription; blocks (409) unless remaining <= 5
    — SAME counting rule used by the DB's confirm_booking() credit gate, so this
    gate and the real booking-time gate never disagree
  • amountPaise = round(price * 100) [149]
  • POST https://api.razorpay.com/v1/orders with Basic auth
    btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`) — secret never leaves the
    Edge Function [150-157]
  • INSERT payments row (service-role key `admin` client): status='created',
    razorpay_order_id=order.id [165-177]
  • returns {orderId, amountPaise, currency, keyId (PUBLIC key, not secret),
    packageName, paymentId} — no signature, no trust granted here [180-187]
  │
  ▼
RazorpayCheckout.open({...}) [payments.ts:50-59] — native module
  (react-native-razorpay, requires expo prebuild/dev build, NOT Expo Go)
  │  on success: {razorpay_order_id, razorpay_payment_id, razorpay_signature}
  ▼
supabase.functions.invoke('razorpay', { action: 'verify-payment', ... }) [payments.ts:65-72]
  ▼
supabase/functions/razorpay/index.ts handleRequest() action='verify-payment' [190-275]
  • re-authenticates caller (same auth block as create-order)
  • loads payments row by razorpay_order_id [196-201]
  • ownership check: payment.client_id === caller's clientId (403 if not) [202]
  • IDEMPOTENT: status==='paid' → no-op success, returns stored subscriptionId [205]
  • status !== 'created' → 409 reject (can't re-verify a failed/unfulfilled row) [206-208]
  • expectedSignature = HMAC-SHA256(RAZORPAY_KEY_SECRET, `${order_id}|${payment_id}`)
    via Web Crypto `crypto.subtle` [74-79, 210]
  • MISMATCH → payments.status='failed', 400 error, NO subscription created,
    NO charge trusted [211-214]  ← THIS IS THE ONLY TRUSTED FULFILLMENT GATE
  • on match: payments.status='paid', paid_at set [216-219]
  • loads package_tiers again for sessions_count/default_pause_days [221-225];
    lookup failure → payments.status='paid_unfulfilled', 500 + support-reference
    message, money never silently lost [226-229]
  • SECOND hasBlockingSubscription() check (TOCTOU re-guard, same rule) [236-242]
    → if now blocked, payments.status='paid_unfulfilled', 409 + support-reference
  • INSERT subscriptions row: status='awaiting_activation',
    sessions_total=pkg.sessions_count, pause_days_allowed=pkg.default_pause_days
    [244-255]; insert failure → paid_unfulfilled + support-reference [256-262]
  • UPDATE payments.subscription_id [264]
  • in-app notification 'plan_purchased_client' [266-272]
  • returns {success:true, subscriptionId}
  │
  ▼
purchasePackage() resolves → goToPaymentSuccess() [plans.tsx:30-42] reads the
  freshly-created payment row back via getMyPayments() (a normal RLS SELECT,
  `payments_select_own`) — the success screen's Plan/Amount/Payment-ID/Date
  fields come from the DATABASE record, never from the client-side Razorpay
  callback object directly [payment-success.tsx] — preserves the trust
  boundary all the way to the UI, not just the write path.
```

**Webhook reconciliation** (`supabase/functions/razorpay-webhook/index.ts`):
- Verifies `x-razorpay-signature` via HMAC-SHA256 over the raw request body with `RAZORPAY_WEBHOOK_SECRET`
  [lines 41-46, 66-74] — rejects (silently, always HTTP 200) on mismatch [71-74].
- No-ops if `RAZORPAY_WEBHOOK_SECRET` is unset [61-64], if event isn't `payment.captured` [77], if the
  `payments` row can't be found [86-91], or if already `paid`/`paid_unfulfilled` [94-96].
- On a genuine reconciliation, repeats the identical TOCTOU-guarded subscription-creation logic as
  `verify-payment` (same `remaining > 5` check, same `paid_unfulfilled` fallback) [98-151].
- Always returns HTTP 200 (`{received:true}`) even on internal failure — Razorpay is never left retrying
  indefinitely [48-56].
- **Server-side signature verification is correctly implemented in code**, but the function's own file
  header [lines 8-28] states it is **not deployed and not registered** with Razorpay — see Gaps.

**Verdict: no client-reported payment success is ever trusted.** Every fulfillment path (checkout callback,
webhook) re-derives truth from a server-computed HMAC signature against the stored `payments` row. No
subscription is ever created "optimistically" before verification — the `subscriptions` INSERT only happens
after the signature check passes. `RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` never appear client-side;
grep of `src/` confirms only `RAZORPAY_KEY_ID` (public) is referenced app-side, and the mobile client never
calls `supabase.from('subscriptions'|'payments').insert/update(...)` directly — every write for these two
tables goes through a service-role Edge Function (`razorpay`, `subscription-lifecycle`). Confirmed by grep:
`src/lib/data/payments.ts` and `src/lib/data/subscription.ts` contain SELECT-only Supabase table calls.

## Subscription State Machine (as implemented)

DB enum mirrored client-side (`src/lib/data/types.ts:60`): `active | inactive | paused | awaiting_activation`
— matches web exactly, no "expired" DB value.

```
(purchase verified) → awaiting_activation
  --[activate, subscription-lifecycle 'activate']--> active (activated_at=startDate)
      side effect: any OTHER subscription for this client with status='active' → 'inactive'
                   (subscription-lifecycle/index.ts:121-127 — NOT wrapped in a DB transaction,
                    and the retire-update's error is not checked/surfaced — see Gaps SUB-011)
  active --[pause, 'pause']--> paused (paused_at=now())
  paused --[resume, 'resume']--> active (resumed_at=now())
  (no code path anywhere sets status='inactive' except the renewal-retirement side effect above —
   confirmed no cancellation action exists)
```

`journey.ts` (`getClientJourneyStage`) independently re-derives `ClientJourneyStage` from `subscriptions`,
`client_onboarding`, `recurring_slots`, and `progress_logs`, matching ClientPortal.md §4.0's evaluation order
verbatim (awaiting_activation short-circuit → active/onboarding/renewal/slot-selection branch → paused/inactive
fall-through to demo/marketing → demo/marketing). This overlaps with subsystem 1's scope; only the
subscription-status-dependent portion was re-verified here and it is consistent with the payments/activation
code traced above.

## Workflow Traces

### Purchase (happy path)
1. Client on `/plans` (either `PrePurchasePlansScreen` or `EnrolledPlansScreen`, chosen by
   `getLatestSubscription()` truthiness — `plans.tsx:183-187`, purely a theme/copy branch, not a functional
   gate) taps "Purchase plan" → `onPurchase(planId, planName)`.
2. `purchasePackage()` → edge fn `create-order` → Razorpay order → `payments` row `status='created'`.
3. `RazorpayCheckout.open()` — native modal, collects card/UPI/etc.
4. On success → edge fn `verify-payment` → HMAC check → `subscriptions` row `status='awaiting_activation'`.
5. `goToPaymentSuccess()` re-reads the payment row, navigates to `/payment-success` with real amount/paymentId/date.
6. "Go to Next Step" → `/activate`.

### Activation
1. `/activate` loads `getPendingActivationSubscription()` (only rows with `status='awaiting_activation'`).
2. Client picks a date via `LightCalendarGrid` (`minDate = tomorrow`, so the UI cannot even select today).
3. `activateSubscription(id, dateKey)` → edge fn `activate` → server re-validates `status==='awaiting_activation'`
   (409 "already been activated" otherwise) and `startDate >= tomorrow` (IST) independently of the UI's `minDate`
   restriction — client-side disabling is not the only gate, matching §24's stated pattern.
4. On success: `subscriptions.status='active'`, then a second, unchecked update retires any other
   `status='active'` row for the client (see SUB-011).
5. `router.replace('/onboarding')`.

### Pause / Resume
1. `/subscription` → "Pause Plan" or "Resume Plan" row → `Alert.alert` confirm → `pauseSubscription`/
   `resumeSubscription` → edge fn `subscription-lifecycle` → status flip + notifications to client and,
   via `resolveAssignedCoachProfileId`, the client's current recurring-slot coach.
2. No code anywhere touches `bookings` on pause (grep of `pauseSubscription`/`subscription-lifecycle` call
   sites shows no booking-table writes) — matches web's "existing upcoming sessions untouched" rule.
3. New regular-session booking blocking is enforced downstream by `confirm_booking()` (the shared Postgres
   RPC, not in this repo — see Gaps note on migration scope) requiring `status='active'`.

### Renewal
1. `SessionsLowGateModal`-equivalent (`gates.ts`, `SESSIONS_LOW_THRESHOLD=5`) surfaces once
   `sessions_total - completedCount <= 5`.
2. Client purchases again from `/plans` — `hasBlockingSubscription()` allows it because `remaining > 5` is
   false (i.e. `<=5`) at both `create-order` and `verify-payment` (TOCTOU-safe, same rule both places).
3. New `awaiting_activation` row created; on `/activate` confirm, old `active` row retired (SUB-011 caveat).
4. `journey.ts` recomputes stage → `renewal_checkin` (if no progress log since new `activated_at`) →
   `renewal_scheduling` (if no `recurring_slots` billed against the new subscription id) → `active`.
5. `renewal-checkin.tsx` calls `logProgress(..., {skipWeeklyLimit:true})` — confirmed bypass of the normal
   7-day rate limit, matching §9.
6. `renewal-scheduling.tsx` offers `carryOverRecurringSchedule(subscription.id)` ("Keep My Schedule") or
   redirects to `/my-schedule` ("No, Change It") — matches §9's two options.

### Demo booking (no payment)
- Authenticated: `demo-booking.tsx` → `holdSlot()`/`confirmHold(holdId, null, {sessionType:'assessment',
  amountPaid:0})` — no Razorpay call anywhere in this file.
- Anonymous: `book-free-demo.tsx` → `create-assessment-booking` edge function (`find-slots`/`confirm` actions)
  — a separate lead-capture path (`assessment_sessions` table per file header), also no Razorpay call.
- Confirmed via grep: `purchasePackage`/`razorpay` only referenced from `plans.tsx` and
  `payment-success.tsx` — never from any demo-booking file.

## Business Rules

| Rule | Enforced where | Matches web? |
|---|---|---|
| Second purchase blocked unless `sessions_remaining <= 5` | `razorpay/index.ts` `hasBlockingSubscription()`, called at both `create-order` and `verify-payment` (TOCTOU-safe); same logic duplicated in `razorpay-webhook/index.ts:113-132` | Yes |
| Signature verification is the only trust boundary | `razorpay/index.ts:210-214` | Yes |
| Idempotent verify-payment (already-paid → no-op) | `razorpay/index.ts:205` | Yes |
| `paid_unfulfilled` on post-capture failure, no auto-refund | `razorpay/index.ts:226-262`, `razorpay-webhook/index.ts:108-149` | Yes |
| Activation start date >= tomorrow (IST) | `subscription-lifecycle/index.ts:106-113`, independently of UI `minDate` | Yes |
| Activation one-time lock | `subscription-lifecycle/index.ts:103-105` (`status!=='awaiting_activation'` → 409) | Yes |
| Old-subscription retirement on renewal activation | `subscription-lifecycle/index.ts:121-127` | Partially — not transactional, error unchecked (SUB-011) |
| Pause only from `active`; Resume only from `paused` | `subscription-lifecycle/index.ts:135,154` | Yes |
| Pause blocks new bookings, not existing ones | Downstream in the shared `confirm_booking()` RPC (not in this repo) requiring `status='active'`; no booking writes on pause | Yes (inherited from shared backend) |
| Pause-days-used is informational only, not hard-enforced | N/A — not implemented at all client-side | Gap (see SUB-013) |
| No coupons/discounts | Confirmed absent (grep) | Yes |
| No subscription cancellation | Confirmed absent (grep) | Yes |
| No client-facing refunds | Confirmed absent; admin audit-log-only "Log Refund Request" exists, explicitly non-money-moving | Yes (client-facing); admin addition is out of client scope |
| No invoice/receipt download | Confirmed absent | Yes |
| Demo booking has no payment step | Confirmed via code trace | Yes |

## Gaps vs Web Reference

1. **Razorpay webhook reconciliation is not actually wired up in production/ops**, per the function's own
   file header (`razorpay-webhook/index.ts:1-28`): no `RAZORPAY_WEBHOOK_SECRET` is set, and the function has
   not been registered in the Razorpay dashboard. The *code* correctly implements the safety net, but until
   deployed, the "browser closed mid-payment" recovery path described in ClientPortal.md §7/§25 does not
   actually run — a captured payment with no client-side `verify-payment` call would sit at `status='created'`
   forever with no automatic recovery. This is a deployment/ops gap, not a logic bug.
2. **Renewal old-subscription retirement is not transactionally atomic** and its error is unchecked
   (`subscription-lifecycle/index.ts:115-127`). Two sequential `.update()` calls, not wrapped in a Postgres
   transaction/RPC. If the process crashes or the second call fails between them, the client could end up with
   two simultaneously `active` subscriptions, and the caller receives no error (the retire-update's `error` is
   never read). This directly touches §26.C's explicit "MUST NOT CHANGE" rule: "must happen atomically with
   the new subscription's activation, not before or after."
3. **`pause_days_used` is not implemented at all** — not even the naive client-side derivation web uses
   (paired pause/resume timeline events). The Subscription screen only shows `pause_days_allowed` ("Pause Days
   Included"); there is no "Pause Days Used" figure anywhere in the mobile app (confirmed via grep — no
   `pause_days_used`/`pauseDaysUsed` reference exists). Low severity since web itself treats this as
   informational/non-blocking, but it's a genuinely missing data point from §9's documented field list.
4. **Payment history list is unfiltered by status**, unlike web's presumed `sales_view` source. `getMyPayments()`
   (`payments.ts:25-36`) selects all rows for the client with no `.eq('status', 'paid')` filter, so abandoned
   checkouts (`status='created'`), failed payments (`status='failed'`), and `paid_unfulfilled` rows all appear
   in the client-facing "Payment history" list on `/subscription`, each rendered via `LightStatusBadge` which
   has no tone/label mapping for these values — they render with a generic gray badge and an ugly
   under-capitalized label (e.g. "Paid_unfulfilled"). ClientPortal.md §29 explicitly flags "whether `sales_view`
   includes demo-session line items... not observable" but strongly implies a curated, successful-sales-only
   view; showing raw failed/created payment attempts to the client is very likely a deviation, and the label
   formatting is a clear cosmetic bug regardless.
5. **`awaiting_activation` subscription status is directly reachable and displayed on `/subscription`**
   (`subscription.tsx:145,168`), contradicting §9's note that web "never shows raw 'awaiting_activation' here
   — that stage redirects away first." Mobile deliberately allows viewing the Subscription tab in this state
   (with a correct "Activate this plan" action row), but the status pill itself shows the raw enum value
   through the same unmapped-badge cosmetic issue as #4.
6. **Live Razorpay keys are configured with no confirmed end-to-end test**, per the project's own `README.md`
   (lines 408-413): "neither `razorpay` nor [Zoom] has been exercised end-to-end... The Razorpay keys currently
   set are **live** keys (`rzp_live_...`) — test with Razorpay test-mode keys first if at all possible before a
   real charge." This is a self-documented operational risk in the highest-severity domain of this audit
   (real money), not a code defect — flagged here because it materially affects whether the "WORKING CORRECTLY"
   verdicts above have been validated against a live gateway response, as opposed to just code-reviewed.
7. **`activate.tsx`'s hint copy is misleading**: "You can reschedule later if needed." (`activate.tsx:93`)
   directly contradicts the actual, correctly-enforced one-time-lock behavior (a second `activate` call 409s
   with "This plan has already been activated."). Functional gating is correct; only the UI copy is wrong.

## Edge Cases Observed

| Edge case | Observed mobile behavior |
|---|---|
| Payment successful, verify-payment never called (app killed mid-checkout) | Payment row stuck at `status='created'`; webhook code exists to reconcile this but is not deployed (Gap #1) — client sees no subscription and no error, must retry purchase, which would fail with a duplicate-order edge case not explicitly handled (Razorpay order already paid, a fresh order would be created for the same package on retry — not itself a double-charge risk since it's a new Razorpay order, but leaves an orphaned `created` payment row visible in payment history, see Gap #4) |
| Signature mismatch | `payments.status='failed'`, clear 400 error surfaced via `extractFunctionErrorMessage`, no subscription created |
| Two parallel purchase attempts (double-tap) | `purchasingId`/`disabled` state prevents a second tap on the SAME plan card, but does not prevent tapping a second, different plan's button while the first is in flight — server-side `hasBlockingSubscription` TOCTOU re-check at `verify-payment` is the actual backstop, correctly implemented |
| Renewal activation crash between the two subscription updates | Two simultaneously `active` subscriptions possible with no surfaced error (Gap #2) |
| Client revisits `/activate` after already active | `getPendingActivationSubscription()` returns null (query filters `status='awaiting_activation'`) → "Nothing to activate right now" empty state; edge function also independently 409s if somehow invoked | 
| Client views `/subscription` while `awaiting_activation` | Renders with raw status badge + "Activate this plan" row (Gap #5) — functionally fine, cosmetically inconsistent with web's redirect-first behavior |
| Demo already booked, client re-visits demo booking screen | `hasExistingAssessment()` shows an informational card ("You already have an assessment session on record — booking another is fine too") but does not block re-booking — not explicitly covered by ClientPortal.md, treated as reasonable, non-blocking parity |
| Package referenced by an old subscription later deactivated (`is_active=false`) | `getPackageById()` intentionally does not filter by `is_active` (`plans.ts:19-28`), so historical subscription/payment rows still resolve a package name correctly |

## Matrix Rows

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Root Cause | Frontend | Backend/API | Database | Dependencies | Severity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SUB-001 | Plans | Marketing browsing | Logged-out plan browsing, no purchase | `src/app/(marketing)/plans.tsx`, `_layout.tsx:21-25` | Public tab bar shows plans read-only, "View Details" → `/signup`; auto-redirects away if a session exists | Plans visible pre-login; purchase requires account | WORKING CORRECTLY | — | `(marketing)/plans.tsx` | `getMarketingPlans()` | `package_tiers` | Auth session state | — |
| SUB-002 | Plans | Logged-in browsing/purchase | Dual pre-purchase/enrolled themed plan screens | `src/app/(client)/plans.tsx:54-187` | Branches purely on `getLatestSubscription()` truthiness for theme, not for gating; both variants call the same `purchasePackage()` | One purchase entry point post-login, styling may vary | WORKING CORRECTLY | Intentional theme split, not dead code | `(client)/plans.tsx` | `getMarketingPlans`, `purchasePackage` | `package_tiers` | — | — |
| SUB-003 | Payments | Order creation | Razorpay order created server-side | `supabase/functions/razorpay/index.ts:130-188` | Auth-checked, role-checked, purchase-gate-checked, secret used server-only, `payments` row inserted `status='created'` before any checkout UI | Same | WORKING CORRECTLY | — | `payments.ts:purchasePackage` | `razorpay` edge fn | `payments`, `package_tiers` | Razorpay Orders API | — |
| SUB-004 | Payments | Checkout | Native Razorpay SDK (not WebView) | `src/lib/data/payments.ts:12,50-59`; `package.json:38` | `react-native-razorpay` native module, requires dev build/prebuild | Native SDK preferred per §22/§26.B | WORKING CORRECTLY | — | `payments.ts` | — | — | `react-native-razorpay` | — |
| SUB-005 | Payments | Fulfillment | Server-side HMAC-SHA256 signature verification | `supabase/functions/razorpay/index.ts:74-79,190-275` | Idempotent, ownership-checked, mismatch → hard fail + `status='failed'`, no subscription ever created without a valid signature | Only trusted fulfillment path | WORKING CORRECTLY | — | `payments.ts:purchasePackage` | `razorpay` edge fn `verify-payment` | `payments`, `subscriptions` | Web Crypto `crypto.subtle` | — |
| SUB-006 | Payments | Fulfillment failure | `paid_unfulfilled` path | `razorpay/index.ts:226-262`, `razorpay-webhook/index.ts:108-149` | Captured payment marked `paid_unfulfilled` on any post-signature failure (package lookup, TOCTOU block, subscription insert); no auto-refund, support-reference message returned | Same | WORKING CORRECTLY | — | payment/verify UI error surfacing | edge fns | `payments` | — | — |
| SUB-007 | Payments | Webhook reconciliation | Server-to-server safety net for browser-closed-mid-payment | `supabase/functions/razorpay-webhook/index.ts` | Code correctly verifies webhook signature and reconciles, but is undeployed and unregistered in Razorpay dashboard per its own header comment | Webhook active in production, catching missed client callbacks | PARTIALLY IMPLEMENTED | `RAZORPAY_WEBHOOK_SECRET` not set; function not deployed/registered (ops task, not code) | — | `razorpay-webhook` edge fn | `payments`, `subscriptions` | Razorpay Webhooks dashboard config | HIGH |
| SUB-008 | Payments | Purchase gate | Block 2nd purchase unless `sessions_remaining<=5` | `razorpay/index.ts:44-72,142-147,236-242`; `razorpay-webhook/index.ts:113-132` | Consistently enforced at create-order, verify-payment (TOCTOU), and webhook, all using identical `upcoming+completed` counting | Same rule, same counting method everywhere | WORKING CORRECTLY | — | `plans.tsx` (surfaces 409 error inline) | 3 enforcement points | `subscriptions`, `bookings` | — | — |
| SUB-009 | Subscription | Activation | Start date >= tomorrow (IST), one-time lock | `src/app/(client)/activate.tsx`, `subscription-lifecycle/index.ts:102-131` | Server independently re-validates date and lock state regardless of client `minDate`/query filtering | Same | WORKING CORRECTLY | — | `activate.tsx` | `subscription-lifecycle` edge fn `activate` | `subscriptions` | — | — |
| SUB-010 | Subscription | Activation | UI copy says "You can reschedule later if needed." | `src/app/(client)/activate.tsx:93` | Misleading hint; actual behavior is a hard one-time lock (409 on 2nd attempt) | Copy should not contradict the one-time-lock rule | WORKING BUT INCORRECT | Stale/incorrect UI copy | `activate.tsx` | — | — | — | LOW |
| SUB-011 | Subscription | Renewal | Atomic old-subscription retirement on new activation | `subscription-lifecycle/index.ts:115-127` | Two sequential, non-transactional `.update()` calls; the retirement update's error is never checked or surfaced | Must happen atomically with activation (§26.C, MUST NOT CHANGE) | WORKING BUT INCORRECT | No DB transaction/RPC wrapping; unchecked error | `activate.tsx` (no visibility into partial failure) | `subscription-lifecycle` edge fn | `subscriptions` | — | HIGH |
| SUB-012 | Subscription | Pause/Resume | Client self-service pause/resume + notifications | `src/app/(client)/subscription.tsx:69-95`, `subscription-lifecycle/index.ts:134-171` | Correct status-guard transitions; notifies client + assigned coach; no booking-table writes on pause | Same | WORKING CORRECTLY | — | `subscription.tsx` | `subscription-lifecycle` edge fn | `subscriptions`, `notifications` | — | — |
| SUB-013 | Subscription | Pause days | `pause_days_used` derivation | N/A — not implemented anywhere | Only `pause_days_allowed` ("Pause Days Included") is shown; no used/consumed figure exists | Web derives `pauseDaysUsed` live from paired pause/resume timeline events, shown as informational | NOT IMPLEMENTED | Feature not built | `subscription.tsx` | — | — | — | LOW |
| SUB-014 | Subscription | Display | Subscription screen field set | `src/app/(client)/subscription.tsx:140-183` | Shows status, packageName, sessionsTotal/Used/Remaining, pauseDaysAllowed, payments[] — matches §9's field list except pauseDaysUsed (SUB-013) | Match §9's `MySubscriptionView` field list | PARTIALLY IMPLEMENTED | Missing pauseDaysUsed | `subscription.tsx` | `getLatestSubscription`, `getSessionsUsedCount`, `getMyPayments` | `subscriptions`, `bookings`, `payments` | — | LOW |
| SUB-015 | Subscription | Payment history | Raw payment statuses (created/failed/paid_unfulfilled) shown to client | `src/lib/data/payments.ts:25-36`, `subscription.tsx:185-200`, `light-badge.tsx:27-44` | `getMyPayments()` has no status filter; abandoned/failed attempts render with an unmapped gray badge and an ugly under-capitalized label like "Paid_unfulfilled" | Payment history should show successful purchases (web's `sales_view`), not raw failed/abandoned attempts, per §9/§14 | IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW | No status filter on query; badge component has no mapping for these enum values | `subscription.tsx`, `light-badge.tsx` | `payments.ts` | `payments` | — | MEDIUM |
| SUB-016 | Subscription | Display | Raw `awaiting_activation` status shown on Subscription screen | `subscription.tsx:145,168` | Mobile deliberately allows viewing `/subscription` while awaiting activation (shows "Activate this plan" row); status badge shows unmapped raw enum | Web never shows this state here — journey redirect happens first (§9) | IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW | Deliberate mobile design choice (self-service access), but badge cosmetic gap inherited from SUB-015's root cause | `subscription.tsx` | — | `subscriptions` | — | LOW |
| SUB-017 | Sessions-low gate | Renewal nudge | `SESSIONS_LOW_THRESHOLD=5` gate | `src/lib/data/gates.ts:10,18-32` | Correctly derived from `sessions_total - completedCount`, matches server-side threshold used in purchase gate | Same threshold everywhere | WORKING CORRECTLY | — | gate consumer (portal shell, out of this subsystem's file list) | `gates.ts` | `subscriptions`, `bookings` | — | — |
| SUB-018 | Demo booking | Authenticated demo | Free, no Razorpay | `src/lib/data/demo-booking.ts`, `src/app/(client)/demo-booking.tsx:107` | `confirmHold(holdId, null, {sessionType:'assessment', amountPaid:0})`, no payment call anywhere in file | Fully bypasses Razorpay | WORKING CORRECTLY | — | `demo-booking.tsx` | `booking-wizard.ts` RPCs | `bookings` | — | — |
| SUB-019 | Demo booking | Anonymous demo | Free, no Razorpay, no account | `src/lib/data/anonymous-demo-booking.ts`, `src/app/(auth)/book-free-demo.tsx` | Calls `create-assessment-booking` edge function only; no Razorpay reference in either file | Fully bypasses Razorpay; additive vs. ClientPortal.md's Client-Portal-only scope but matches web's actual public marketing surface per mobile PRD | WORKING CORRECTLY | — | `book-free-demo.tsx` | `create-assessment-booking` edge fn | `assessment_sessions` | — | — |
| SUB-020 | Demo booking | Dormant paid-demo code | Razorpay demo-payment path (`createDemoSessionOrder`) | N/A | No such function exists anywhere in this mobile repo (only the `Payment.purpose` type enum retains `'demo_session'` for schema fidelity) | Web has this as unreachable dead code; mobile didn't even port the dead code | UNUSED-DEAD (N/A — not ported) | — | — | — | — | — | — |
| SUB-021 | Renewal | Check-in | Fresh baseline, bypasses weekly rate limit | `src/app/(client)/renewal-checkin.tsx:63-79`, `logProgress(..., {skipWeeklyLimit:true})` | Correctly bypasses the normal 7-day cap for this one-time flow | Same | WORKING CORRECTLY | — | `renewal-checkin.tsx` | `progress.ts:logProgress` | `progress_logs` | — | — |
| SUB-022 | Renewal | Scheduling | Keep/Change schedule choice | `src/app/(client)/renewal-scheduling.tsx` | "Keep My Schedule" → `carryOverRecurringSchedule`; "No, Change It" → `/my-schedule` | Matches §9 | WORKING CORRECTLY | — | `renewal-scheduling.tsx` | `recurring-schedule.ts` | `recurring_slots` | — | — |
| SUB-023 | Payment trust | Success screen | Payment-success data source | `src/app/(client)/payment-success.tsx`, `plans.tsx:30-42 goToPaymentSuccess` | Reads back the persisted `payments` row via `getMyPayments()` after server verification resolves — never trusts the client-side Razorpay callback object for display | Consistent with the "never trust client-reported success" rule extended to the UI | WORKING CORRECTLY | — | `payment-success.tsx` | — | `payments` | — | — |
| SUB-024 | Not implemented | Coupons/discounts | — | N/A | Confirmed absent via grep | Matches web (none) | NOT IMPLEMENTED (parity) | — | — | — | — | — | — |
| SUB-025 | Not implemented | Subscription cancellation | — | N/A | Confirmed absent via grep | Matches web (none) | NOT IMPLEMENTED (parity) | — | — | — | — | — | — |
| SUB-026 | Not implemented | Client-facing refunds | — | N/A | Confirmed absent for clients | Matches web (none) | NOT IMPLEMENTED (parity) | — | — | — | — | — | — |
| SUB-027 | Additive | Admin "Log Refund Request" | Audit-log-only, no money movement | `src/lib/data/admin-clients.ts:337-355`, `src/app/(admin)/admin-clients/[id].tsx:243-246,486-501` | Writes a `client_timeline_events` row (`event_type='refund_requested'`); UI explicitly discloses "does not move money" | Web has no refund concept at all, even audit-only | IMPLEMENTED BUT DIFFERENT FROM INTENDED WORKFLOW (additive, admin-scope) | New PRD.md §4.C-driven addition | Out of client scope (admin, subsystem 5) | — | `client_timeline_events` | — | LOW |
| SUB-028 | Not implemented | Invoice/receipt download | — | N/A | Confirmed absent | Matches web (none) | NOT IMPLEMENTED (parity) | — | — | — | — | — | — |
| SUB-029 | Ops risk | Live payment keys, unverified end-to-end | `README.md:408-413` (self-documented) | Live Razorpay keys (`rzp_live_...`) configured; project's own README states neither `razorpay` nor Zoom edge function has been exercised end-to-end by a logged-in user | Test-mode keys / verified end-to-end test before any real-money exposure | UNKNOWN — REQUIRES VERIFICATION | Deployment/ops state, not a code defect | — | — | — | Razorpay live account | HIGH |
| SUB-030 | Migration | `client_onboarding` uniqueness | DB-level one-row-per-client guarantee | `supabase/migrations/20260912090000_client_onboarding_unique_client.sql` | Adds `unique index` on `client_onboarding(client_id)`, closing a race the app-code-only check couldn't | Matches web's one-time-insert guarantee | WORKING CORRECTLY | — | — | — | `client_onboarding` | — | — (tangential to payments; onboarding not subscription) |
| SUB-031 | Migration | `mark_missed_bookings` permission fix | Fixes a blanket-UPDATE trigger permission bug that could break booking confirmation (incl. credit-enforced regular-session booking) for ALL clients once any overdue booking existed anywhere | `supabase/migrations/20260912100000_fix_mark_missed_bookings_permission.sql` | Adds a transaction-local `app.missed_sweep` flag so the system sweep bypasses the per-row coach-identity trigger check; all other business rules in the trigger (cancel cutoff, completion gating, field immutability) untouched | Booking confirm (and therefore purchase-adjacent credit enforcement) must not fail for unrelated clients | WORKING CORRECTLY (bug fix) | Previously: any single overdue booking anywhere in the table broke every client's booking attempt | — | — | `bookings` trigger | — | — (tangential — booking/session scope, not payments) |
| SUB-032 | Migration | Role sync on auth metadata update | Not payments/subscription-relevant | `supabase/migrations/20260912110000_sync_role_on_auth_user_metadata_update.sql` | Fixes coach/admin provisioning role-sync race; no interaction with payments/subscriptions tables | N/A | N/A (out of scope) | — | — | — | `profiles`, `coach_profiles`, `client_profiles` | — | — |

**Row count: 32** (SUB-001 through SUB-032).
