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
- **Phase 4+**: not started — see nextgen PRD §16 roadmap.

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
7. **Push notifications only get you a device token, not a working push.**
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

## Everyday commands

```bash
npx expo start        # dev server
npx tsc --noEmit       # type-check
npx expo export --platform ios      # verify the JS bundle compiles (no simulator needed)
npx expo export --platform android
```
