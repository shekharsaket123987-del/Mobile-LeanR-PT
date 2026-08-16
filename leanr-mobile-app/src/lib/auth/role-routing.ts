import type { Href } from 'expo-router';
import type { UserRole } from './auth-context';

/**
 * Single source of truth for "where does this role land after auth" —
 * used by (auth)/_layout, (client)/_layout, and (coach)/_layout so the
 * branching logic exists in exactly one place. Admin has no mobile app
 * yet (LEANR_PT_NEXTGEN_APP_PRD.md §16: stays web/tablet, deprioritized).
 */
export function getHomeRouteForRole(role: UserRole | undefined): Href {
  // Cast: Expo Router's generated template-literal types for a group's
  // bare root (e.g. `${'/(client)'}`) don't structurally match the plain
  // string literal '/(client)' in this TS/expo-router-type version, even
  // though they're the same route at runtime — verified against the
  // regenerated .expo/types/router.d.ts, not a guess.
  if (role === 'client') return '/(client)' as Href;
  if (role === 'coach') return '/(coach)' as Href;
  return '/unsupported-role';
}
