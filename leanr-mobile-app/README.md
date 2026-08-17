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
- **The booking wizard's RPCs are now fully known**
  (`create_temporary_booking(p_client_id, p_coach_id, p_slot_start, p_duration_minutes)`
  → `confirm_booking(p_temp_booking_id, p_subscription_id, ...)`) but the
  multi-step picker UI isn't built yet — same situation as chat.

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
  not built: the booking wizard and chat UI (schema for both is now known
  — see above; this is scope, not risk, now).
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
3. **Booking wizard + chat UI — schema known, not built.** See the schema
   section above for the confirmed RPC/table shapes. This is now a
   straightforward (if multi-step) UI build, not a research problem.
4. **Wordmark asset** — the launch animation renders "LEANR" as real
   Oswald-italic text (matches how the web app does it), not an exported
   image — this was a deliberate simplification, not a gap.
5. **App icon** — still just the default Expo icon; a real LEANR icon
   asset needs to be designed/exported outside this repo (same open
   question the functional PRD itself flags — no icon-only asset exists
   anywhere, only the full `image.png` lockup).
6. **Store submission** — `eas.json` has build profiles and `app.json`
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
