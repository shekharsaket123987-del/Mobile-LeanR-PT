/**
 * More tab — Subscription, My Concerns, Notifications, Profile
 * (LEANR_PT_NEXTGEN_APP_PRD.md §6). All four are real now; only
 * "Progress" stays a placeholder row (it's already its own tab, this
 * row predates that and is effectively vestigial).
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

const LINKED_ROWS: { label: string; href: '/plans' | '/concerns' | '/notifications' | '/profile' }[] = [
  { label: 'Subscription & Plans', href: '/plans' },
  { label: 'My Concerns', href: '/concerns' },
  { label: 'Notifications', href: '/notifications' },
  { label: 'Profile', href: '/profile' },
];
const PLACEHOLDER_ROWS = ['Progress'];

export default function MoreScreen() {
  const { session, signOut } = useAuth();

  return (
    <ScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      {LINKED_ROWS.map((row) => (
        <Pressable
          key={row.label}
          style={styles.row}
          onPress={() => router.push(row.href)}
          accessibilityRole="button"
          accessibilityLabel={row.label}>
          <Text style={shared.cardLabel}>{row.label}</Text>
        </Pressable>
      ))}

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
