/**
 * Admin More — sign out only. Full admin nav (Dashboard, Coaches,
 * Clients, Sessions, Sales, Reports, Settings, etc.) stays web/tablet
 * per §28 Phase 12's scope decision — see (admin)/_layout.tsx header.
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import { ScreenScaffold } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function AdminMore() {
  const { session, signOut } = useAuth();

  return (
    <ScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      <Pressable style={styles.signOutButton} onPress={signOut} accessibilityRole="button" accessibilityLabel="Sign out">
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  signOutButton: {
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Brand.alertRed,
  },
  signOutText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: Brand.alertRed },
});
