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
  attachments are not built** — the `chat-attachments` storage bucket and
  its upload RLS are confirmed to exist, but wiring a picker needs a new
  native dependency (`expo-image-picker`) this repo doesn't have yet.
  Same verification/testing caveats as Phase 5/7 above.
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
  schedule slice — completes Phase 5)**: new screen
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
- **Phase 5 — Payments + Zoom**: Zoom join and Plans listing
  schema-verified and corrected (`package_tiers`, plain `price`). Purchase
  remains a deliberate stub — see "Why payments can't be finished from
  this repo" below; that reasoning is unchanged by schema access, since
  it's about where the Razorpay secret key can live, not what the tables
  are called.
- **Phase 6 — Polish & store prep**: unchanged by this pass — accessibility
  pass and EAS scaffolding done; app icon and store submission still need
  your design assets and developer accounts.

### Why payments can't be finished from this repo

Razorpay order creation requires the account's **secret key**, and
verifying a completed payment requires an HMAC-SHA256 signature check
against that same secret (original PRD §8g). That key can never be
shipped inside a mobile app — doing so would let anyone extract it and
create fraudulent orders or forge "paid" signatures. The web app gets
away with this today only because Next.js Server Actions run entirely
server-side; a mobile client has no equivalent. This is the same
structural gap as push-notification dispatch: real payment processing
needs a small server-side endpoint (an Edge Function or Route Handler)
that creates the order and verifies the signature, which is new backend
work outside this repo, not something to fake from the client.
`src/app/(client)/plans.tsx` explains this to anyone who taps "Purchase
Plan" rather than silently doing nothing or lying about success.

## Open items (need a decision or a credential, not more code)

1. **Google OAuth** — the "Continue with Google" button on the login
   screen is present but disabled. Native Google sign-in needs an OAuth
   client ID from Google Cloud Console (separate for iOS/Android) plus
   `expo-auth-session` wiring; nothing to build until those credentials
   exist.
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
3. **Chat image attachments — not built.** Text chat is now built (see
   "Phase 9" above). The `chat-attachments` storage bucket and its upload
   RLS are confirmed to exist and ready; wiring a picker needs a new
   native dependency (`expo-image-picker`) plus `app.json` permission
   config — a deliberate follow-on, not a schema-risk blocker.
4. **Demo/assessment booking — not built.** Recurring schedule setup is
   now built (see "Phase 5" above). The separate anonymous demo-booking
   entry point (`confirmDemoBooking`/`createAssessmentBooking`, no
   account required) is its own scoped build, not a schema-risk blocker.
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
