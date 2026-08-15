/**
 * Auth state + role resolution — mirrors the web app's role model exactly
 * (LEANR_PT_MOBILE_PRD.md §3/§4): a single `profiles.role` enum column
 * (`admin | coach | client`) is the one source of truth for authorization.
 * There is no custom-claims/JWT role system to read instead.
 *
 * This context is the mobile equivalent of the web app's `getCallerContext()`
 * (§4) — resolve the Supabase session, then look up the caller's role.
 */
import type { Session } from '@supabase/supabase-js';
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

export type UserRole = 'client' | 'coach' | 'admin';

export type Profile = {
  id: string;
  role: UserRole;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  /** True until the initial session + profile lookup resolves. */
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  // NOTE: only `id`/`role` are selected because those are the two columns
  // the functional PRD documents with certainty (§3). Extend this select
  // once the exact `profiles` column names for name/photo are confirmed
  // against the real migrations — do not guess column names here.
  const { data, error } = await supabase.from('profiles').select('id, role').eq('id', userId).single();

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
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };

    if (data.user) {
      // If the project has a `handle_new_user` DB trigger that inserts the
      // `profiles` row automatically, this insert is redundant but
      // harmless (upsert). If no such trigger exists, this is required.
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: data.user.id, role: 'client' }, { onConflict: 'id' });
      if (profileError) {
        console.warn('[auth] profile row upsert on signup failed', profileError.message);
      }
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signInWithPassword, signUpWithPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
