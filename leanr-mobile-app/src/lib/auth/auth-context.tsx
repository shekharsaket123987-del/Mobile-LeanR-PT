/**
 * Auth state + role resolution — mirrors the web app's role model exactly
 * (LEANR_PT_MOBILE_PRD.md §3/§4): a single `profiles.role` enum column
 * (`admin | coach | client`) is the one source of truth for authorization.
 * There is no custom-claims/JWT role system to read instead.
 *
 * This context is the mobile equivalent of the web app's `getCallerContext()`
 * (§4) — resolve the Supabase session, then look up the caller's role.
 *
 * Confirmed against the real schema: a `handle_new_user()` trigger on
 * `auth.users` (AFTER INSERT) already creates the `profiles` row (with
 * `full_name` defaulted from user metadata or the email prefix) AND the
 * matching `client_profiles`/`coach_profiles` row based on role — so
 * signUpWithPassword no longer needs to insert anything itself.
 */
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

// Required once per app for expo-web-browser's auth-session flow to close
// the in-app browser and hand control back cleanly after the OAuth
// redirect (no-op on native if the session wasn't opened via this API).
WebBrowser.maybeCompleteAuthSession();

export type UserRole = 'client' | 'coach' | 'admin';

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  /** True until the initial session + profile lookup resolves. */
  loading: boolean;
  /**
   * True from the moment a password-recovery deep link has been parsed
   * and its session established, until `completePasswordRecovery()` is
   * called after the user actually sets a new password. `(auth)/_layout.tsx`
   * uses this to suppress its normal "session exists -> redirect home"
   * behavior — otherwise the recovery session it establishes would bounce
   * the user straight past the reset-password screen before they could
   * use it.
   */
  recoveryInProgress: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  /**
   * Web-based Google OAuth (Supabase's recommended Expo/RN pattern — see
   * README.md "Open items" #1): GoTrue holds the actual Google OAuth
   * client ID/secret server-side (Supabase Dashboard -> Authentication ->
   * Providers -> Google), so this app never needs one itself. It just
   * opens the URL Supabase hands back in an in-app browser session and
   * captures the resulting deep-link redirect. Returns `{error: null}`
   * on a user-cancelled browser dismissal (nothing to report), and a
   * real message only on an actual failure.
   */
  signInWithGoogle: () => Promise<{ error: string | null }>;
  sendOtp: (email: string) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>;
  /** Emails a reset link to `email`; the link deep-links back into this app at /reset-password. */
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  /** Sets a new password for the currently-established (recovery) session. */
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  /** Called by reset-password.tsx once the new password is saved, letting the normal signed-in redirect resume. */
  completePasswordRecovery: () => void;
  signOut: () => Promise<void>;
};

/**
 * Supabase's password-recovery email links back into this app with the
 * session tokens appended after a `#` (implicit-flow format, GoTrue's
 * default for recovery links regardless of the client SDK's own
 * `flowType`) — e.g. `leanrmobileapp://reset-password#access_token=...
 * &refresh_token=...&type=recovery`. A PKCE-style `?code=...` is also
 * handled as a fallback since it's a one-line difference and some Supabase
 * project configs emit it instead. Not using `URLSearchParams` here since
 * it isn't guaranteed available on Hermes.
 */
function parseParams(paramsString: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of paramsString.split('&')) {
    if (!pair) continue;
    const [key, rawValue = ''] = pair.split('=');
    try {
      result[decodeURIComponent(key)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      // Malformed component — skip it rather than throwing and losing the rest.
    }
  }
  return result;
}

export type AuthCallbackLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string; type?: string }
  | { kind: 'code'; code: string };

/** Extracts session tokens/PKCE code from any Supabase auth redirect URL (recovery or OAuth), regardless of whether they landed after `#` or `?`. */
export function parseAuthCallback(url: string): AuthCallbackLink | null {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const hashParams = hashIndex >= 0 ? parseParams(url.slice(hashIndex + 1)) : {};
  const queryParams = queryIndex >= 0 ? parseParams(url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)) : {};

  const accessToken = hashParams.access_token ?? queryParams.access_token;
  const refreshToken = hashParams.refresh_token ?? queryParams.refresh_token;
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken, type: hashParams.type ?? queryParams.type };
  }

  const code = queryParams.code ?? hashParams.code;
  if (code) return { kind: 'code', code };

  return null;
}

/** Same extraction, but only accepted when explicitly marked `type=recovery` — a stray/other deep link must never be mistaken for a password-recovery session. */
export function parseRecoveryLink(url: string | null): AuthCallbackLink | null {
  if (!url) return null;
  const link = parseAuthCallback(url);
  if (link?.kind === 'tokens' && link.type !== 'recovery') return null;
  return link;
}

async function applyAuthCallback(link: AuthCallbackLink) {
  return link.kind === 'tokens'
    ? supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
    : supabase.auth.exchangeCodeForSession(link.code);
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('id, role, full_name').eq('id', userId).single();

  if (error || !data) {
    console.warn('[auth] failed to load profile role', error?.message);
    return null;
  }
  return data as Profile;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryInProgress, setRecoveryInProgress] = useState(false);
  const incomingUrl = Linking.useURL();

  // Detect a password-recovery deep link (cold start via getInitialURL,
  // or the app already running via the url event) and establish its
  // session — same trigger point Linking.useURL() is built for.
  useEffect(() => {
    const link = parseRecoveryLink(incomingUrl);
    if (!link) return;

    (async () => {
      const { error } = await applyAuthCallback(link);
      if (error) {
        console.warn('[auth] password recovery link could not be applied', error.message);
        return;
      }
      setRecoveryInProgress(true);
      router.replace('/reset-password');
    })();
  }, [incomingUrl]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        setProfile(await fetchProfile(data.session.user.id));
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setProfile(nextSession ? await fetchProfile(nextSession.user.id) : null);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword: AuthState['signInWithPassword'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUpWithPassword: AuthState['signUpWithPassword'] = async (email, password) => {
    // Client-only self-serve signup — matches the web app exactly (§3):
    // coach/admin accounts are ops-provisioned only, never self-registered.
    // No role passed in options.data, so the handle_new_user() trigger's
    // default ('client') applies — it also creates the client_profiles
    // row automatically, so there's nothing left for this app to insert.
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  };

  // OTP is the same client<->account relationship as password signup — a
  // client-role account is auto-created by the handle_new_user() trigger
  // on first verify if one doesn't exist yet (shouldCreateUser: true),
  // exactly like signUpWithPassword. Whether Supabase actually emails a
  // 6-digit code vs. a magic link depends on this project's "Confirm
  // signup"/"Magic Link" email template in the dashboard (out of this
  // repo's control) — verifyOtp below is the correct client call either
  // way once a code exists.
  const sendOtp: AuthState['sendOtp'] = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    return { error: error?.message ?? null };
  };

  const verifyOtp: AuthState['verifyOtp'] = async (email, token) => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    return { error: error?.message ?? null };
  };

  const signInWithGoogle: AuthState['signInWithGoogle'] = async () => {
    const redirectTo = Linking.createURL('login');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { error: error?.message ?? 'Could not start Google sign-in.' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'cancel' || result.type === 'dismiss') return { error: null };
    if (result.type !== 'success' || !result.url) return { error: 'Google sign-in was not completed.' };

    const link = parseAuthCallback(result.url);
    if (!link) return { error: 'Google sign-in did not return a valid session.' };

    const { error: sessionError } = await applyAuthCallback(link);
    return { error: sessionError?.message ?? null };
  };

  const sendPasswordReset: AuthState['sendPasswordReset'] = async (email) => {
    const redirectTo = Linking.createURL('reset-password');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error: error?.message ?? null };
  };

  const updatePassword: AuthState['updatePassword'] = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  };

  const completePasswordRecovery = () => setRecoveryInProgress(false);

  const signOut = async () => {
    setRecoveryInProgress(false);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        recoveryInProgress,
        signInWithPassword,
        signUpWithPassword,
        signInWithGoogle,
        sendOtp,
        verifyOtp,
        sendPasswordReset,
        updatePassword,
        completePasswordRecovery,
        signOut,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
