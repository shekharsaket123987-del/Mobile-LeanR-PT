/**
 * Coach More — Availability, Escalations, Performance, Search, Renewals,
 * Notifications, Profile, Chats (LEANR_PT_MOBILE_PRD.md §5 coach nav).
 * Same pattern as the client More tab: placeholder rows + real sign out.
 */
import { StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

const ROWS = ['Availability', 'Chats', 'Escalations', 'Performance', 'Search', 'Renewals', 'Notifications', 'Profile'];

export default function CoachMore() {
  const { session, signOut } = useAuth();

  return (
    <ScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      {ROWS.map((row) => (
        <View key={row} style={styles.row}>
          <Text style={shared.cardLabel}>{row}</Text>
        </View>
      ))}

      <View style={styles.signOutButton}>
        <Text style={styles.signOutText} onPress={signOut}>
          Sign out
        </Text>
      </View>
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
