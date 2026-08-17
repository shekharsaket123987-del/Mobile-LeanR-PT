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
   app** so Auth users, `profiles` rows, and RLS policies are shared, not
   duplicated — see PRD §4/§27.
3. `npx expo start` — press `i` (iOS simulator), `a` (Android emulator), or
   scan the QR with Expo Go.

Without a `.env`, the app still boots (you'll see a console warning) but
every Supabase call will fail — useful for UI-only iteration, not for
testing auth.

## Phase status

- **Phase 0 — Foundation**: done. Brand theme tokens, "Ignition Reveal"
  launch animation, 5-tab client shell.
- **Phase 1 — Auth**: done. Email/password sign-in/sign-up via Supabase,
  session persisted encrypted (AES ciphertext in AsyncStorage, key in
  Keychain/Keystore via `expo-secure-store` — see
  `src/lib/supabase/large-secure-store.ts`), role-based routing
  (`(auth)` vs `(client)` route groups gate on session + `profiles.role`).
- **Phase 2 — Core client journey**: partially done. Home, Sessions
  (list + cancel), Coach (profile), and Progress (log + list) are wired to
  real Supabase reads/writes — see `src/lib/data/`. Cancel and reschedule
  use RPC signatures the PRD documents exactly (§8e/§8f); rate-session is
  a direct column update the PRD names exactly (§10). Deliberately **not**
  wired yet: the "Book a Session" hold→confirm wizard and chat — see open
  items below for why.
- **Phase 3 — Motivation layer**: partially done. Real `ProgressRing`
  (SVG, animated fill) and `StreakChip` (computed client-side from
  completed bookings, no new schema) are wired into Home + Progress;
  `CelebrationOverlay` fires once per newly-hit milestone (10/25/50/100
  completed sessions), tracked locally so it doesn't replay on every
  app open. Push notification **registration** (permission + Expo push
  token) is scaffolded in `src/lib/notifications/register-push-token.ts`
  — actually **sending** a push still needs server-side work this repo
  can't do (see open items).
- **Phase 4 — Coach app**: partially done. New `(coach)` route group
  (Dashboard, Schedule, Clients, session workflow, More) parallel to
  `(client)`, gated by `profiles.role`. Role-based post-auth routing is
  now centralized in `src/lib/auth/role-routing.ts` — `(auth)`,
  `(client)`, and `(coach)` layouts all redirect through it instead of
  each hardcoding a destination (login/signup no longer force a client
  redirect, which would've misrouted a coach). The session workflow
  (Join → Present/Late/Absent → Notes → Complete) is the best-grounded
  write path in the whole coach app: `attendance` and `workout_notes`
  have exact documented columns in the PRD (§8b–§8d), not just prose —
  see `src/lib/data/coach-portal.ts`.
- **Phase 5 — Payments + Zoom**: partially done, deliberately scoped down
  from the roadmap's original framing. **Zoom join is real**: Home's
  next-session card and the coach session workflow both deep-link into
  whatever `zoom_join_url` already exists on a booking, gated by a
  join-window helper (`src/lib/data/zoom.ts`). **Plans listing is real**
  (Supabase read). **Purchase is an honest stub, not a fake success or an
  insecure implementation** — see "Why payments can't be finished from
  this repo" below before assuming this is unfinished work rather than a
  hard architectural boundary.
- **Phase 6 — Polish & store prep**: partially done, scoped to what's
  actually possible without design tooling or store accounts on this
  side. **Accessibility pass (real, done)**: introduced `TextLink` and
  `CtaButton` (`src/components/tappable.tsx`) to replace a
  codebase-wide pattern of bare `<Text onPress>` — no accessibility
  role, no touch target bigger than the glyphs — with two disciplined
  primitives that add `accessibilityRole`/`accessibilityLabel`/
  `accessibilityState` and either a proper hit target or `hitSlop`,
  per §12's "≥44×44pt" requirement. Applied across all 19 tappable
  elements in the app (buttons, links, sign-out, tab chips).
  `ProgressRing`/`StreakChip` now collapse into one screen-reader
  element announcing the actual number, not "ring" or two disjointed
  text reads, per §12's explicit requirement. **EAS Build scaffolding
  (real, done)**: `eas.json` build profiles + `ios.bundleIdentifier`/
  `android.package` set in `app.json` (`com.fitelo.leanr` —
  placeholder reverse-domain id, confirm/change to whatever you
  register in App Store Connect / Play Console). **Blocked on your
  input, not code**: a real app icon (needs design tooling/an
  isolated LEANR mark this repo can't produce — see original PRD's
  own open question on this) and actual TestFlight/Play internal-track
  submission (needs your Apple Developer + Google Play Console
  accounts; `eas build`/`eas submit` can't run without logging into
  an actual EAS/Expo account).

### Why payments can't be finished from this repo

Razorpay order creation requires the account's **secret key**, and
verifying a completed payment requires an HMAC-SHA256 signature check
against that same secret (original PRD §8g). That key can never be
shipped inside a mobile app — doing so would let anyone extract it and
create fraudulent orders or forge "paid" signatures. The web app gets
away with this today only because Next.js Server Actions run entirely
server-side; a mobile client has no equivalent. This is the same
structural gap as push-notification dispatch in Phase 3: real payment
processing needs a small server-side endpoint (an Edge Function or
Route Handler) that creates the order and verifies the signature,
which is new backend work outside this repo, not something to fake
from the client. `src/app/(client)/plans.tsx` explains this to anyone
who taps "Purchase Plan" rather than silently doing nothing or lying
about success.

## Open items (need a decision or a credential, not more code)

1. **Google OAuth** — the "Continue with Google" button on the login
   screen is present but disabled. Native Google sign-in needs an OAuth
   client ID from Google Cloud Console (separate for iOS/Android) plus
   `expo-auth-session` wiring; nothing to build until those credentials
   exist.
2. **`profiles` table columns** — `src/lib/auth/auth-context.tsx` only
   selects `id, role` because those are the two columns the functional PRD
   documents with certainty. If the real table has different/additional
   columns needed for the app (name, avatar, etc.), extend that select to
   match the actual schema rather than guessing.
3. **Signup profile-row creation** — `signUpWithPassword` upserts a
   `profiles` row with `role: 'client'` after `auth.signUp()` succeeds, in
   case no `handle_new_user` DB trigger exists on the real project. If a
   trigger already does this, the upsert is a harmless no-op; if column
   names differ from `{id, role}`, this upsert needs adjusting to match.
4. **Wordmark asset** — the launch animation renders "LEANR" as real
   Oswald-italic text (matches how the web app does it), not an exported
   image — this was a deliberate simplification, not a gap.
5. **Schema columns marked VERIFY in `src/lib/data/*.ts`** — the PRD
   confirms these tables/relationships exist (coach assignment,
   subscriptions, progress_logs) but doesn't name every column. Grep for
   `VERIFY` in that folder and check each one against the real
   `supabase/migrations/*.sql` before trusting the write paths
   (`logProgress`, coach lookup's `client_profiles.coach_id`,
   `subscriptions.client_id`) with real client data. The two RPC writes
   that ARE wired (`cancelBooking`, `rescheduleBooking`) are safe — their
   full parameter lists are given verbatim in the PRD (§8e/§8f).
6. **"Book a Session" wizard + chat — not built yet.** `confirm_booking`'s
   RPC parameters and the `messages`/`conversations` column names aren't
   documented anywhere in the PRD (only prose, no exact signature), so
   guessing them risked a silently broken write. Needs either the real
   migration SQL or your confirmation of the actual column names before
   these get wired for real.
7. **Coach app schema guesses** — `src/lib/data/coach-portal.ts`: the
   `attendance` table's FK back to a booking (`booking_id`) and
   `workout_notes`' FK + snake_case column names are standard-convention
   guesses, not confirmed; `client_profiles.coach_id` reuses the same
   guess as the client-side coach lookup; `bookings.coach_joined_at` is
   a new column this phase needs (original PRD §7g mentions the concept
   in prose, "Zoom opens + coach_joined_at set", but there's no real Zoom
   integration yet — Join just timestamps this column). None of these
   block the app from running; they'd surface as a write failure, not
   silent corruption.
8. **Push notifications only get you a device token, not a working push.**
   `registerPushToken()` requests permission and fetches an Expo push
   token, then tries to store it in a `push_tokens` table that **does not
   exist anywhere in the functional PRD** — this is new schema the
   feature needs (columns: `user_id`, `expo_push_token`, `updated_at`);
   create it (or point the upsert at wherever you'd rather store device
   tokens) before this write will succeed. Separately, and more
   fundamentally: nothing anywhere in this project can *send* a push yet
   — that requires server-side code (an Edge Function or route calling
   Expo's push API when a `notifications` row is created), which is
   outside this mobile repo. Also: since Expo SDK 53, remote push
   requires a development build — it will not work in Expo Go.
9. **Zoom/Plans schema guesses** — `bookings.zoom_join_url` (VERIFY) is
   the one new column Zoom join needs; if it's null/missing, Join simply
   shows nothing rather than erroring (`src/lib/data/zoom.ts`'s
   `JOIN_LABEL['no-link']`). The `packages` table name and its columns
   (`name`, `price_paise`, `sessions_count`) in `src/lib/data/plans.ts`
   are inferred from the admin `createPackageAction` naming in the PRD,
   not confirmed — a wrong guess here just surfaces as an empty/error
   Plans screen, never a bad write, since it's read-only.
10. **App icon** — still just the default Expo icon; a real LEANR icon
    asset needs to be designed/exported outside this repo (same open
    question the functional PRD itself flags — no icon-only asset
    exists anywhere, only the full `image.png` lockup).
11. **Store submission** — `eas.json` has build profiles and `app.json`
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
