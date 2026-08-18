/**
 * Coach More — Availability, Escalations, Performance, Search, Renewals,
 * Notifications, Profile, Chats (LEANR_PT_MOBILE_PRD.md §5 coach nav).
 * All eight rows are now real — this completes §28 Phase 11 to the
 * extent buildable from this mobile-only repo.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

const LINKED_ROWS: {
  label: string;
  href: '/availability' | '/escalations' | '/renewals' | '/performance' | '/notifications' | '/profile' | '/chats' | '/search';
}[] = [
  { label: 'Availability', href: '/availability' },
  { label: 'Chats', href: '/chats' },
  { label: 'Escalations', href: '/escalations' },
  { label: 'Performance', href: '/performance' },
  { label: 'Search', href: '/search' },
  { label: 'Renewals', href: '/renewals' },
  { label: 'Notifications', href: '/notifications' },
  { label: 'Profile', href: '/profile' },
];

export default function CoachMore() {
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
