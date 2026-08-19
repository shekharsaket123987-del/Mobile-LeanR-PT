# LEANR by Fitelo — Mobile App

Expo (React Native + TypeScript) client app. See `../LEANR_PT_MOBILE_PRD.md`
(functional/technical source of truth) and `../LEANR_PT_NEXTGEN_APP_PRD.md`
(UX/motivation-layer + brand spec) in the repo root for the full spec —
this project implements those, phase by phase.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in your Supabase project's URL +
   anon key (Project Settings → API in the Supabase dashboard). **This
   must point at the same Supabase project as the existing LEANR PT web
   app** ("LeanR PT" in the Supabase dashboard) so Auth users, `profiles`
   rows, and RLS policies are shared, not duplicated — see PRD §4/§27.
   A working local `.env` already exists in this checkout (gitignored,
   never committed) pointing at that real project.
3. `npx expo start` — press `i` (iOS simulator), `a` (Android emulator), or
   scan the QR with Expo Go.

Without a `.env`, the app still boots (you'll see a console warning) but
every Supabase call will fail — useful for UI-only iteration, not for
testing auth.

## Schema verified against the real database (2026-08-17)

Every table/column/RPC this app touches has now been confirmed by direct
introspection of the real "LeanR PT" Supabase project (`information_schema`,
`pg_constraint`, `pg_proc`, `pg_policies`) — not guessed from PRD prose.
This replaced a large number of `VERIFY`-flagged guesses across the
codebase, several of which were **wrong** and would have failed silently
or outright against real data:

- **The identity model was wrong everywhere.** `auth.uid()` = `profiles.id`,
  but every business table (`bookings`, `subscriptions`, `recurring_slots`,
  `progress_logs`, `workout_notes`, `conversations`) references
  `client_profiles.id` / `coach_profiles.id` — separate primary keys on
  extension tables, linked back to `profiles` via their own `profile_id`
  column. Every query in earlier phases used the raw auth uid directly,
  which would have returned silently empty results against the real
  schema. Fixed via `src/lib/data/identity.ts`
  (`getMyClientProfileId`/`getMyCoachProfileId`), used everywhere a query
  needs "my" client/coach id.
- **RPC parameter names were wrong.** `cancel_booking`/`reschedule_booking`
  take `p_`-prefixed params (`p_booking_id`, `p_cancelled_by`, etc.) —
  the earlier unprefixed names (matching the PRD's prose, not its actual
  signature) would have failed outright. Fixed in `src/lib/data/bookings.ts`.
- **Several table/column names were wrong**: the plans table is
  `package_tiers` (not `packages`), price is a plain numeric amount (not
  integer paise), `progress_logs` columns are `weight`/`notes` (not
  `weight_kg`/`note`), `subscriptions` has no `sessions_used` column at
  all (now derived by counting completed bookings for that
  `subscription_id` — see `getSessionsUsedCount`), and `workout_notes`'
  main text column is `notes`/`performance_rating` (not
  `summary`/`performance`), plus it requires `client_id`/`coach_id`
  directly (now pulled from the booking, not re-resolved).
- **What was already right**: `bookings.duration_minutes`, `.coach_id`,
  `.attendance_overdue`, `.coach_joined_at`, `.zoom_join_url`,
  `.was_rescheduled`, `.no_show_party`, `.quality_rating`/`.trainer_rating`/
  `.rating_note`; `attendance.booking_id`; `workout_notes.booking_id`;
  the `cancel_booking`/`reschedule_booking` RPC *names* and their non-`p_`
  logical shape. All confirmed correct as originally guessed.
- **`signUpWithPassword` no longer inserts anything itself** — a real
  `handle_new_user()` trigger on `auth.users` already creates the
  `profiles` row (with a sensible `full_name` default) AND the matching
  `client_profiles`/`coach_profiles` row based on role. The manual upsert
  this app used to do was redundant; removed.
- **Verified against live data, not just schema**: every rewritten query
  was re-run directly against a real client/coach pair with real bookings,
  a real subscription, and real progress logs, and returned correct,
  sane results through the full join chain (client → recurring_slots →
  coach_profiles → profiles).
- **RLS confirmed compatible** — worth noting explicitly:
  `bookings` SELECT is broadly "any authenticated user," not row-restricted
  by RLS, so the app-level `.eq('client_id', ...)` / `.eq('coach_id', ...)`
  filters this app adds are load-bearing for privacy, not just redundant
  defense-in-depth. Never drop them.
- **Chat schema is now known** (`conversations`/`messages` — see
  `src/lib/data/types.ts`) but the chat UI itself still isn't built; that's
  now a scoping decision, not a schema-risk blocker.
- **The booking wizard is now built** — see "Phase 5" below.

**Security note**: a `service_role` key was shared in chat during this
verification pass and used only transiently (schema introspection via
the Supabase management connection, never written to any file in this
repo) — recommend rotating it in the Supabase dashboard regardless, since
it's now in a chat transcript.

## Phase status

- **Phase 0 — Foundation**: done. Brand theme tokens, "Ignition Reveal"
  launch animation, 5-tab client shell.
- **Phase 1 — Auth**: done and schema-verified. Email/password sign-in/
  sign-up via Supabase, session persisted encrypted (AES ciphertext in
  AsyncStorage, key in Keychain/Keystore via `expo-secure-store` — see
  `src/lib/supabase/large-secure-store.ts`), role-based routing
  (`(auth)`/`(client)`/`(coach)` route groups gate on session +
  `profiles.role` via `src/lib/auth/role-routing.ts`).
- **Phase 2 — Core client journey**: schema-verified and corrected. Home,
  Sessions (list + cancel), Coach (profile, via `recurring_slots`), and
  Progress (log + list) all confirmed working against real data. Still
  not built: chat UI (schema is known — see above; this is scope, not
  risk, now).
- **`LEANR_PT_MOBILE_PRD.md` §28 "Phase 5 — Booking Engine" (ad-hoc slice)**:
  built and schema-verified against the live `create_temporary_booking`/
  `confirm_booking` RPC signatures, `system_settings`, and the
  `coach_leave`/`coach_shifts`/`coach_availability` availability tables
  (all confirmed via direct introspection on 2026-08-17 — see
  `src/lib/data/booking-wizard.ts` for the exact query shapes). New
  screen: `src/app/(client)/book-session.tsx` — IST-correct whole-hour
  slot chips, hold->confirm with a live countdown, reachable from
  Sessions ("+ Book a Session") and Home ("Book a session" when no
  upcoming booking exists). `npx tsc --noEmit` and `npx expo lint` both
  pass; `npx expo export` compiles the bundle. **Not click-tested in a
  running app** — no mobile simulator is available in this environment,
  and the `expo start --web` target currently crashes during SSR
  (`window is not defined` in `LargeSecureStore.getItem`, pre-existing,
  unrelated to this feature — `src/lib/supabase/large-secure-store.ts`
  isn't guarded for the server-render pass of `web.output: "static"`).
  Explicitly out of scope for this slice, same file's header comment:
  recurring schedule setup (now built separately — see below) and
  **demo/assessment booking** (a different, partly-anonymous RPC path,
  `confirmDemoBooking`/`createAssessmentBooking`).
  Coach picking for a client with no assigned coach yet is a plain active-
  coach list, not the web app's lowest-utilization-first matching — noted
  as a simplification, not a schema gap.
- **`LEANR_PT_MOBILE_PRD.md` §28 "Phase 7 — Reschedule & Cancellation"**:
  cancel was already done; reschedule is now built too. New screen:
  `src/app/(client)/reschedule/[id].tsx`, reached from Sessions'
  "Reschedule" link on an upcoming session. Reads the live
  `reschedule_booking` RPC bodies directly (two overloads exist — this
  uses the 4-arg one that tracks `was_rescheduled`) rather than the PRD's
  prose description, and found the PRD overstates what's actually
  enforced server-side: only the cutoff/working-hours/conflict checks are
  real; the forward-window, weekly-cap, and same-day-only-once rules
  (§13 rules 7-9) aren't in the live function at all. The client
  deliberately doesn't invent stricter rules the server doesn't enforce —
  see `isAfterRescheduleCutoff`'s comment in `booking-wizard.ts`. Same
  verification/testing caveats as Phase 5 above (tsc/lint/export clean,
  not click-tested live).
- **`LEANR_PT_MOBILE_PRD.md` §28 "Phase 9" (chat slice)**: real-time
  client<->coach text chat, built into the Coach tab per
  `LEANR_PT_NEXTGEN_APP_PRD.md` §9.5's "unified Coach tab" (coach card +
  chat thread on one screen). `src/lib/data/chat.ts` — confirmed live on
  2026-08-18: `messages`/`conversations` RLS does all the enforcement (no
  RPC layer), `messages` is already in the `supabase_realtime` publication
  (no setup needed), and — importantly — **this app can never create a
  conversation**: there's no client/coach INSERT policy on `conversations`
  and no DB trigger auto-creates one, confirmed by live data showing some
  clients have one and some don't. So the Coach tab shows a conversation
  only if one already exists (admin-created), matching §10's "My Chats
  surfaces only if a chat has ever existed." Read receipts (WhatsApp-style
  single/double check) and realtime delivery both wired. **Image
  attachments are now built too** (added `expo-image-picker` — see
  below). Same verification/testing caveats as Phase 5/7 above.
- **Image attachments (chat)**: photo-library picker (`expo-image-picker`,
  installed via `npx expo install` for SDK-correct versioning — no camera
  capture, device library only) wired into the Coach tab's chat input.
  Uploads to the `chat-attachments` bucket at
  `${conversationId}/${filename}` as an `ArrayBuffer`
  (`fetch(uri).arrayBuffer()`) — the standard Expo+Supabase pattern,
  since React Native's `Blob` support is unreliable enough that
  Supabase's own docs recommend this over passing a `Blob` directly. The
  bucket's own upload RLS requires that exact path shape (first segment
  = a conversation you participate in), confirmed live on 2026-08-18. No
  captions alongside an image (image-only messages), no re-compression
  beyond the picker's own `quality: 0.7` — reasonable first-pass cuts,
  not gaps. `app.json` now has an `expo-image-picker` plugin entry
  setting the iOS/Android photo-permission strings; confirmed applied via
  `npx expo config --type introspect` (shows `NSPhotoLibraryUsageDescription`
  set correctly), not just assumed from adding the plugin block.
- **`LEANR_PT_MOBILE_PRD.md` §28 "Phase 9" (My Concerns slice)**: client
  can raise a concern and track its status (open/in progress/resolved),
  including any admin-added client-visible notes and the final
  resolution text once closed. `src/lib/data/concerns.ts` — confirmed
  live on 2026-08-18: a client can INSERT/SELECT their own `escalations`
  rows and SELECT (never write) `escalation_notes`, matching §3's "can
  only raise/request them, not resolve." Reached from More ("My
  Concerns"). `category` is free text in the live schema, not an enum —
  the chip set offered is an inferred, reasonable vocabulary (two of the
  five values are confirmed live: `technical_issue`, `other`), not a
  confirmed canonical list. Same verification/testing caveats as the
  phases above.
- **`LEANR_PT_MOBILE_PRD.md` §28 "Phase 9" (coach-change slice — completes
  Phase 9)**: this is the one place this pass found a genuine *structural*
  boundary, not just an unbuilt screen. §7e's client flow is actually two
  stages: (1) submit a reason, `status='pending'`, admin reviews; only
  once approved does (2) "pick your new schedule" -> Find Available Coach
  -> Confirm unlock and actually swap the coach. Stage 2
  (`completeCoachChangeAction` in the web app) is **not reproducible from
  this mobile-only repo**, confirmed live: `coach_change_requests` has no
  client UPDATE policy at all (only `coach_change_admin_all`), and
  closing/reopening the client's `conversations` row — which §20 says a
  completed coach change must do — is admin-only too. Both are the same
  class of problem as Razorpay payments (§8g): a privileged, multi-table
  server-side operation this app has no elevated context to perform.
  So `src/lib/data/coach-change.ts` / the Coach tab's new "Request Coach
  Change" card only build what RLS actually allows a client to do:
  submit a request (reason + optional 1-5 coach rating) and see its own
  request history/status (pending/approved/rejected). If approved, the
  card says so and explains the actual coach swap happens outside the
  app — same "explain the boundary, don't fake success" pattern as
  `plans.tsx`. Same verification/testing caveats as the phases above.

This completes all of §28 Phase 9 (Coach Change, Escalations, Chat) to
the extent buildable from this mobile-only repo.
- **`LEANR_PT_MOBILE_PRD.md` §28 "Phase 5 — Booking Engine" (recurring
  schedule slice)**: new screen
  `src/app/(client)/my-schedule.tsx`, reached from Sessions ("Manage my
  schedule"). Confirmed live on 2026-08-18: a "pattern" is actually N
  separate `recurring_slots` rows (one per weekday, no single "pattern"
  row exists), clients CAN insert/update their own `recurring_slots`
  directly (unlike coach-change stage 2), and
  `generate_bookings_from_recurring_slot(slot_id, count)` materializes
  the first real bookings per row. §13 rule 19 ("recurring collision
  check is leave-agnostic") is honored deliberately — this only checks
  the coach's permanent weekly template, never `coach_leave`, when
  picking a time; it also structurally *can't* check other clients'
  recurring_slots for collisions (RLS restricts SELECT to your own), so
  it leans on `generate_bookings_from_recurring_slot`'s own conflict
  check at generation time and reports back exactly how many of the
  requested 4 occurrences per day actually got confirmed, rather than
  assuming success. §15's 4-step matching ladder is simplified to one
  step: show every hour that works across all selected days, instead of
  a requested-time-first-then-fallback substitution the client wouldn't
  see happen. Same same-coach-only and verification/testing caveats as
  the other phases above — see `recurring-schedule.ts`'s header comment
  for the full detail.
- **`LEANR_PT_MOBILE_PRD.md` §28 "Phase 5 — Booking Engine" (demo-booking
  slice — completes Phase 5)**: new screen
  `src/app/(client)/demo-booking.tsx`, reached from Plans ("Book a Free
  Demo first"). Authenticated-client path only — books a free assessment
  session (`session_type='assessment'`, `amount_paid=0`) through the same
  hold->confirm pair as ad-hoc booking, generalized in
  `confirmHold`/`booking-wizard.ts` to support the 6-arg `confirm_booking`
  overload. The web app's other demo entry point,
  `createAssessmentBooking()`, is for anonymous prospects with no account
  at all, writing to a separate `assessment_sessions` lead table — every
  screen in this app assumes a logged-in role, so that's a structurally
  different, ungated route tree, deliberately out of scope (see
  `demo-booking.ts`'s header). Coach matching ("client never picks,
  sorted by utilization") is simplified to one pass: active coaches
  ranked by ascending upcoming-booking count, first one with an open
  slot on the chosen date wins. Same verification/testing caveats as the
  phases above. This completes §28 Phase 5 to the extent buildable from
  this mobile-only repo.
- **Phase 3 — Motivation layer**: schema-verified. `ProgressRing`/
  `StreakChip`/`CelebrationOverlay` all confirmed correct against real
  completed-booking data. Push notification **registration** works;
  **sending** still needs server-side code this repo can't provide, and
  the `push_tokens` table it writes to still doesn't exist (ready-to-run
  SQL below, not yet applied — a deliberate scope decision, not an
  oversight).
- **Phase 4 — Coach app**: schema-verified. Dashboard/Schedule/Clients/
  session workflow all confirmed against real data for a real coach — the
  client roster query correctly round-trips with the client-side "my
  coach" lookup. `attendance`/`workout_notes` writes use confirmed real
  columns.
- **`LEANR_PT_MOBILE_PRD.md` §28 "Phase 11 — Coach Portal Completion"
  (first slice)**: four new screens off the coach More tab —
  **Availability** (`src/lib/data/coach-availability.ts`): the coach's
  weekly hours are genuinely read-only by RLS (no coach INSERT/UPDATE
  policy on `coach_availability` at all, confirmed live — not just a UI
  choice), plus a "Request Leave" form backed by three real CHECK
  constraints (`ends_on >= starts_on`, partial-leave time bounds,
  partial-leave-must-be-single-day). §13 rule 11's 24h-notice rule is
  confirmed to NOT be a DB constraint (no trigger, no CHECK) — enforced
  client-side only, same as the web app's stated behavior, documented as
  such rather than assumed enforced. **Escalations**
  (`coach-escalations.ts`): read-only view of linked clients'
  escalations; confirmed live that `escalation_notes` has no coach
  SELECT policy at all, so (unlike the client's My Concerns) there's no
  notes/resolution detail available to show. **Renewals**
  (`coach-renewals.ts`): clients at or under the `SESSIONS_LOW_THRESHOLD`
  (hardcoded `5`, matching the web app's own hardcoded constant — not a
  `system_settings` row). **Performance** (`coach-performance.ts`):
  completed/upcoming/missed session counts plus average `trainer_rating`
  computed fresh from `bookings` rather than trusting the
  `coach_profiles.rating`/`review_count` columns, matching §13 rule 21
  ("recomputed live... not a stored/incrementally-maintained field").
  Same verification/testing caveats as the phases above.
- **`LEANR_PT_MOBILE_PRD.md` §28 "Phase 11 — Coach Portal Completion"
  (second slice — completes Phase 11)**: **Chats**
  (`src/lib/data/coach-chat.ts`, `src/app/(coach)/chats.tsx` +
  `chat/[id].tsx`) — a coach has many clients, unlike the client app's
  single-conversation Coach tab, so this is a list (client name, last
  message preview, unread count, confirmed via the same
  `conversations_select_participant`/`coach_id = my_coach_id()` policy
  the client side already uses) into a per-conversation thread screen.
  Generalized `chat.ts`'s `sendMessage`/`markMessagesRead` to take a
  `senderRole` parameter (default `'client'`, so the existing client
  call site is unchanged) rather than duplicating the insert/update
  logic for the coach side — only the thread UI is duplicated, same
  per-screen-component convention already used throughout this app.
  **Search** (`coach-search.ts`, `search.tsx`) — confirmed live that
  `client_profiles_select_by_any_coach` really does let any coach read
  every client's name/status, not just linked ones, matching §3's
  "read-only global client search (any client, not just own roster)."
  No full client-detail screen — the PRD itself says non-linked clients
  found this way get billing/progress hidden behind a read-only banner,
  so a detail view would mostly be a stub; the searchable list is the
  useful part. This completes §28 Phase 11 to the extent buildable from
  this mobile-only repo — every row on Coach More is now real. Same
  verification/testing caveats as the phases above.
- **Notifications + Profile (both apps)**: these were missing from
  *both* client and coach More tabs, not just coach — built once,
  shared logic. `src/lib/data/notifications.ts` — a real finding here:
  §20/§26 says push should deep-link via
  `notifications.related_entity_type/id`, but **every one of the 32 real
  notification rows sampled live has both columns null** —
  `createFromTemplate()` never actually populates them in practice. So
  routing is done by `template_key` substring instead (which is always
  populated) — several live keys don't even match the PRD §20 catalog's
  exact names (`schedule_changed_client` in real data vs.
  `admin_changed_schedule` in the prose), so it's substring-matched into
  a few route *categories* rather than a rigid 22-key exact table that
  would silently fail on any key it hadn't seen. (Written before Coach
  Chats existed — a `new_chat_message` notification on the coach side
  currently just marks read without navigating; wiring it to `/chats`
  is a trivial follow-up now that screen exists.) `src/lib/data/profile.ts` — confirmed real,
  direct write access via each table's `_update_own` RLS policy (not a
  boundary like coach-change stage 2). Deliberately scoped to
  name/phone/emergency-contact + a small role-specific subset (client
  goals/equipment, coach bio/specialization) + password change, not
  every column (`medical_notes`, `certifications`, `languages`, `skills`
  are real, writable, and left for later) — and no photo upload (same
  class of work as the chat image picker, not repeated for one avatar
  field). Same verification/testing caveats as the phases above.
- **Phase 5 — Payments + Zoom**: Zoom join and Plans listing
  schema-verified and corrected (`package_tiers`, plain `price`). Purchase
  and real Zoom meeting creation are now both live — see "Razorpay + Zoom
  are now real" below for what changed and exactly what's still needed
  (API secrets, not more code) before either actually works end to end.
- **Phase 6 — Polish & store prep**: unchanged by this pass — accessibility
  pass and EAS scaffolding done; app icon and store submission still need
  your design assets and developer accounts.
- **`LEANR_PT_MOBILE_PRD.md` §28 "Phase 12 — Admin Portal"**: §28 itself
  says to "flag this scope decision to the user before starting" — full
  admin parity (18 screens: coach/client CRUD, sales, sessions, reports,
  settings, etc.) is desk-bound work not worth mobile investment per
  §25/§26's own recommendation, so the reduced "on-call ops" subset was
  built instead: a new `(admin)` route group (`getHomeRouteForRole` now
  routes `admin` there instead of `/unsupported-role`) with **Escalations**
  (full gated resolution workflow — Confirm Called → Save Assessment →
  Add Note → Mark In Progress → Resolve — confirmed live that the
  call-gate, §13 rule 22, is client-side only, same "not actually a DB
  constraint" pattern found for the 24h-leave-notice rule), **Leave
  Requests** (approve/reject a coach's pending leave), and **Shadow
  Coverage** (`src/lib/data/admin-shadow.ts` — confirmed by reading
  `assign_shadow_coach()`'s body directly that it's a single RPC that
  both records the assignment AND reassigns the affected `upcoming`
  bookings' `coach_id`, not just a passive record; "uncovered
  leave-affected sessions" is a simplified direct computation — approved
  full-day leave whose window still has `upcoming` bookings pointed at
  the leave-taking coach — rather than a port of the web app's
  `listShadowCoverageGapsAction`). `admin_issue_type`/`fault` are free
  text with zero live rows to anchor a canonical vocabulary, so their
  chip options are a reasonable inferred set, documented as such. Same
  verification/testing caveats as the phases above (tsc/lint/export
  clean, not click-tested live — no admin test account available in
  this environment either).

### Razorpay + Zoom are now real (2026-08-19)

The earlier blocker — "the secret key can never live in the mobile app"
— was true, but the fix was never "can't be built," it was "needs a
server-side endpoint." **You don't need a domain name for that**: Supabase
Edge Functions get their own URL automatically
(`https://hdrpioypocyeclazkffl.supabase.co/functions/v1/<name>`), called
from the app via `supabase.functions.invoke(...)` — no custom domain, no
separate hosting account, nothing beyond what this project already has.
Two functions are deployed:

- **`razorpay`** (`create-order` / `verify-payment` actions) —
  `src/lib/data/payments.ts` is the client side, wired into
  `plans.tsx`'s "Purchase Plan" using the official
  `react-native-razorpay` checkout SDK (a native module — needs
  `npx expo prebuild` + a dev build, same as `expo-image-picker`; won't
  work in Expo Go). Order creation and HMAC-SHA256 signature
  verification both happen inside the function, never on-device.
  `payments`/`subscriptions` have no client write policy at all
  (confirmed live) — the function uses the service-role key for those
  writes, exactly like the web app's Server Actions do today. Enforces
  §13 rule 16 (one active/awaiting plan at a time, renewal exception
  under the low-sessions threshold) before creating an order.
- **`zoom-meeting`** — `src/lib/data/zoom.ts`'s `ensureZoomMeeting()`,
  called lazily on first "Join" tap (client Home, coach session
  workflow) per §13 rule 20. Uses Zoom's Server-to-Server OAuth to
  create a real meeting and writes `zoom_meeting_id`/`zoom_join_url`/
  `zoom_start_url` back onto the booking — using the *caller's own*
  forwarded JWT for that write (not service-role), since
  `bookings_update_own_client`/`_update_own_coach` RLS already allows a
  participant to do it directly; the only thing that has to stay
  server-side is the Zoom API secret itself.

Source is checked in at `supabase/functions/razorpay/index.ts` and
`supabase/functions/zoom-meeting/index.ts` (deployed via the Supabase
management API this pass, not the CLI — if you edit either file, deploy
the change with `supabase functions deploy razorpay` /
`supabase functions deploy zoom-meeting`, or the CLI's `functions deploy`
equivalent, from this directory).

**Secrets are set (confirmed 2026-08-19)** — all 5
(`RAZORPAY_KEY_ID`/`_SECRET`, `ZOOM_ACCOUNT_ID`/`ZOOM_CLIENT_ID`/
`ZOOM_CLIENT_SECRET`) were added via the Supabase dashboard (Project
Settings → Edge Functions → Secrets) and verified present using a
throwaway diagnostic function (`check-secrets` — `verify_jwt: false`,
returned only booleans, no values, no side effects). That function has
since been deleted (both from the project and this repo) now that its
one job is done — it isn't referenced by anything. **Presence confirmed
is not the same as correctness confirmed** — neither `razorpay` nor
`zoom-meeting` has been exercised end to end yet (no real order/meeting
created), since that needs the actual app running on a device with a
logged-in user, which hasn't happened in this environment. The Razorpay
keys currently set are **live** keys (`rzp_live_...`) — test with
Razorpay test-mode keys first if at all possible before a real charge
is attempted, since this integration is unverified in practice.

If either secret set is ever missing or wrong, both functions return a
clear `503 { error: "... isn't configured on the server yet" }` instead
of silently failing or faking success — surfaced as the actual error
message in the Plans/Join UI. To (re)apply secrets from the CLI instead
of the dashboard:

```bash
supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... --project-ref hdrpioypocyeclazkffl
supabase secrets set ZOOM_ACCOUNT_ID=... ZOOM_CLIENT_ID=... ZOOM_CLIENT_SECRET=... --project-ref hdrpioypocyeclazkffl
```

## Open items (need a decision or a credential, not more code)

1. **Google OAuth** — the "Continue with Google" button on the login
   screen is present but disabled. Native Google sign-in needs an OAuth
   client ID from Google Cloud Console (separate for iOS/Android) plus
   `expo-auth-session` wiring; nothing to build until those credentials
   exist. In the meantime, `(auth)/otp.tsx` ("Sign in with a code
   instead") is a real, no-credential-needed alternative to password
   login — `supabase.auth.signInWithOtp`/`verifyOtp`, no OAuth client, no
   domain. Whether it emails a 6-digit code or a magic link depends on
   this Supabase project's "Confirm signup"/"Magic Link" email template
   (Authentication → Email Templates in the dashboard) — outside this
   repo's control to verify or change. Its "Skip for now" link drops
   back to password login/signup so nobody gets stuck if that template
   isn't configured the way this screen assumes.
2. **`push_tokens` table doesn't exist yet.** `registerPushToken()` gets a
   device an Expo push token but the upsert that stores it will fail
   until this table exists. Ready to run, not yet applied (deliberately —
   creating tables in your real database wasn't part of what was asked
   for in this pass):
   ```sql
   create table public.push_tokens (
     user_id uuid primary key references public.profiles(id) on delete cascade,
     expo_push_token text not null,
     updated_at timestamptz not null default now()
   );
   alter table public.push_tokens enable row level security;
   create policy push_tokens_manage_own on public.push_tokens
     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
   ```
   Separately, and more fundamentally: nothing anywhere in this project
   can *send* a push yet — that needs server-side code (an Edge Function
   or route calling Expo's push API when a `notifications` row is
   created), outside this mobile repo. Also: since Expo SDK 53, remote
   push requires a development build — it will not work in Expo Go.
3. **Chat image attachments — now built.** See "Image attachments (chat)"
   above. No camera capture (library only) and no captions alongside an
   image — reasonable first-pass cuts if you want them extended later.
4. **Anonymous demo booking — not built.** The authenticated-client demo
   booking flow is now built (see "Phase 5" above). The separate
   anonymous entry point (`createAssessmentBooking()`, no account
   required, writes to `assessment_sessions` not `bookings`) is a
   structurally different, ungated route tree — its own scoped build,
   not a schema-risk blocker.
5. **Web dev target crashes on boot** (`expo start --web` /
   `npx expo export --platform web`) — `ReferenceError: window is not
   defined` in `LargeSecureStore.getItem` (`src/lib/supabase/large-secure-store.ts`)
   during the SSR pass `web.output: "static"` triggers. Pre-existing, not
   introduced by this pass — found while trying to browser-test the
   booking wizard, which is untestable in this environment without it
   (no mobile simulator available either — see Phase 5 above). Likely fix:
   guard the AsyncStorage-backed calls with a `typeof window !==
   'undefined'` check, but that's a product decision (do you want a web
   build at all?) more than a one-line patch, so left unfixed here.
6. **Wordmark asset** — the launch animation renders "LEANR" as real
   Oswald-italic text (matches how the web app does it), not an exported
   image — this was a deliberate simplification, not a gap.
7. **App icon** — still just the default Expo icon; a real LEANR icon
   asset needs to be designed/exported outside this repo (same open
   question the functional PRD itself flags — no icon-only asset exists
   anywhere, only the full `image.png` lockup).
8. **Store submission** — `eas.json` has build profiles and `app.json`
   has placeholder bundle identifiers (`com.fitelo.leanr` — confirm or
   change to whatever you actually register), but `eas build`/
   `eas submit` need you logged into a real EAS/Expo account plus an
   Apple Developer Program membership and Google Play Console access.
   Nothing to build here without those credentials.

## Everyday commands

```bash
npx expo start        # dev server
npx tsc --noEmit       # type-check
npx expo lint          # lint (first run installs eslint-config-expo)
npx expo export --platform ios      # verify the JS bundle compiles (no simulator needed)
npx expo export --platform android
```

`npx expo lint` will report one pre-existing warning in
`src/hooks/use-color-scheme.web.ts` (a `setState` call inside a
`useEffect`) — that's the standard, correct pattern for avoiding a
web hydration mismatch, not a bug; left as-is rather than "fixed" into
something worse.
