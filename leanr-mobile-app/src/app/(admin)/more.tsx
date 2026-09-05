/**
 * Admin More — sign out only. Full admin nav (Dashboard, Coaches,
 * Clients, Sessions, Sales, Reports, Settings, etc.) stays web/tablet
 * per §28 Phase 12's scope decision — see (admin)/_layout.tsx header.
 */
import { ScreenScaffold } from '@/components/screen-scaffold';
import { DestructiveButton } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';

export default function AdminMore() {
  const { session, signOut } = useAuth();

  return (
    <ScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      <DestructiveButton size="lg" onPress={signOut}>
        Sign out
      </DestructiveButton>
    </ScreenScaffold>
  );
}
