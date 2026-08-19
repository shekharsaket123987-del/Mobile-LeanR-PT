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
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

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
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  sendOtp: (email: string) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

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

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, signInWithPassword, signUpWithPassword, sendOtp, verifyOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
