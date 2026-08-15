/**
 * Auth group — LEANR_PT_NEXTGEN_APP_PRD.md §25 "unified Login screen".
 * If a session already exists, bounce straight past login/signup — the
 * (client) layout will further redirect non-client roles to
 * /unsupported-role, so this only needs to check for a session at all.
 */
import { Redirect, Stack } from 'expo-router';

import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (session) return <Redirect href="/(client)/index" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Brand.black },
      }}
    />
  );
}
