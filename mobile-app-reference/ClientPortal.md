# Client Portal Functional & Implementation Specification
### Reverse-engineered from the LEANR by Fitelo web application, for a mobile/app rebuild

**Source of truth:** live application code — `src/app/client/**`, `src/components/client/**`, `src/lib/actions/*.actions.ts`, `src/lib/services/*.service.ts`, `supabase/migrations/*.sql`, `src/middleware.ts`. Every claim below is either **Observed** (read directly in code, cited by file/function), **Inferred** (derived from code with the reasoning shown), or explicitly marked **Not observable**. Pre-existing docs in `docs/*.md` and `LEANR_PT_MOBILE_PRD.md` were deliberately **not** used as sources — everything here was independently re-verified against the current codebase, since those documents may be stale or aspirational relative to what's actually implemented. The repo's own `README.md` is also stale — it describes a "mock data, no real auth" prototype; the actual app has real Supabase Auth, real RLS, a real Postgres schema (57 migrations), and a live Razorpay payment integration.

**Stack:** Next.js 14 (App Router) + Supabase (Postgres/Auth/Storage/Realtime), Razorpay (payments), Zoom Server-to-Server OAuth (video), Resend (email), MSG91 (SMS/OTP, India DLT-gated). Business logic lives in a clean layered architecture: `page.tsx` (server component — auth + data fetch + stage-gate redirects) → `*Client.tsx` (client component — forms/interaction) → `*.actions.ts` (`"use server"` — auth + validation) → `*.service.ts` (Supabase queries/writes — RLS + business rules) → Postgres.

---

## 1. Executive Summary

LEANR is a live 1:1 personal-training platform, **not** a content/nutrition app. The Client Portal has no "diet plan" feature at all — the coaching artifacts are **live video sessions**, **coach-authored session notes**, and **client-authored weekly progress/measurement logs**. There is no meal-plan, food-log, or supplement module anywhere in the schema or UI. Wherever this spec's outline asks about "Diet/Plan," it has been mapped onto the app's actual equivalent (§11).

The entire portal is governed by one authoritative, server-derived state machine — `ClientJourneyStage` (`src/lib/actions/client-journey.actions.ts`) — that every top-level page consults and redirects against, recomputed on every page load (no client-side caching of stage). **A mobile rebuild's single most important requirement is reproducing this state machine exactly**, including its evaluation order; get it wrong and every other module's "what does the client see" answer breaks.

Commerce is **session-count-based, not calendar-based**: a plan is a bucket of N sessions with no expiry date. "Expired" is a derived UI/reporting label for having no live subscription after having had at least one — never a stored status, never a date comparison. There are no coupons, discounts, refunds, plan cancellations, or invoice downloads anywhere in the code.

Three portal-wide, mutually-exclusive blocking gates are layered onto every `/client/*` page (only one shown at a time, in this precedence order): **phone-missing** → **measurement-stale (≥7 days)** → **sessions-low (≤5 remaining)**. These are cross-module business rules, not per-screen UI decisions, and are independently confirmed by three separate passes over the code.

## 2. Scope

In scope: everything under `src/app/client/**`, its components under `src/components/client/**`, and every server action/service function they call, including the shared portal-wide gates (`PhoneGateModal`, `MeasurementGateModal`, `SessionsLowGateModal`) rendered by `src/app/client/layout.tsx`. The Coach and Admin portals are referenced **only** where a Client Portal behavior depends on their output (e.g., a coach marking attendance is what turns a session "completed" on the client's side; an admin resolving an escalation is what the client sees as a resolution notice).

## 3. Client Portal Architecture

```
Browser
  │
  ├─ src/app/client/**/page.tsx        (server component: auth via cookies, data fetch, stage-gate redirects)
  │     │
  │     └─ src/components/client/*Client.tsx   ("use client": forms, modals, local state)
  │             │
  │             └─ src/lib/actions/*.actions.ts  ("use server": requires access token, calls services, returns ActionResult<T>)
  │                     │
  │                     └─ src/lib/services/*.service.ts  (Supabase queries; RLS-scoped client OR supabaseAdmin for privileged writes)
  │                             │
  │                             └─ Postgres (Supabase) — RLS policies enforce per-row access; some writes only ever
  │                                go through supabaseAdmin (e.g. subscriptions, payments) with the "is this
  │                                allowed" check done in application code, not RLS.
  │
  ├─ src/middleware.ts   — gates every /client/*, /coach/*, /admin/* route: no session, or wrong/missing role
  │                         on the JWT `user_role` custom claim (falls back to a `profiles` query), → redirect
  │                         to /login/<role>.
  ├─ Razorpay Checkout.js (client-side) + /api/webhooks/razorpay (server-to-server reconciliation)
  ├─ Zoom Server-to-Server OAuth (meeting created lazily, on first join attempt, one shared host account)
  └─ Resend (email) + MSG91 (SMS, client-only, India DLT-gated) — fired from service-layer notify calls,
     never block the triggering action (fail-soft).
```

Every server action returns a discriminated `ActionResult<T>` (`ok`/`fail`); `runAction()` catches all throws so a page always gets a typed success/failure, never a crash. **A mobile client hitting the same actions (if exposed as an API) must handle this same success/failure envelope** — there is no unhandled-exception path anywhere in the traced code.

## 4. Client Lifecycle

Two overlapping, complementary state models exist — reproduce both:

### 4.0 `ClientJourneyStage` — drives routing (`getMyJourneyStateAction`, evaluated fresh on every request)

```
marketing            → no subscription ever, no demo ever taken. /client/plans CTA shown everywhere.
demo_booked          → a demo (assessment) booking exists with status 'upcoming'.
demo_completed       → latest demo's status is 'completed' or 'missed', still no subscription.
awaiting_activation  → a subscription row exists with status='awaiting_activation' (paid, not yet started).
onboarding           → subscription is 'active' but client_onboarding has never been submitted.
renewal_checkin      → (renewal only) subscription active, NOT the client's first-ever subscription, and no
                        progress_logs row exists since this subscription's activated_at.
renewal_scheduling   → (renewal only) no recurring_slots row is billed against this NEW subscription yet.
slot_selection       → (first-time only) subscription active, onboarding done, but no active recurring_slots at all.
active               → subscription active, onboarding done, recurring schedule exists. Normal steady state.
```

Evaluation order (first match wins):
1. Latest subscription row → if `awaiting_activation`, stop here.
2. If `active` → check onboarding exists → check renewal-only steps (only apply if an older subscription exists for this client) → check recurring slots exist → else `active`.
3. If subscription is `paused`/`inactive` with nothing newer → **falls through** to the demo/marketing check as if no subscription existed at all — a client is never permanently stuck.
4. No usable subscription → check latest demo booking → `demo_booked` / `demo_completed` / `marketing`.

`/client/dashboard` is the single hard-redirect gate: `marketing`→`/client/plans`, `awaiting_activation`→`/client/activate`, `onboarding`→`/client/onboarding`, `renewal_checkin`→`/client/renewal-checkin`, `renewal_scheduling`/`slot_selection`→`/client/schedule`. `/client/activate` independently re-verifies `stage === "awaiting_activation"` server-side before rendering (a client cannot reach it directly by URL unless actually in that stage). Several other pages (`/client/subscription`, `/client/book`, `/client/schedule`) branch on the **same** stage value again to render contextual empty-states instead of redirecting — **a mobile app must replicate both the redirect gate and each page's own stage-aware branching; they are not identical logic.**

### `ClientStatus` — 6-bucket display label, priority order (`src/lib/client-status.ts`, admin/coach-facing, not shown to the client directly)
```
paused > active > created (awaiting_activation) > expired (has subscription history, none live) > demo (never
subscribed, has a demo booking) > not_paid
```
Purely derived from `subscriptions.status` history + existence of an assessment-type booking. A mobile app could derive the same label client-side for its own "your status" chip if useful, but it is not what drives access — `ClientJourneyStage` and raw `subscriptions.status` are what actually gate things.

### 4.1 Visitor
Not authenticated. Can reach marketing/landing pages, `/login/client`, `/signup`. Cannot reach any `/client/*` route — `middleware.ts` redirects unauthenticated requests to `/login/client`.

### 4.2 Registered Client
Created via `SignupForm.tsx` (3-step wizard: `form → email-otp → phone-otp`) or Google OAuth.
- **Manual signup fields**: full name (required), email (required, valid format), phone (required, regex `^\+?[0-9]{10,15}$`), password (required, ≥8 chars). `supabase.auth.signUp({email, password, options:{data:{role:"client", full_name}}})` creates the `auth.users` + `profiles` (role hard-coded `'client'` server-side via the `handle_new_user()` trigger reading `raw_app_meta_data`, **never** the client-supplied form data) + `client_profiles` rows immediately — the account exists in the DB **before** phone is verified.
- **Role is not client-settable anywhere** — this was an explicit security fix (migrations `0051_fix_signup_role_escalation.sql`, `0055_handle_new_user_role_via_app_metadata.sql`) closing a prior privilege-escalation gap. A mobile client must never be trusted to declare its own role.
- **Email verification**: Supabase's own signup-OTP (`verifyOtp(type:"signup")`) — but this step only appears if the Supabase dashboard's "Confirm email" setting is enabled; if disabled, `signUp()` returns a session immediately and this step is skipped entirely. **Environment-dependent, not guaranteed by code alone.**
- **Phone verification**: nominally mandatory, OTP-verified via MSG91 for both the manual-signup flow and the Google-OAuth `PhoneGateModal` gate (below) — **but currently bypassable**. Both `SignupForm.tsx` and `PhoneGateModal.tsx` ship a "Skip for now (demo — MSG91 not verified yet)" button, explicitly marked `TEMPORARY` in code comments (pending MSG91 KYC approval), which saves the typed phone number **unverified** through the same code path as a verified save. **Current actual behavior: phone is collected but verification is optional in practice; the intended target behavior (non-skippable) should be what a mobile rebuild implements, with this discrepancy flagged.**
- **Google OAuth signup/login** (shared flow — Supabase doesn't distinguish new vs. returning): `signInWithOAuth({provider:"google"})` → `/auth/callback` exchanges the code, looks up `profiles.role` for that user, routes to that role's dashboard. A brand-new Google sign-in always lands as `client` (no pre-existing coach/admin profile could exist to match) — this is the enforcement point preventing self-granted elevated roles via OAuth. Google signups skip email OTP (already verified by Google) but still lack a phone number, which triggers the **PhoneGateModal**.
- **PhoneGateModal**: a full-screen, non-route-based blocking modal shown on every `/client/*` page whenever `profiles.phone` is null. Comment in code: "Only Google OAuth signups can reach this state — SignupForm.tsx's manual-signup path requires a phone before an account even exists." Two-step (enter phone → OTP), with the same temporary skip bypass described above.
- **Login**: `/login/client` → `signInWithPassword` → explicit `profiles.role` check (`if role !== 'client': signOut() + error "This account isn't registered as a client. Log in with the correct account, or use the right portal."`) — a deliberate UX fix so a wrong-portal login doesn't show a silently-stuck "Signing in…" button; `middleware.ts` still separately enforces the role boundary regardless.
- **Not implemented**: "Forgot password" (button present in `LoginForm.tsx`, no `onClick` handler wired — non-functional), email change (no UI/action found anywhere), account deletion/deactivation (not found in this portal's code).

### 4.3 Pre-Purchase Client
Journey stage `marketing` / `demo_booked` / `demo_completed`. Full detail in §6.

### 4.4 Checkout
Client clicks "Purchase Plan" → Razorpay order created server-side → Razorpay Checkout.js hosted UI opens. Full trace in §7.

### 4.5 Payment
Razorpay Checkout collects payment. On success, the client-side callback receives `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` and calls `verifyPaymentAction` — **the only trusted fulfillment path; the client's own claim of success is never trusted server-side.** A webhook (`/api/webhooks/razorpay`) reconciles the rare case where the browser never gets to report success (tab closed, crash, lost network).

### 4.6 Post-Purchase Client
`awaiting_activation` → `/client/activate` (pick a start date, one-time, locked after) → `onboarding` (one-time medical/goals/measurement intake, first-time clients only) → `slot_selection` (pick a recurring weekly pattern) → `active`. Renewal clients take a parallel path: `renewal_checkin` → `renewal_scheduling` instead of `onboarding`/`slot_selection`.

### 4.7 Active Subscription
Full portal access: sessions, schedule, coach, chat, progress, concerns, notifications, subscription self-service (pause/resume). Still subject to the three portal-wide gates in strict precedence: phone-missing → measurement-stale → sessions-low.

### 4.8 Expired / Cancelled / Paused Subscription
- **Paused** (`subscriptions.status='paused'`, client-initiated, reversible via a "Resume" action): blocks new regular-session bookings (booking requires an `active` subscription); does **not** cancel already-booked upcoming sessions (no code path was found that touches `bookings` on pause) and does **not** block chat, coach view, progress, concerns, or profile.
- **Expired** (derived label only; underlying subscription rows are simply `inactive` or absent): occurs the instant a renewal's *new* subscription is activated (the old one is force-set to `inactive` atomically) — **never** a calendar-date expiry. A subscription that reaches 0 sessions remaining does **not** auto-transition status; it stays `active` showing 0 remaining until the client renews.
- **Cancellation** (of a plan/subscription itself, as distinct from pausing): **not implemented anywhere in the codebase.** No client-facing cancel-plan action exists.

## 5. Complete Client Portal Function Inventory

| Area | Screen/Component | Nav label | Pre-purchase? | Post-purchase? |
|---|---|---|---|---|
| Signup | `/signup` → `SignupForm.tsx` | — | Yes (visitor only) | N/A |
| Login | `/login/client` → `LoginForm.tsx` | — | Yes | Yes |
| Google OAuth | `GoogleAuthButton.tsx` + `/auth/callback` | — | Yes | Yes |
| Dashboard | `/client/dashboard` | Dashboard | Redirects away | Yes (main home) |
| Plans (marketing) | `/client/plans` → `PlansMarketingClient.tsx` | *(no nav entry — reached via CTA)* | Yes | Yes (renewal only) |
| Demo booking | `/client/demo-booking` → `DemoBookingClient.tsx` | *(no nav entry)* | Yes (if never demoed) | No |
| Plan activation | `/client/activate` → `ActivatePlanClient.tsx` | *(stage-gated, no nav)* | No | Yes (one-time gate) |
| Onboarding | `/client/onboarding` → `OnboardingFormClient.tsx` | *(stage-gated, no nav)* | No | Yes (one-time, first plan only) |
| Renewal check-in | `/client/renewal-checkin` → `RenewalCheckinClient.tsx` | *(stage-gated, no nav)* | No | Yes (renewal only) |
| Sessions | `/client/sessions` → `MySessionsClient.tsx` | My Sessions | Yes (empty/demo only) | Yes |
| Ad-hoc booking | `/client/book` → `BookSessionClient.tsx` | Book a Session (hidden once subscribed) | Yes (demo only) | Redirects to `/client/schedule` |
| Recurring schedule | `/client/schedule` → `ScheduleSetupClient.tsx` / `ChangeScheduleClient.tsx` | My Schedule | No | Yes |
| Subscription | `/client/subscription` → `MySubscriptionClient.tsx` | Subscription | Yes (empty state) | Yes |
| My Coach | `/client/coach` → `MyCoachClient.tsx` | My Coach | Conditional (demo coach only) | Yes |
| Chat | `/client/chats` → `ClientChatsClient.tsx` | My Chats (hidden until ≥1 conversation exists) | No | Yes |
| Progress | `/client/progress` → `ProgressClient.tsx` | Progress | Yes | Yes |
| Concerns | `/client/concerns` → `MyConcernsClient.tsx` | My Concerns | Yes | Yes |
| Notifications | `/client/notifications` → `NotificationsClient.tsx` | Notifications | Yes | Yes |
| Profile | `/client/profile` → `ClientProfileClient.tsx` | Profile | Yes | Yes |
| Logout | Portal shell control | Logout | Yes | Yes |
| Phone gate | `PhoneGateModal.tsx` (portal-wide overlay) | — | Conditional (phone missing) | Conditional |
| Measurement gate | `MeasurementGateModal.tsx` (portal-wide overlay) | — | Conditional (stale ≥7d) | Conditional |
| Sessions-low gate | `SessionsLowGateModal.tsx` (portal-wide overlay) | — | N/A | Conditional (≤5 remaining) |

"Book a Session" is **hidden from nav** once the client has an active subscription (`hideBookSessionNav`) — the recurring-schedule flow becomes the only booking mechanism; direct navigation to `/client/book` while subscribed hard-redirects to `/client/schedule`.

Cross-cutting overlays rendered by the portal shell on every page (`src/app/client/layout.tsx`), computed in parallel on each load, strict precedence order (only one shown at a time):
1. **`PhoneGateModal`** — phone missing.
2. **`MeasurementGateModal`** — no measurement logged in ≥7 days.
3. **`SessionsLowGateModal`** — active subscription has ≤5 sessions remaining.

Per-function detail (inputs, business logic, backend dependency, error handling, state changes) is given in the dedicated module sections below (§6–§16) and the screen-by-screen spec (§22), rather than repeated as a flat 13-column table here — cross-reference by screen name.

## 6. Pre-Purchase Functionality

| Function | Available pre-purchase? | Detail |
|---|---|---|
| Register | Yes | Email+phone+password, or Google OAuth |
| Login | Yes | Email/password or Google, role-checked against `profiles.role` |
| Verify mobile/email | Yes, nominally mandatory | Email OTP (Supabase, env-dependent) + phone OTP (MSG91); phone OTP is currently **skippable** (temporary flag, §4.2) |
| Complete profile | Partial | Name/phone collected at signup; goals/equipment/medical-notes/photo editable any time via Profile, not gated by purchase state |
| View onboarding | No | Onboarding form is only reachable once a subscription is `active` (post-purchase, pre-activation-complete clients cannot see it either) |
| View plans | Yes | `/client/plans` — behind login, lists all `package_tiers` where `is_active=true` |
| Compare plans | Yes | Card grid: session count, price, original price/savings, feature bullets, "Most Popular" highlight |
| View pricing | Yes | Real prices from `package_tiers.price` |
| View offers/coupons | No | Not implemented anywhere in the code |
| Start checkout | Yes | "Purchase Plan" → Razorpay order |
| Make payment | Yes | Razorpay Checkout (card/UPI/etc.) |
| View payment status | Partial | Inline errors only during checkout; no payment history before a first purchase (Subscription page shows "No Subscription Found") |
| Apply coupon | No | Not implemented |
| Contact support | Yes | "My Concerns" (`/client/concerns`) works with no plan required |
| Access sessions | Conditional | Only a **free demo/assessment session** is bookable pre-purchase; no ongoing sessions until a plan is purchased |
| Access diet | N/A | Feature does not exist in this app |
| Access subscription page | Yes (empty state) | "No Subscription Found" + CTA, or a "Demo Package — Expired" summary card if a demo was completed |
| Access coach | Conditional | Only the auto-assigned demo coach, shown as a simplified read-only card (no change-request capability), until a real plan is active |
| Access chat | No | Nav item hidden entirely; a conversation is only created once a coach is assigned via a recurring slot or booking, which requires a subscription |
| Access progress | Yes | Weekly measurement logging works pre-purchase — it is in fact a prerequisite gate for booking a demo |

## 7. Purchase & Checkout Workflow

```
Client on /client/plans clicks "Purchase Plan"
  │
  ▼
createPackagePurchaseOrderAction(packageId)
  → createPackagePurchaseOrder() [payments.service.ts]
      • requires role=client
      • REJECTS if client already has a subscription with status in ('active','awaiting_activation')
        UNLESS the active one has sessions_remaining <= 5 (the renewal exception — see §9)
        error: "You already have an active or pending plan."
      • looks up package_tiers (must be is_active=true)
      • createRazorpayOrder(price, receipt) → Razorpay Orders API (amount converted to paise)
      • inserts a `payments` row: purpose='package_purchase', status='created', razorpay_order_id
      • returns {orderId, amountPaise, currency, keyId} to the browser
  │
  ▼
Razorpay Checkout.js opens (hosted payment UI)
  │
  ▼ (on Razorpay success callback: {razorpay_order_id, razorpay_payment_id, razorpay_signature})
verifyPaymentAction(orderId, paymentId, signature)
  → verifyAndFulfillPayment() [payments.service.ts] — THE ONLY TRUSTED FULFILLMENT PATH
      • loads the payments row by razorpay_order_id, confirms it belongs to this client
      • idempotent: already 'paid' → no-op success; status not 'created' → reject
      • verifies HMAC-SHA256(order_id|payment_id, RAZORPAY_KEY_SECRET) signature SERVER-SIDE
        → mismatch: sets payments.status='failed', throws "Payment verification failed -- signature mismatch."
      • on valid signature → purchaseMyPlanForClient():
          - re-checks no blocking existing subscription (renewal exception still applies)
          - inserts a subscriptions row: status='awaiting_activation', sessions_total=package.sessions_count
          - logs timeline event 'plan_purchased'; notifies client (in-app + email: template `plan_purchased_client`)
      • updates the payments row: status='paid', paid_at, subscription_id
      • ON FULFILLMENT FAILURE AFTER MONEY CAPTURED (e.g. a race condition): payments.status=
        'paid_unfulfilled'; client is told "Your payment was received, but we couldn't finish setting
        things up automatically... contact support with reference {orderId}." NO automatic refund.
  │
  ▼
"Congratulations!" modal (plan name + feature list) → client clicks "Understood" → redirect to /client/dashboard
  │
  ▼
Dashboard's journey-state gate reads stage='awaiting_activation' → auto-redirects to /client/activate
```

**Webhook reconciliation** (`POST /api/webhooks/razorpay`, `payment.captured` event): verifies a *separate* webhook signature (HMAC over the raw request body with `RAZORPAY_WEBHOOK_SECRET`), then calls `fulfillPaymentByWebhook()` — a server-to-server-only path (no user token) that repeats the same subscription-creation logic if the client-side callback never fired. No-ops if the payment is already resolved. Always returns HTTP 200 to Razorpay even on internal failure (marks `paid_unfulfilled` instead of leaving Razorpay retrying indefinitely).

**Demo booking has no payment step at all** — free, confirmed immediately (`bookDemoSessionAction` → `confirmDemoBooking`), bypassing Razorpay entirely. A dormant Razorpay demo-payment code path exists in `payments.service.ts` (`createDemoSessionOrder`) but is unreachable from any current UI — **not** an active feature.

## 8. Post-Purchase Functionality

Immediately after `awaiting_activation` is reached, the client is funneled to `/client/activate`:
- Single input: start date, must be **at least tomorrow** (IST business-day rule, same restriction pattern as session booking's same-day rule).
- **One-time and locked**: a second activation attempt on the same subscription throws "This plan has already been activated."
- On confirm: `subscriptions.status → 'active'`, `activated_at = startDate`. **Renewal side effect, atomic with this step**: any other subscription for this client still `status='active'` is force-set to `'inactive'` — this is the entire mechanism behind "old plan superseded by renewal"; there is no separate cancellation step.
- Then, in order: onboarding (if never submitted, first-time only) → renewal-only steps (`renewal_checkin`/`renewal_scheduling`, if applicable) → recurring schedule setup → full `active` portal access.

**What becomes newly available after purchase + activation:**
- Ongoing session booking via the recurring schedule (the one-off `/client/book` wizard becomes inaccessible/redirects).
- "My Coach" upgrades from empty/demo-simplified to a full profile card with coach-change-request capability.
- "My Chats" — a conversation is auto-created the moment a coach is linked via a recurring slot or booking (`ensureConversationForCoachAssignment`); the nav item, previously hidden, appears.
- Full Subscription page: plan name, sessions used/remaining, pause/resume control, pause-days balance, payment history list.
- Progress module was already accessible pre-purchase, but now also feeds "Progress Since Day 1" dashboard comparisons anchored to the onboarding submission's baseline measurements.

## 9. Subscription Module — Deep Analysis

### Pre-purchase
`/client/subscription` branches on journey stage **before** calling `getMySubscriptionAction`:
- `demo_completed` → static "Demo Package" card, badge "Expired", session date shown, "Amount: Free", CTA "Choose Your Plan".
- `marketing` / `demo_booked` → "No Subscription Found" empty state (copy varies slightly), CTA "Choose Your Plan".
- Any other stage → the real `MySubscriptionClient` render (below).

### Post-purchase — fields actually rendered (`MySubscriptionView`)
```
status               "active" | "paused" | null   (never shows raw 'awaiting_activation' here — that stage redirects away first)
packageName          string | null
sessionsTotal / sessionsUsed / sessionsRemaining   (integers, from `subscription_usage_view` — a derived
                                                     Postgres view, NOT stored columns)
pauseDaysAllowed / pauseDaysUsed   (numeric, days)
payments[]           { packageName, saleDate, amount }[]  — sourced from `sales_view`, NOT the raw
                                                              `payments` table directly
```
**Not rendered anywhere on this screen:** start date, end date, purchase date, coach name, renewal date, invoice/receipt download link.
**Not observable:** whether `sales_view` includes demo-session line items or only package purchases.
**Important nuance for mobile parity**: `sessionsRemaining` shown here is a **display-only** figure from `subscription_usage_view`, computed differently from the number actually enforced at booking time. The real booking-time gate (`confirm_booking()`, migration `0053`, detailed in §10) counts bookings with status `upcoming OR completed` against `sessions_total` — a mobile app must implement that exact counting rule at the point of booking, not just recompute or trust this display value, or it risks allowing overbooking.

### Pause / Resume (client self-service)
- **Pause**: only from `status==='active'`; sets `status='paused'`, `paused_at=now()`. Notifies both client and coach. Blocks new session bookings (booking requires an `active` subscription). Does **not** touch already-booked upcoming sessions.
- **Resume**: only from `status==='paused'`; sets `status='active'`, `resumed_at=now()`.
- **Pause-days balance**: `pause_days_allowed` (per-subscription, sourced from `package_tiers.default_pause_days`, admin-adjustable) vs. `pause_days_used` — the latter is **derived live** from paired `pause_started`/`pause_ended` timeline events (an open/unresumed pause counts elapsed time up to "now"), never a stored counter. **Not enforced as a hard limit** — nothing in the read code blocks pausing once the allowance is exhausted; it is informational display only.

### Renewal (deep trace)
- **Trigger conditions** — both independent of any calendar date:
  1. `SessionsLowGateModal` — shown whenever the active subscription's `sessions_remaining` is between 1 and the constant `SESSIONS_LOW_THRESHOLD = 5`. "Renew Now" → `/client/plans`.
  2. The purchase-gate exception itself: a client with an active subscription can still complete a *second* purchase (creating a new `awaiting_activation` row) specifically because `sessions_remaining <= 5` — this is what makes "Renew Now" functionally possible at all.
- Once the new subscription is activated (§8), the old active one is retired to `inactive`, and two renewal-only journey steps each run exactly once:
  - **`renewal_checkin`** — only if this is not the client's first-ever subscription AND no `progress_logs` row exists since the new subscription's `activated_at`. Shows the full historical measurement chart untouched plus a fresh-baseline entry form; this specific flow bypasses the normal once-a-week client self-log rate limit.
  - **`renewal_scheduling`** — only if no `recurring_slots` row is billed against the *new* subscription id yet. Offers "Keep My Schedule" (carries over the exact days/time/coach in one click) or "No, Change It" (full pattern picker, with Same/New trainer options and a gender preference sub-step when choosing "New" — no "no preference" option on renewal, unlike first-time setup).
- Staff (admin/coach) also see a wider **Renewal Opportunity** flag at `sessions_remaining <= 10` (`RENEWAL_OPPORTUNITY_THRESHOLD`), deliberately wider than the client's own 5-session trigger so staff see it coming first. A `converted` flag (client has ever had >1 subscription row) is used as staff-side proxy for "has renewed before."

### Expiry / Pause / Cancellation from the client's perspective
- No stored "expired" status exists at the database level; the label is purely derived (`deriveClientStatus`) for a client with subscription history but nothing currently `active`/`paused`/`awaiting_activation`.
- No calendar-based expiry anywhere — subscriptions never expire by date, only by session count reaching 0, and reaching 0 does not itself trigger any status change.
- No client-initiated full cancellation of a plan exists (as distinct from pause).

### Payment history / receipts
List-only view (package name, date, amount) on the Subscription page. **No downloadable invoice/receipt** was found in the client-facing code. The `jspdf`/`jspdf-autotable` npm dependencies exist in `package.json` but were not traced into any client-portal payment UI — **not observable** whether they're used elsewhere (e.g., admin reports).

## 10. Session Module — Deep Analysis

> This module was independently verified by a dedicated research pass in addition to the general subscription/payments trace; both agree on the structure below.

### Before purchase
- `/client/sessions` is reachable regardless of plan status — renders whatever bookings exist, which for a pre-purchase client is empty or a demo only.
- `/client/book` (the ad-hoc single-session wizard) is only meaningfully usable pre-plan for the **free demo/assessment**: `demo_booked` stage shows an "already booked" card; `demo_completed` shows a rate-your-demo gate before funneling to Plans; `marketing` shows a "No Subscription Found" state with both "Book Free Demo" and "Choose Your Plan" CTAs.
- Once subscribed, `/client/book` **redirects to `/client/schedule`** (server-side, on direct navigation too, not just a hidden nav link).

### After purchase — full state model
```
bookings.status       ∈ { upcoming, completed, cancelled, missed }
bookings.session_type ∈ { assessment (demo/first real session), regular }
```
- The **first session ever with a real (non-demo) coach is always `assessment` type** — free, does not count against the package, 60 minutes. Every subsequent booking is `regular`, 45 minutes, and requires an existing `active` subscription with unused credit (see "Credit enforcement" below).
- **Creation paths**: (a) the one-off `/client/book` wizard — usable **only** for the client's very first (free assessment) session; the page itself redirects to `/client/schedule` the moment a subscription id exists on the client's journey state, so it's unreachable once a recurring pattern exists, (b) the recurring-schedule engine auto-generating occurrences from the client's weekly pattern, (c) demo booking (`confirmDemoBooking`).
- **Missed**: a background sweep (`mark_missed_bookings` Postgres RPC) runs opportunistically on every booking-list read (dashboard, sessions page) — not a cron — flipping any `upcoming` booking whose time has passed to `missed` if attendance was never marked present. It can also be set explicitly when a coach marks attendance "Absent" (`status='missed', no_show_party='client'`).
- **Completed**: only reachable via the coach's two-step post-session workflow — `markAttendance('present'|'late')` then `submitSessionNotes()` (notes are mandatory to close out a session). **A client cannot mark their own session completed.**
- **Cancelled** (client-initiated): `cancelSessionAction` → RPC `cancel_booking`; a cutoff is enforced (default **12 hours** before start, admin-configurable via `settings.cancellation_cutoff_hours`) for clients but **not** for admins. Releases the slot, deletes any Zoom meeting, notifies the coach and all admins. If the cancelled booking belonged to a recurring slot, `cancel_booking` immediately generates **one replacement occurrence** to backfill it.
- **Rescheduled**: client picks a new time within a rolling **30-day window**, capped at **2 reschedules per calendar week** (Monday-start week, counted from `session_rescheduled` timeline events rather than a stored counter), default **1-hour** cutoff before start (admin-configurable via `settings.reschedule_cutoff_hours`), and cannot double-book another session on the same IST calendar day. All four of these limits are enforced for the `client` role only — admin overrides everything. Three reschedule UI paths: the client's own coach's open-slot grid, "Fastest Available" (soonest open slot across every active coach), or a specific requested time that falls back to up to 3 **substitute coaches** for that one session only. When a substitute is used, `reschedule_booking` updates `bookings.coach_id` directly on that row while leaving `recurring_slot_id` untouched — which is exactly how later occurrences of the same recurring pattern keep going back to the original coach with no separate "revert" step. The old Zoom meeting is deleted; a new one is lazily created on next join. The client is **always** notified of their own session moving, regardless of who initiated the change.
- **Rating**: only for `completed` sessions — two dimensions (session quality + trainer rating, 1–5 stars each) plus an optional text note, capped at **once per week across all sessions** (any booking rated in the last 7 days blocks a new rating — a global weekly rate limit, not per-session). Submitting recomputes the coach's aggregate `rating`/`review_count` immediately.
- **Join mechanism**: the Zoom meeting is created lazily on first join attempt (`ensureZoomMeetingForBooking`), not at booking time — idempotent, reuses the existing link if already created, one shared business Zoom account (not per-coach). "Join" stays disabled unless a countdown window says it's joinable AND a join URL exists AND the client's measurements aren't stale. If Zoom env vars aren't configured, "Join" stays disabled with "Join link not ready yet" rather than breaking the page. A separate "coach session join gate" (migration `0047`, a `bookings.coach_joined_at` column) exists but is **coach-side only** — it gates when a coach can mark attendance, not anything on the client's join experience.
- **Coach continuity / shadow coaching**: a session can carry a temporary "Shadow Coach" badge when an active shadow-coach assignment covers that coach + date range (primary coach on leave) — client sees "Covering for {primaryCoachName} while they're away" with a one-time acknowledgeable notice, surfaced as a banner on `/client/sessions`.
- **Cross-module gate**: booking a demo, booking a regular session, and joining a session are all blocked **server-side** (not just UI-disabled) while the client's measurements are stale — *"Please update your measurements before booking a session."*

### Recurring schedule: coach-matching algorithm (`scheduling.service.ts`)

Coach assignment is a **side effect of scheduling**, not a separate step the client performs.

- **First-time / no-preference matching** (`findAvailableCoach`): resolves the target weekday set from the chosen pattern (or validates a custom 2–5 day selection, rejecting Sunday: *"Sunday is a holiday and isn't available for scheduling."*), pulls all `active` coaches (optionally filtered by gender), and sorts them by a utilization view **ascending — least-busy coach first**. Returns the **first** coach in that order for whom every day in the pattern is free at the requested time. This is a strict lowest-utilization-first search, not a ranked shortlist — there is no "second-best" surfaced to the client.
- **Known/preferred-coach matching ladder** (`matchRecurringPattern`, used for schedule changes/renewals): for **standard patterns** (3-day pairs or 6-day) it tries, in order: (1) the exact requested pattern at the preferred time, (2) the exact pattern at any other time on the availability grid, (3) a **fallback to alternate day-pairings** (e.g. Tue/Thu/Sat instead of Mon/Wed/Fri) at the preferred time, then (4) those alternate pairings at any other grid time. **Custom patterns (2–5 client-chosen days) have no pairing fallback** — only steps (1)–(2) apply; if neither matches, the search returns no result.
- **A known internal nuance**: the pattern-level "is this coach free" check (`isDayTimeFreeForCoach`) only verifies the slot sits inside the coach's weekly availability template and doesn't collide with another client's existing recurring commitment for that exact day/time. **It does not check coach leave or actual booked/held sessions** — that real conflict check only happens later, per calendar occurrence, when bookings are actually generated (below). So a schedule can be confirmed as "matched" and still have specific future weeks quietly skipped.
- **Turning a matched pattern into actual bookings** (`generate_bookings_from_recurring_slot`, a Postgres function): starts from tomorrow and walks forward one calendar day at a time (not week-by-week), generating a booking on each date matching the slot's weekday, until either the requested count (4 for a normal setup, 1 when backfilling a cancellation) is reached or **60 calendar days** have been scanned. Each candidate date is skipped — silently, no error — if the coach has approved leave that day, a booking already exists for that slot, or a real scheduling conflict exists. **This means it is possible for fewer than the requested number of sessions to actually be created for a "confirmed" schedule, with no client-facing signal that generation came up short** — flagged in §29 as a real gap worth deciding whether to fix in the mobile rebuild rather than silently port.

### Credit / session-count enforcement (migration `0053`, inside `confirm_booking()`)

This is the actual server-side gate on regular-session booking, and it is **stricter and differently-computed than the "sessions remaining" number shown on the Subscription page** (§9) — a distinction a mobile rebuild must preserve exactly:

- `confirm_booking()` runs inside one transaction, row-locking both the temporary slot hold and the target `subscriptions` row.
- It counts existing bookings for that subscription with `status IN ('upcoming', 'completed')` — **deliberately including `upcoming`**, not just `completed` — and rejects with *"No sessions remaining on this package"* if that count has already reached `sessions_total`.
- By contrast, the `sessions_remaining` figure shown to the client on `/client/subscription` (`subscription_usage_view`) is a **display-only** metric computed differently (effectively completed-usage-based). **The enforcement check and the display number are not the same computation** — a mobile app must implement the booking-time check exactly as above (counting upcoming + completed against the total), not simply trust or recompute the display figure, or it will allow a client to overbook their package.
- The check is skipped entirely when no subscription is attached (demo/assessment bookings are always exempt).
- The migration itself exists because an earlier version of this function only checked that *a* subscription existed, never counted usage against it — and because Postgres's `CREATE OR REPLACE FUNCTION` doesn't replace a function whose parameter list differs, an old zero-credit-check overload had to be explicitly `DROP`ped first to close the hole. (Noted here only as historical context — not something to reproduce.)

### Reminders
A scheduled job (`/api/cron/session-reminders`, `CRON_SECRET`-protected) emails (not push, not SMS) both client and coach roughly 6 hours before each `upcoming` session with the join link, guarded by a `reminder_sent_at` column so it fires at most once per booking regardless of how often the job runs. This is the only purely time-triggered notification in the app.

## 11. Diet / Plan Module

**Not observable — this feature does not exist in the current application.** No diet, meal-plan, nutrition, or food-tracking table, screen, action, or service was found anywhere in the codebase (checked `supabase/migrations/`, `src/lib/services/`, `src/app/client/`). The closest functional analogues, confirmed by direct code inspection:

- **Coach session notes** (`workout_notes` table, one row per completed booking): the coach records `notes` (free text — labeled internally as the "Session Summary" field per migration `0021`'s own comment), `homework`, plus (added later) `exercises_performed`, `performance_rating`, `improvements[]`, `additional_remarks`. **The client only ever sees the plain `notes` field** — confirmed by tracing `client-portal.actions.ts:109-129` (`toSessionView` maps `coachNotes` from a `notesByBooking` map built by `listMyWorkoutNotes`, i.e. `workout_notes.notes`) — surfaced read-only, labeled "Coach notes," on both the Sessions page and the Progress page. The client never sees `homework`, `exercises_performed`, `performance_rating`, `improvements`, or `additional_remarks`, and has no edit access (RLS grants the client `select`-only on `workout_notes`).
- **Progress/measurement logs** (`progress_logs` table): client-authored weekly self-report — weight (kg), body fat %, muscle %, waist/chest/hip/arms/thigh (inches), plus an optional free-text note. This is the closest thing to a "tracked plan" in the app. A `photo_url` column exists on this table in the schema, but **no client UI writes it** — progress-photo upload is not an implemented feature despite the column's existence.
- **Rate limit**: client self-service logging is capped at **once per 7 days**, server-enforced (`"You've already submitted a measurement update this week -- next update available in a few days."`); admin logging on the client's behalf and the renewal check-in flow both bypass this cap.
- **The measurement gate**: `MeasurementGateModal` is shown whenever the last log is missing or >7 days old; it is dismissible via a "Skip for now" button, but skipping does **not** waive the downstream server-side block on booking a demo, booking a regular session, or joining a session (§10) — the modal is a UX nudge layered on top of an independently-enforced rule, not the enforcement mechanism itself.
- **Trends**: a full historical chart plus a "Latest Measurements" card and a day-one-vs-latest comparison (the latter's exact rendering location on the Progress screen itself was not conclusively traced — it clearly exists as data, used at least on the Dashboard).
- **Download/share/PDF export**: **not observable** in the client Progress module's code — no reference to `jspdf` found there.

If a mobile spec requires an actual diet/nutrition module, it must be built as **new functionality with no web-app precedent to preserve** — treat this as an explicit product gap, not an omission in this document.

## 12. Coach Module

- **Pre-purchase / no-coach state**: shown when the client has neither a recurring-slot coach nor an upcoming demo booking — *"You'll be matched with a coach automatically once you book a free demo session or choose a plan."* with a "Book Free Demo Session" CTA.
- **Demo-coach state**: once a demo booking exists and is `status='upcoming'`, the auto-assigned demo coach (matched by a lowest-utilization ranking algorithm — the client never picks) is shown in a simplified card: no bio grid, no "Request Coach Change" button, copy explains this is a temporary assignment for the demo only. Once the demo is no longer upcoming (completed/missed) and no plan is purchased, the coach reverts to the no-coach state — a deliberate design choice per code comments, not a bug.
- **Full coach card (post-purchase, real recurring coach)**: name, photo, specialization, bio, certifications[], languages[], years of experience, aggregate rating + review count — sourced from `coach_profiles`/`profiles`.
- **Coach-change request workflow (client-initiated)**:
  1. Client submits a request (reason — required; overall-experience rating and coach rating — optional, 1–5 stars each; additional comments — optional). Button is disabled while a request is already `pending`. Requires an existing current coach — throws if the client has none.
  2. Admin resolves (out of this portal's scope) → `approved` (with an immediate replacement coach already chosen — fast path) | `approved` (no replacement chosen yet — `needsCompletion=true`) | `rejected`.
  3. Client-visible states: `pending` → yellow "under review" banner, old coach stays assigned; `rejected` → red banner, client keeps the old coach, no further action; `approved` + coach already set → green "complete" banner; `approved` + `needsCompletion` → client picks days (multi-select, Sun–Sat) + one time-of-day, clicks "Find Available Coach" → the system searches for a match (excluding the current coach) → shows one matched coach + day/time, or *"No coach is available for that day/time -- try a different combination."* → client confirms → `completeCoachChangeAction`.
  4. **`completeCoachChange` mechanics**: cancels all active `recurring_slots` with the old coach and cancels their still-`upcoming` bookings (reason logged as "Client changed coaches"), creates new recurring slots against the new coach/pattern, logs a `coach_changed` timeline event, and finalizes the request row with the new coach id.
  5. **Coach change also switches the chat relationship**: the old conversation is closed (frozen, read-only forever) and a new one is opened with the new coach — see §16.

## 13. Profile & Account

| Field | Editable by client | Required | Collected | Affects other modules |
|---|---|---|---|---|
| Full name | Yes | Yes (signup) | Signup | Portal identity, coach/admin views |
| Email | **No** (no UI to change it) | Yes (signup) | Signup | Login identity |
| Phone | Yes | Yes (mandatory, OTP-verified at signup; gated post-hoc for Google signups via `PhoneGateModal`) | Signup or PhoneGateModal | SMS notifications |
| Password | Yes (separate "Change Password" modal, Supabase `updateUser`, ≥8 chars, client-side confirm-match check) | Yes (signup) | Signup | Login |
| Profile photo | Yes (upload to Supabase Storage `avatars` bucket, path `{userId}/{uuid}.{ext}`) | No | Optional | Shell identity card, coach-facing views |
| Goals (tags) | Yes | No | Profile edit | Display only — not read by any booking/matching logic traced |
| Equipment (tags) | Yes | No | Profile edit | Display only |
| Medical notes (profile-level) | Yes | No | Profile edit | Display only (distinct from the one-time onboarding medical fields) |
| Height / weight | **No** (read-only on the Profile page) | Weight required at onboarding; height optional | Set once via Onboarding, correctable afterward only by admin | BMI calculation |
| BMI | Derived, not editable | — | Computed from height + weight | Display only |
| Active package name | Read-only display | — | Derived from active subscription | — |
| Emergency contact | **Not exposed on the client Profile screen at all** | — | — | The `profiles.emergency_contact` column exists (migration `0023`) but per that migration's own comment is surfaced only on the **coach's** profile screen, not the client's |

**Onboarding form** (`client_onboarding`, one-time, insert-once — enforced at both the RLS layer and in application code, which throws *"Onboarding has already been submitted -- contact support to make changes."* if a row already exists): age, gender, height (cm) — optional; **weight (kg) — required**; body fat %, muscle %, waist/chest/hip/arms/thigh (in) — optional; **fitness goal — required**, one of 5 enum values; medical conditions/injuries/medications/exercise restrictions — free text, optional. If any measurement field was filled in, submission also inserts a "Day 1" `progress_logs` row (a deliberate duplication: the onboarding record is the static demographic snapshot, the progress log is the time-series anchor for later trend charts). Only an admin can update onboarding data after initial submission — the client cannot correct it themselves.

**Not implemented anywhere in this portal**: forgot-password flow, email-change UI, account deletion/deactivation.

## 14. Payment & Purchase History

Covered in full in §7 and §9. Summary of what's real vs. not:
- **Real**: Razorpay order creation, server-side signature verification (both the checkout-callback path and the webhook path), a `payments` ledger table (`created` / `paid` / `failed` / `paid_unfulfilled`), a client-visible payment history list (package name / date / amount only).
- **Not implemented**: coupons/discounts/promo codes, refunds (no action, no table), invoice/receipt downloads in the client portal, subscription cancellation, calendar-based renewal reminders (session-count-based only).
- **Failure/edge handling that is real**: signature mismatch → hard fail, no charge is ever trusted client-side; payment captured but fulfillment code throws → `paid_unfulfilled` status + a support-escalation message carrying an order-id reference, with no silent loss of the payment record and no automatic refund.

## 15. Notifications

All notifications are **event-triggered** (fired inline from the service function that caused them) except session reminders, which are the one **time-based** exception (scheduled job). Every notification also writes an in-app `notifications` row via `createFromTemplate`, which interpolates a stored `notification_templates` row. The `notification_type` enum has only **4 coarse values** (`booking | reminder | feedback | system`); differentiation between ~30+ distinct events is done via a free-text `template_key`, not the enum. A `channels` jsonb column exists on the schema "for a future dispatcher" but no code was found reading or writing it — **it is currently vestigial**; in-app/email/SMS dispatch is done directly and separately by each calling service.

| Trigger | Recipient | Channel(s) | Notes |
|---|---|---|---|
| Plan purchased | Client | In-app + Email | `plan_purchased_client` |
| Plan activated | Client | In-app + Email | `plan_activated_client` |
| Subscription paused/resumed | Client + Coach | In-app + Email | Both parties notified |
| Session booked (regular) | Client + Coach | In-app + Email; **client also SMS** | MSG91 template `session_booked` |
| Demo booked | Client + Coach | In-app + Email; client also SMS | MSG91 template `demo_booked` |
| Session cancelled (by client) | Coach + all Admins | In-app + Email | The cancelling client is not re-notified of their own action |
| Session cancelled (by coach/admin) | Client | In-app + Email | |
| Session rescheduled | Client (always) + Coach (if client- or admin-initiated) + Admins (if client-initiated) | In-app + Email; client also SMS | MSG91 `session_rescheduled` |
| Attendance marked present/absent | Client + Coach | In-app + Email; client also SMS | MSG91 `attendance_present`/`attendance_absent` |
| Session reminder (~6h before) | Client + Coach | Email only | No SMS, no push; cron-driven, deduped via `reminder_sent_at` |
| New chat message | The other participant | In-app only | Preview text truncated to 80 chars; no email path |
| Progress/measurement updated | Client's current coach | In-app only | Only fires for a genuine client self-update, not an admin backfill |
| Coach-change request approved/rejected (no immediate replacement) | Client | In-app + Email | |
| Schedule changed / coach changed | Client | In-app + Email; SMS | MSG91 `schedule_changed`, `coach_changed` |
| Shadow coach assigned | Client (in-app + email) and the shadow coach (in-app + email) | In-app + Email | Two separate templates, one per recipient |
| Escalation raised (with a linked coach) | That coach | In-app + Email | `escalation_raised_to_coach` |
| Escalation resolved | Client | In-app + Email | `escalation_resolved_client`; a separate `resolution_notes` field is also shown inline on the Concerns screen |

**No push notifications and no WhatsApp integration exist anywhere in the code.** A mobile app introducing push notifications is new functionality, not a port of existing behavior — it should be designed to mirror the *trigger and recipient* list above, since that logic (not the channel) is what must be preserved.

SMS is India-DLT-gated (MSG91 Flow API, one approved template ID per event via `MSG91_TEMPLATE_ID_<EVENT>` env vars) and **coaches never receive SMS, only email** — by design, confirmed by code structure, not an oversight.

## 16. Communication / Coach Interaction

- **Chat**: genuine real-time messaging via Supabase Realtime (`postgres_changes` on `messages` INSERT/UPDATE — not polling). Text and/or a single image attachment per message (at least one of body/attachment required by a DB constraint). Images upload directly to a Supabase Storage bucket (`chat-attachments`, public-read, write restricted to conversation participants by folder = conversation id).
- **One active conversation at a time**, enforced by a partial unique index at the database level (`conversations_one_active_per_client ... where status='active'`) — not just application logic. A coach change **closes** the old conversation (`status='closed'`, frozen and read-only forever, full history preserved) and opens a new one with the new coach; past/closed conversations are listed under a collapsible "Past Coaches" section, each viewable read-only with *"This coach is no longer assigned to you — you can still see this history."*
- **Read receipts**: WhatsApp-style single check (sent) vs. double check (read), driven by a `read_at` timestamp settable only by the *recipient*, enforced by RLS. Auto-marks read when a thread is open or a live message arrives from the other party.
- **Restriction on sending is enforced at the RLS layer, not just the UI** — inserting into a `closed` conversation, or from a caller who isn't the conversation's current client/coach, is rejected by the database itself.
- **Every sent message triggers an in-app notification** to the recipient (best-effort; a failure never blocks the send).
- No reactions, no message editing/deleting, no typing indicators, no group chat — strictly one-to-one client↔coach, text + one image at a time. A static hardcoded emoji picker (~30 emoji) is the only "rich" input feature.
- **No in-app call/video-call feature** — video only happens via the Zoom join link on a scheduled session (§10); there is no client-initiated call/video request outside of a booked session.
- **Support/concerns** (`/client/concerns`) is the sanctioned non-chat support channel, explicitly positioned in the UI as *"no WhatsApp or email required."* Raising a concern requires a fixed category (one of: `slot_not_available`, `coach_missed_session`, `need_schedule_change`, `payment_issue`, `technical_issue`, `want_coach_change`, `other`) plus an optional free-text description; no plan/subscription is required to use it. Status moves `open → in_progress → resolved`, transitions are **admin-only**, and — a hard internal rule the client never sees directly — an admin cannot change status or edit details until they've logged a phone call with the client (`called_client_at` must be set first). The client sees an append-only, admin-authored "Updates from LEANR" notes trail throughout, plus a distinct green "Resolution" callout once resolved. The client has **no** ability to edit, cancel, or delete a raised concern once submitted (insert-only from the client's RLS perspective).

## 17. Access Control

| Function | Pre-Purchase | Active Subscription | Paused | "Expired" (no live subscription) |
|---|---|---|---|---|
| Profile | Yes | Yes | Yes | Yes |
| Subscription page | Yes (empty state) | Yes (full view) | Yes (full view + Resume CTA) | Yes (empty state, re-purchase CTA) |
| Plans / Purchase | Yes | Blocked, unless `sessions_remaining <= 5` | Not specially blocked (inherits the same "existing active/awaiting plan" rule) | Yes (fresh purchase) |
| Demo booking | Yes, if never demoed | No (already past this stage) | No | Independently keyed off "has any demo booking ever," not directly off subscription state — the exact intersection with a fully-lapsed client was not conclusively traced; treat as **inferred** |
| Regular session booking | No (assessment/demo only) | Yes | **No** (requires `status='active'`) | No |
| Recurring schedule setup/change | No | Yes | Not observed to be specially blocked | No |
| My Coach (full profile + change request) | No (demo-coach simplified card only) | Yes | Yes (not observed to be blocked) | Depends on whether a coach relationship still resolves |
| Chat | No (nav hidden, no conversation exists) | Yes | Yes (conversation persists) | Conversation only becomes read-only if the coach relationship is explicitly changed, not merely because the plan lapsed |
| Progress / measurements | Yes | Yes | Yes | Yes |
| Concerns / support | Yes | Yes | Yes | Yes |
| Notifications | Yes | Yes | Yes | Yes |
| Pause / Resume control | N/A | Yes (Pause) | Yes (Resume) | N/A |

## 18. State Management

Two layered models — full detail in §4:
1. **`ClientJourneyStage`** — routing/gate logic, 9 states, server-derived fresh on every relevant page load, no client-side caching.
2. **`ClientStatus`** — 6-bucket display label (`not_paid | demo | created | active | paused | expired`), priority-ordered, primarily staff-facing but derivable client-side too if a mobile app wants a single "your status" chip.

Underlying DB enum `subscription_status`: `active | inactive | paused | awaiting_activation` (the last value added by a later migration on top of the original three). `booking_status`: `upcoming | completed | cancelled | missed`. **No "expired" value exists at the database level for either enum** — it is purely a derived label.

## 19. Data Relationships

```
profiles (1 per auth user; role ∈ client|coach|admin)
  │
  └── client_profiles (1:1)
        │
        ├── client_onboarding (0:1, one-time, immutable by the client after insert)
        │
        ├── subscriptions (1:many; at most ONE may be 'active' or 'awaiting_activation' at a time,
        │     at most one may be 'paused'; any number remain 'inactive' historically)
        │     ├── package_tiers (many:1 — the plan definition: name, sessions_count, price, features)
        │     └── (implicit) subscription_usage_view — derived sessions_used/sessions_remaining
        │
        ├── payments (1:many; each row optionally FKs the subscription or booking it fulfilled)
        │
        ├── bookings (1:many; coach_id, session_type, status; regular sessions FK a subscription_id)
        │     ├── attendance (1:1 per booking)
        │     └── workout_notes (1:1 per booking)
        │
        ├── recurring_slots (1:many; the weekly pattern; each FKs a subscription_id and a coach_id —
        │     this FK is what "which subscription does this pattern bill against" means for renewal gating)
        │
        ├── progress_logs (1:many; client-authored measurement history, independent of any booking)
        │
        ├── coach_change_requests (0:many; pending/approved/rejected)
        │
        ├── escalations / concerns (0:many; open/in_progress/resolved) + escalation_notes (1:many per escalation)
        │
        ├── conversations (1:many, but effectively 1 active + N closed — one per coach relationship)
        │     └── messages (1:many per conversation)
        │
        └── notifications (1:many; user_id = profiles.id — this table is shared across all roles)
```

Access/status control lives primarily on **`subscriptions.status`** (gates regular-session booking, chat existence indirectly via coach assignment, and the journey stage), and secondarily on **`client_onboarding` existence** and **`recurring_slots` existence** (both gate journey-stage progression). `package_tiers` and `payments` never gate access directly — only the `subscriptions` row they produced does.

## 20. Pre-Purchase → Post-Purchase Transformation

```
SUBSCRIPTION
Before:   No subscription row at all (or only historical/inactive ones with a fresh purchase pending).
Event:    Razorpay payment signature verified server-side.
After:    New `subscriptions` row, status='awaiting_activation', sessions_total=package.sessions_count.
          (NOT yet 'active' — a separate start-date confirmation step is required.)
New data: Package name, total session count.
New access: None yet — the client is funneled straight to /client/activate; nothing else unlocks until
          that completes.
UI:       Subscription page moves toward eventually showing the full plan card, but only after activation.
Backend:  subscriptions row created; payments row flips created→paid with subscription_id attached;
          timeline event 'plan_purchased' logged; client notified.
Dependency change: The journey-state gate now routes every page load to /client/activate until resolved.

ACTIVATION
Before:   subscriptions.status='awaiting_activation', activated_at=null.
Event:    Client confirms a start date (≥ tomorrow, IST).
After:    status='active', activated_at=chosen date. Any other still-active subscription for this client
          (the renewal case) is atomically force-retired to 'inactive'.
New access: Onboarding (if first-time) or renewal-checkin/scheduling (if renewal) become the next gate;
          eventually, full active-portal access.
UI:       Redirect chain continues automatically based on the recomputed journey stage.
Backend:  subscriptions row updated; a superseded renewal subscription's status flips; timeline event
          'plan_activated'; client notified.

ONBOARDING (first-time only)
Before:   No client_onboarding row.
Event:    Client submits the one-time medical/goals/measurement intake form.
After:    client_onboarding row created (immutable by the client thereafter); if any measurement field
          was filled in, a "Day 1" progress_logs row is also planted so Progress/Dashboard trend charts
          have a real anchor point.
New access: Journey stage advances past 'onboarding' toward slot_selection/active.

RECURRING SCHEDULE
Before:   No recurring_slots row billed against the current subscription.
Event:    Client picks a weekly pattern (standard 3-day / 2-day pairing / custom 2–5-day, Sunday always
          excluded), optionally a trainer preference (renewal/change flows only), system matches an
          available coach for that pattern.
After:    recurring_slots row(s) created against this subscription_id; upcoming bookings auto-generated
          from the pattern.
New access: 'active' journey stage reached — full steady-state portal.
UI:       Dashboard/Sessions populate with real upcoming sessions instead of empty states; "Book a
          Session" nav item disappears; "My Coach" upgrades to the full profile + change-request card;
          "My Chats" nav item appears (conversation auto-created).

SESSIONS / COACH / CHAT (aggregate view)
Before:   Sessions page empty or demo-only; Coach page empty or demo-coach card; Chat nav hidden.
After:    Ongoing regular sessions bookable/visible; full coach profile + change-request capability;
          persistent real-time chat thread with the assigned coach.
```

## 21. Complete Workflow Diagrams

### Registration
```
Visitor → /signup → fill name/email/phone/password
   → Supabase signUp() (role:'client' set server-side, never client-supplied)
   → session already exists? → skip to phone-otp : run email-otp step first
   [email-otp] → verifyOtp(type:'signup') → phone-otp step
   [phone-otp] → sendPhoneOtpAction (MSG91) → client enters code → verifyPhoneOtpAction
        → setMyPhoneAction (writes profiles.phone) → redirect /client/plans
   (TEMPORARY: "Skip for now" on phone-otp bypasses verification, saves the number unverified —
    pending MSG91 KYC approval)
```

### Login
```
/login/client → signInWithPassword() → look up profiles.role
   → role !== 'client'? → signOut(), show "not registered as a client" error
   → role === 'client' → redirect /client/dashboard
(Google OAuth: /auth/callback exchanges code → looks up profiles.role → routes to that role's
 dashboard; a brand-new Google sign-in always lands as 'client' since it has no pre-existing
 coach/admin profile to match.)
```

### Pre-Purchase
```
marketing stage → /client/plans (browse) → optionally /client/demo-booking (free, no coach picked,
   auto-matched by a lowest-utilization active-coach algorithm) → demo_booked → [session happens]
   → demo_completed → rate the demo (optional) → back to /client/plans
```

### Purchase (full detail in §7)
```
Select plan → Razorpay order created server-side → Checkout → signature verified server-side
   → subscription created (awaiting_activation) → congratulations modal → /client/dashboard
```

### Post-Purchase Activation
```
awaiting_activation → /client/activate (pick start date, locked once set) → active
   → onboarding (first-time) OR renewal_checkin + renewal_scheduling (renewal)
   → slot_selection (first-time) → active (steady state)
```

### Subscription (pause/resume)
```
active --[client: Pause Plan]--> paused --[client: Resume Plan]--> active
(paused blocks new regular-session bookings; existing upcoming bookings untouched)
```

### Session (booking → lifecycle)
```
[pattern-matched recurring slot generates an occurrence, OR ad-hoc /client/book wizard]
  → upcoming
  → [coach joins + marks attendance after session end]
       present/late → [coach submits notes] → completed
       absent       → missed (no_show_party='client')
  → [OR, before session end, client actions]
       cancel (>cutoff hours) → cancelled
       reschedule (>cutoff hours, <2/week, within 30-day window) → upcoming (new time), was_rescheduled=true
  → [OR, time passes with no attendance marked] → missed (background sweep on next read)
```

### Diet
Not applicable — feature does not exist. See §11.

### Coach Communication
```
Coach assigned (via recurring slot or booking) → conversation auto-created
  → client/coach exchange text+image messages in real time → read receipts on open
Coach change: client requests → admin approves/rejects → [if approved without a replacement]
  client picks new days/time → system matches a new coach → confirmed → new conversation becomes
  active, old one becomes closed/read-only forever
```

### Subscription "Expiry" (derived, not a real transition)
```
active (sessions_remaining reaches 0 — no calendar trigger involved) → stays "active" with 0
   remaining until the client purchases a renewal (allowed specifically because remaining <= 5)
   → new subscription awaiting_activation → activated → old one flips to inactive
   → the client's overall ClientStatus label reads "expired" only in the gap between having no
     active/paused/awaiting subscription and completing a new purchase
```

### Cancellation / Refund
Not implemented at the plan/subscription level. Session-level cancellation is covered in the Session diagram above. No refund workflow exists anywhere in the code.

## 22. Screen-by-Screen Functional Specification

For each screen, "Mobile representation" suggests how to carry the *function* into a native mobile pattern — not a copy of the web layout.

### Dashboard
- **Purpose**: single-glance status + fastest path to the next action.
- **Access**: any authenticated client; content varies entirely by journey stage.
- **Pre-purchase state**: redirects away (to Plans/Demo-status screens) rather than rendering a dashboard shell.
- **Post-purchase state**: package name + status, sessions ring (used/total/remaining), pause-days remaining, next-session card (Join CTA gated on countdown + measurement freshness), stat tiles (completed count, streak weeks, package % progress), Day-1-vs-latest measurement deltas, recent completed sessions with a coach-notes preview.
- **API/data dependency**: `getClientDashboardAction`, `getMyJourneyStateAction`, `getMyProgressAction` (fetched in parallel).
- **Loading/empty/error**: server-rendered, no explicit skeleton observed; errors render as an inline `EmptyState` with the thrown message; empty sub-states are covered by the stage branches themselves.
- **Mobile representation**: a home-tab with a hero "next session" card, a ring/gauge widget, and a horizontally-scrollable stat row — no redesign risk to the underlying data contract.

### Plans (Marketing)
- **Purpose**: plan discovery + purchase entry.
- **Access**: any authenticated client (functionally most relevant pre-purchase or when renewal-eligible).
- **Data**: `MarketingPlan[]` from `listMarketingPlansAction`.
- **Actions**: Purchase Plan (→ Razorpay), Book Free Demo (nav).
- **Error state**: inline text under the button on order-creation failure; Razorpay failures surface via its own callback.
- **Mobile representation**: card carousel or vertical list; payment should use Razorpay's native mobile SDK (or a WebView wrapping Checkout.js) — the order-creation/signature-verification contract must not change.

### Subscription
- Full detail in §9. **Mobile representation**: a single "My Plan" screen — status pill, progress bar, collapsible payment-history list, and Pause/Resume as one context-sensitive button — no change to what triggers what.

### My Sessions
- Tabs: Upcoming/Completed/Cancelled/Missed. Each upcoming card shows cancel/reschedule buttons, disabled past their respective cutoffs, with the exact cutoff timestamp shown. Shadow-coach banner with a one-time "Acknowledge" dismissal.
- **Mobile representation**: segmented control or swipeable tabs; cutoff countdowns fit well as a small "X hours left to cancel" chip.

### Book a Session (pre-schedule only)
- 3-step wizard: intro (assessment framing or "your coach" card) → schedule (slot grid) → confirm. Post-booking success screen with "View My Sessions" / "Back to Dashboard".
- **Mobile representation**: a linear stepper; the slot grid becomes a scrollable date/time picker.

### My Schedule
- One component (`ScheduleSetupClient`) with mode-driven differences for first-time setup vs. change vs. renewal (trainer-preference step, gender-preference sub-step, "keep as-is" shortcut for renewal). Pattern picker: 3 standard patterns → "more options" reveals 2-day pairings or a fully custom 2–5-day selection (Sunday always excluded) → hour picker → availability check → confirm.
- **Mobile representation**: a native day-of-week chip selector + hour-wheel picker is a natural fit. The "no match found" fallback (retry vs. "Notify Support") must be preserved verbatim as a business rule.

### My Coach
- States: no coach / demo-coach (simplified) / full coach card with a change-request flow (pending / approved-needs-completion / approved-complete / rejected banners).
- **Mobile representation**: a profile screen with a persistent "Request Change" affordance; the approved-needs-completion sub-flow (day/time picker → search → confirm) is its own mini-wizard, same as web.

### Progress
- Weekly-update gate banner (mirrors the portal-wide `MeasurementGateModal`), stat tiles (completed sessions, weekly-update status), latest-measurement grid, historical chart, session-history list with coach-notes previews.
- **Mobile representation**: a log-entry FAB + chart screen; the once-a-week rate limit is server-enforced and must remain so — don't just hide the button client-side.

### My Chats
- One active thread + collapsible past threads (read-only). Text + single image attachment, read receipts, real-time delivery.
- **Mobile representation**: standard native messaging UI; push-notification-on-new-message is genuinely new capability (the web app has none) and should hook the same `sendMessage` trigger.

### My Concerns
- List + "Raise a Concern" sheet (category dropdown + free-text description). Status badges (open/in_progress/resolved), admin progress notes shown inline, a distinct resolution note once resolved.
- **Mobile representation**: ticket-list + compose sheet; no change to the underlying lifecycle or the admin-side "must have called the client" resolution gate.

### Notifications
- Flat reverse-chronological list, unread = accent-colored + dot, tap-to-mark-read.
- **Mobile representation**: a standard notification-center screen — also the natural place to surface native push for the same trigger set (§15).

### Profile
- View + a single "Edit Profile" sheet (name, phone, photo upload, goals/equipment tags, medical notes) + a separate "Change Password" sheet.
- **Mobile representation**: standard settings/profile screen; photo upload maps directly to a native image picker feeding the same Supabase Storage upload call.

### Activate Plan / Onboarding / Renewal Check-in
- Each is a single-purpose, non-skippable, one-time gate screen reached only via a stage-redirect, with no nav entry.
- **Mobile representation**: a full-screen modal/stepper presented immediately post-login whenever the stage demands it — must not be reachable or skippable via deep link or back-navigation once its underlying condition (e.g. `activated_at` already set) is no longer true.

## 23. API / Backend Dependencies

**No public REST/GraphQL API is exposed for third-party or mobile-native consumption today.** All business logic runs through Next.js **Server Actions** (`"use server"` functions), callable only from this Next.js app's own client bundle via Next's internal RPC mechanism — not a stable, versioned HTTP contract. **This is the single biggest architectural fact a mobile rebuild must confront**: either (a) stand up a real API layer that wraps these same service functions, or (b) have the mobile app talk to Supabase directly (using the same RLS policies) for reads, plus call a small set of new HTTP endpoints for privileged writes (payment verification, subscription mutations) that currently rely on `supabaseAdmin` + server-only secrets (Razorpay key secret, Zoom credentials, MSG91 key) that must never ship inside a mobile client binary. The two real HTTP endpoints that already exist and are directly reusable: `POST /api/webhooks/razorpay` (server-to-server, not client-facing) and the session-reminders cron route (cron-only). Everything else is a Server Action with no independent URL.

Third-party dependencies: Supabase (Auth/DB/Storage/Realtime), Razorpay (Orders API + Checkout + webhooks), Zoom Server-to-Server OAuth (meeting creation), Resend (email), MSG91 (SMS + OTP, India DLT-gated).

## 24. Validation & Error Handling

Consistent patterns observed across the whole portal:
- Every server action returns `ActionResult<T>` (`ok(data)`/`fail(error)`); `runAction()` wraps the body so **no server action throws to the caller** — the UI always gets a typed success/failure.
- Money/signature verification never trusts the client (§7) — the same principle should extend to any mobile-native payment SDK integration.
- Time-sensitive actions (cancel/reschedule/activation start date) re-validate cutoffs **server-side** even though the UI also disables the button — a mobile app must not rely on client-side disabling alone.
- Rate limits are enforced server-side with clear user-facing messages (e.g. "you've already submitted a rating this week," "maximum reschedule limit for this week," "you've already submitted a measurement update this week").
- Idempotency is explicit wherever money/state duplication risk exists (payment verification, webhook fulfillment).
- Fail-soft is the norm for auxiliary systems (Zoom, email, SMS) — a broken integration never blocks the primary action (booking, cancellation, etc.); it logs and continues.

## 25. Edge Cases

| Edge case | Observed behavior |
|---|---|
| Payment successful but subscription not immediately visible | `paid_unfulfilled` payment status; client shown a support-escalation message with an order reference; no auto-retry, no auto-refund |
| Payment failed (signature mismatch) | `payments.status='failed'`, clear error, no subscription created, no charge trusted |
| Payment pending (browser closed mid-checkout) | Webhook reconciliation (`fulfillPaymentByWebhook`) picks it up if Razorpay confirms `payment.captured` server-side |
| Subscription paused | New session booking blocked; existing upcoming sessions untouched; chat/coach/progress unaffected |
| Subscription "expired" (no live sub, has history) | Subscription page shows the purchase CTA again; booking blocked; the exact demo-booking-gate interaction for this specific case is not fully resolved (§17) |
| Session cancelled past cutoff | Button disabled client-side and rejected server-side if forced; exact cutoff timestamp shown to the client |
| Session missed | Auto-detected either by a coach marking "Absent" or by the background sweep once the scheduled time has passed with no attendance marked |
| Coach changed (shadow, temporary) | One-session temporary coverage shown with an acknowledgeable banner; a permanent change requires the formal Coach Change Request flow |
| Coach change (permanent) | Old recurring slots/bookings cancelled, new ones created; old chat conversation closed (read-only forever), new one opened |
| Diet unavailable | N/A — feature doesn't exist |
| Coach has not logged session notes yet | Sessions/Progress pages simply show no "Coach notes" line for that session — no explicit "not yet available" message observed |
| No upcoming session | `NextSessionCard` renders an empty state with a "Go to My Schedule" CTA |
| Client has multiple plans | Only one can be `active`/`awaiting_activation`/`paused` at a time by construction; historical ones sit as `inactive` forever, surfaced only in the payment-history list |
| Client renews plan | Full trace in §9/§20 |
| Client purchases another plan while already active | Blocked unless `sessions_remaining <= 5` (the renewal exception) |
| Client logs in from a new device | Not specially handled — standard Supabase session/cookie auth, no device-binding or "new device" notification observed |
| Account not verified (phone) | The `PhoneGateModal` blocks nothing except itself being dismissed — it does not block other actions. **Currently skippable** due to the temporary MSG91-not-verified flag; the code's own stated intent is for this to become a hard, non-skippable block once MSG91 KYC is approved |
| Measurements stale (≥7 days) | Blocks: booking a demo, booking a regular session, joining a session. Does **not** block: viewing any page, chatting, raising concerns, viewing subscription/profile |
| Network/API failure | Every server action catches internally and returns a typed failure the UI renders as an inline error/empty state — no unhandled crash path observed in the traced code |
| Google OAuth signup with no phone | `PhoneGateModal` forced open on every portal page until resolved (or skipped, per the temporary bypass) |
| Recurring schedule matched but coach has intervening leave/conflicts on some dates | Generation function silently produces fewer than the requested number of upcoming sessions; no error surfaces to the client (§29) |
| Client books right up against their package's session limit | Server-side count of `upcoming + completed` bookings against `sessions_total` blocks the booking with "No sessions remaining on this package" even if the client-facing "remaining" display (a differently-computed, display-only figure) still showed a nonzero number a moment earlier |

## 26. Mobile App Implementation Requirements

### A. MUST REMAIN THE SAME
- The `ClientJourneyStage` state machine and its exact evaluation order (§4).
- The `ClientStatus` derivation priority (§4).
- Purchase → payment-signature-verification → subscription-creation sequence, including "never trust client-reported payment success" and the `paid_unfulfilled` failure path (§7).
- Subscription status semantics: `active | inactive | paused | awaiting_activation`, no calendar expiry, session-count-driven only.
- The renewal exception threshold (`sessions_remaining <= 5`) and the old-subscription-retirement-on-new-activation behavior (atomic).
- Pause/Resume semantics and pause-days derivation (computed from timeline events, not a stored counter).
- The booking state machine (`upcoming/completed/cancelled/missed`), attendance-then-notes gating for completion (client cannot self-complete a session), cutoff hours (cancellation 12h default, reschedule 1h default, both admin-configurable), max 2 reschedules/week, 30-day reschedule window, no-double-booking-per-day rule.
- Session rating: two dimensions, once-per-week global cap.
- The measurement-staleness gate (7 days) and everything it blocks (demo booking, session booking, session join) — server-enforced, not just UI.
- Role assignment: always server-controlled, never client-supplied (security-critical — this closed a real prior vulnerability).
- The coach-change request lifecycle (pending → approved-needs-completion | rejected → resolved) and its cascading effects (recurring slots, bookings, chat conversation).
- The notification trigger/recipient list (§15) — the channel can change (push instead of/alongside email/SMS) but *when* something fires and *who* it goes to must not.
- All rate limits (progress-log once/week, rating once/week, reschedule twice/week) and their underlying meaning (the limit itself, not necessarily the literal error string).
- The access-control matrix (§17).
- The one-active-conversation-per-client chat rule and the fact that closed conversations are permanently read-only.

### B. CAN CHANGE FOR MOBILE
- Navigation model (tab bar vs. sidebar), screen layout, step-wizard presentation (full-screen vs. inline), card design, typography, color system.
- Payment UI (native Razorpay mobile SDK instead of Checkout.js in a browser) — as long as the same server-side order-creation + signature-verification contract is preserved.
- Chat UI (native messaging patterns; push notifications for new messages are genuinely new capability, not a port).
- Any of the gate modals (phone/measurement/sessions-low) can become native bottom sheets or onboarding-style full-screen steps, as long as their blocking conditions and precedence order are preserved.
- Notification presentation (native push channel), as long as trigger/recipient logic is preserved.

### C. MUST NOT CHANGE (compatibility-breaking if altered)
- The definition of when a subscription is bookable (`status==='active'` only) — loosening this breaks pause semantics.
- The one-time, locked nature of plan activation and onboarding submission.
- The signature-verification trust boundary for payments — a mobile app must never create a subscription client-side "optimistically" before server verification.
- The distinction between `session_type='assessment'` (free, first-ever) and `'regular'` (paid-package-backed) — conflating them breaks both the free-demo economics and the "no active subscription" booking guard.
- The renewal old-subscription-retirement side effect timing — must happen atomically with the new subscription's activation, not before or after.

## 27. Web vs Mobile Differences

Since the web app has no push notifications, no offline mode, and no native payment SDK, a mobile rebuild's *additive* differences (new capability, not a behavior change) should be: push notifications mirroring §15's trigger list, a native Razorpay SDK instead of a WebView, and possibly local caching of read-only reference data (plan list, coach profile) for offline viewing — none of these change any business rule stated above. This section is a recommendation, not an observed web-app behavior.

## 28. MUST PRESERVE vs CAN CHANGE

Consolidated in §26 (A/B/C) to avoid duplication.

## 29. Unknown / Unobservable Behavior

- Whether `sales_view` (the client payment-history source) includes demo-session line items, or only package purchases.
- Whether the `jspdf`/`jspdf-autotable` dependency is used anywhere to generate a client-visible invoice/receipt — not found in the traced client-portal code; may be admin-only or entirely unused.
- The exact behavior when a client with an "expired" status (no live subscription, has history) attempts to book a free demo again — the demo gate and the subscription gate are evaluated somewhat independently and this exact intersection was not conclusively traced.
- The full content/trigger list of `notification_templates` beyond the keys actually referenced in the traced action/service files — additional templates may exist that weren't exercised by any code path read in this pass.
- Whether the day-one-vs-latest progress comparison is rendered directly on the Progress screen itself, or only on the Dashboard — both consume the same underlying data, but the exact screen placement wasn't conclusively confirmed for the Progress screen.
- Any admin-side reporting/analytics that might reuse client-portal data — explicitly out of scope for this document, not investigated.
- Whether the Supabase dashboard's "Confirm email" setting is actually enabled in the live production environment (this is infrastructure configuration, not something visible in the code).

**Two confirmed product gaps (not "unknown" — verified present in code), flagged for a build decision rather than silent replication:**
- **Recurring-schedule generation can silently under-deliver.** `generate_bookings_from_recurring_slot` scans up to 60 calendar days trying to place the requested number of sessions (usually 4), skipping any date blocked by coach leave, an existing booking, or a real scheduling conflict. If fewer than requested end up placeable, the function simply returns fewer rows — no exception, no signal to the client that their "confirmed" schedule has gaps. A mobile rebuild should decide whether to preserve this silently or surface a warning when the generated count is short.
- **The recurring-pattern match check is weaker than the real per-booking conflict check.** `isDayTimeFreeForCoach` (used when matching/confirming a weekly pattern) only checks the coach's availability template and other clients' recurring commitments — it does not check coach leave or actual booked sessions. That real check only happens later, per calendar occurrence, inside the generation function above. These are two sides of the same underlying gap.

## 30. Final Implementation Checklist

```
AUTHENTICATION
☐ Email+phone+password signup replicated, with mandatory (non-skippable in production) email OTP + phone OTP
☐ Google OAuth signup/login replicated, routing purely by profiles.role
☐ Role is always server-assigned, never accepted from the client (security-critical)
☐ Role-mismatch login rejection replicated ("not registered as a client")
☐ Post-OAuth phone-completion gate (PhoneGateModal) replicated
☐ Password change (via Supabase updateUser or equivalent) replicated
☐ (Explicitly not present in web app: forgot-password flow, email-change UI, account deletion — do not
  invent these unless product decides to add them as new functionality)

PURCHASE
☐ Plan discovery (package_tiers, is_active filter) replicated
☐ Purchase-gate rule replicated: block a second purchase unless the existing active sub has
  sessions_remaining <= 5
☐ Payment-provider order creation + a payments ledger row created before any checkout UI is shown
☐ Server-side signature verification as the ONLY trust boundary for fulfillment
☐ paid_unfulfilled failure path + support-escalation messaging replicated (no silent loss, no auto-refund)
☐ Webhook/server-to-server reconciliation path replicated for the browser-closed-mid-payment case
☐ Free demo booking (no payment) replicated as a fully separate flow

SUBSCRIPTION
☐ awaiting_activation → activate (locked, one-time, ≥ tomorrow) → active sequence replicated
☐ Renewal old-subscription-retirement side effect replicated (atomic with new activation)
☐ Pause/Resume (client-initiated) replicated, including pause-days derivation from timeline events
☐ No calendar-based expiry; session-count-only "expired" derivation replicated
☐ Payment history list (name/date/amount) replicated
☐ Sessions-low renewal-nudge trigger (sessions_remaining 1..5) replicated

CLIENT SERVICES
☐ Session booking (assessment-first-then-regular rule) replicated
☐ Cancellation cutoff (default 12h, admin-configurable) replicated, admin-bypass replicated
☐ Reschedule rules replicated: 1h default cutoff, 2/week cap, 30-day window, no-double-booking-per-day,
  optional substitute coach for a single session
☐ Attendance-then-notes gating for "completed" status replicated (client cannot self-complete a session)
☐ Missed-session detection (time-passed sweep + explicit coach "Absent" marking) replicated
☐ Credit enforcement replicated exactly as coded: count bookings with status IN (upcoming, completed)
  against subscription.sessions_total at booking-confirm time — this is NOT the same number as the
  display-only "sessions remaining" figure; do not substitute one for the other
☐ Recurring-schedule generation gap (dates silently skipped for coach leave/conflicts, no shortfall
  signal to the client) — decide deliberately whether to replicate silently or improve with a warning;
  do not treat "schedule confirmed" as a guarantee of the full requested session count
☐ Session rating (2 dimensions, once/week global cap) replicated
☐ Video-join lazy-creation + measurement-staleness join-block replicated
☐ Recurring schedule setup/change/renewal (pattern picker, trainer/gender preference, "keep as-is"
  shortcut) replicated
☐ Coach-change request lifecycle (pending/approved-needs-completion/rejected) and its cascading
  effects (slots, bookings, chat conversation switch) replicated
☐ Chat (1 active + N closed conversations, real-time delivery, read receipts, single image attachment,
  DB-enforced one-active-conversation rule) replicated
☐ Progress/measurement logging (once/week cap, 7-day staleness gate, client sees only workout_notes.notes
  not the full coach record) replicated
☐ Concerns/escalation lifecycle (open/in_progress/resolved, admin notes visible pre-resolution,
  admin-must-call-client internal gate) replicated
☐ Notification trigger/recipient list (§15) replicated onto whatever channel(s) the mobile app uses

ACCESS CONTROL
☐ Pre-purchase restrictions (§6, §17) replicated
☐ Post-purchase access unlocks (§8, §20) replicated
☐ Paused-plan restrictions (booking blocked, everything else open) replicated
☐ Gate precedence order (phone > measurement > sessions-low) replicated

DATA
☐ Client ↔ subscription ↔ package_tiers relationships replicated (§19)
☐ Client ↔ booking ↔ attendance/workout_notes relationships replicated
☐ Client ↔ recurring_slots ↔ subscription billing-attribution replicated (critical for the
  renewal-scheduling gate)
☐ Client ↔ progress_logs relationship replicated (independent of bookings)
☐ Client ↔ conversation ↔ coach relationship (1 active + N closed) replicated

EXPLICITLY OUT OF SCOPE (no web precedent — do not invent business rules for these)
☐ Diet/meal-plan/nutrition module — does not exist in the web app
☐ Coupons/discounts/promo codes — do not exist
☐ Subscription cancellation (as opposed to pause) — does not exist
☐ Refunds — do not exist
☐ Push notifications — do not exist (design as new, but mirror the email/SMS trigger list in §15)
☐ Progress-photo upload — schema column exists but no UI implements it; treat as a gap, not a hidden
  requirement, unless product explicitly wants it added
```
