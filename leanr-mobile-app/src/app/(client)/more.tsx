/**
 * More tab — Subscription, My Concerns, Notifications, Profile
 * (LEANR_PT_NEXTGEN_APP_PRD.md §6). "Subscription" links to the real
 * Plans screen (Phase 5), "My Concerns" to the real concerns screen
 * (Phase 9); the rest stay placeholder rows until wired.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

const PLACEHOLDER_ROWS = ['Progress', 'Notifications', 'Profile'];

export default function MoreScreen() {
  const { session, signOut } = useAuth();

  return (
    <ScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      <Pressable
        style={styles.row}
        onPress={() => router.push('/plans')}
        accessibilityRole="button"
        accessibilityLabel="Subscription & Plans">
        <Text style={shared.cardLabel}>Subscription & Plans</Text>
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={() => router.push('/concerns')}
        accessibilityRole="button"
        accessibilityLabel="My Concerns">
        <Text style={shared.cardLabel}>My Concerns</Text>
      </Pressable>

      {PLACEHOLDER_ROWS.map((row) => (
        <View key={row} style={styles.row}>
          <Text style={shared.cardLabel}>{row}</Text>
        </View>
      ))}

      <Pressable style={styles.signOutButton} onPress={signOut} accessibilityRole="button" accessibilityLabel="Sign out">
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#00000022' },
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
