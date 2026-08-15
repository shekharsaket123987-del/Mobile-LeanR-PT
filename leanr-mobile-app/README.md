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
- **Phase 2+**: not started — see nextgen PRD §16 roadmap.

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

## Everyday commands

```bash
npx expo start        # dev server
npx tsc --noEmit       # type-check
npx expo export --platform ios      # verify the JS bundle compiles (no simulator needed)
npx expo export --platform android
```
