/**
 * Auth group — LEANR_PT_NEXTGEN_APP_PRD.md §25 "unified Login screen".
 * If a session already exists, route straight to that role's home via
 * getHomeRouteForRole — same role-branch used by (client)/(coach) layouts,
 * kept in one place (src/lib/auth/role-routing.ts).
 */
import { Redirect, Stack } from 'expo-router';

import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { getHomeRouteForRole } from '@/lib/auth/role-routing';

export default function AuthLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return null;
  // Session exists but the role lookup (profiles.role) hasn't resolved yet
  // — wait rather than redirecting on a still-null role, which would
  // briefly send everyone (including coaches) to /unsupported-role before
  // correcting itself once profile loads.
  if (session && !profile) return null;
  if (session) return <Redirect href={getHomeRouteForRole(profile?.role)} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Brand.black },
      }}
    />
  );
}
