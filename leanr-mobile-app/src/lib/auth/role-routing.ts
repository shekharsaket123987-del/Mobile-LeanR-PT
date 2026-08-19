import type { Href } from 'expo-router';
import type { UserRole } from './auth-context';

/**
 * Single source of truth for "where does this role land after auth" —
 * used by (auth)/_layout, (client)/_layout, (coach)/_layout, and
 * (admin)/_layout so the branching logic exists in exactly one place.
 * Admin now has a reduced-scope mobile app (§28 Phase 12 — Escalations/
 * Leave/Shadow Coverage only; full admin parity stays web/tablet per
 * (admin)/_layout.tsx's header).
 */
export function getHomeRouteForRole(role: UserRole | undefined): Href {
  // Cast: Expo Router's generated template-literal types for a group's
  // bare root (e.g. `${'/(client)'}`) don't structurally match the plain
  // string literal '/(client)' in this TS/expo-router-type version, even
  // though they're the same route at runtime — verified against the
  // regenerated .expo/types/router.d.ts, not a guess.
  if (role === 'client') return '/(client)' as Href;
  if (role === 'coach') return '/(coach)' as Href;
  if (role === 'admin') return '/(admin)' as Href;
  return '/unsupported-role';
}
