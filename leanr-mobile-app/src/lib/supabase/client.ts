/**
 * Supabase client — points at the SAME Supabase project as the existing
 * web app (LEANR_PT_MOBILE_PRD.md §4/§27), so Auth users, `profiles` rows,
 * and RLS policies are shared, not duplicated.
 *
 * Values come from EXPO_PUBLIC_* env vars (see .env.example) rather than
 * being hardcoded — the anon key is safe to ship in a client bundle (it's
 * the public, RLS-constrained key), but it still shouldn't be baked into
 * source control as a literal.
 */
import { createClient } from '@supabase/supabase-js';

import { LargeSecureStore } from './large-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env and fill in your project values — see leanr-mobile-app/README.md. ' +
      'Auth/data calls will fail until then, but the app will still render.'
  );
}

// createClient throws synchronously on an empty/invalid URL, which would
// crash the whole app before a developer ever sees a screen. Fall back to
// a syntactically valid placeholder so the app boots and the warning above
// is the only symptom until real .env values are added.
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-anon-key', {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
