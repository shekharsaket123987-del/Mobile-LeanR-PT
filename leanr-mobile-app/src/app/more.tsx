/**
 * More tab — Subscription, My Concerns, Notifications, Profile
 * (LEANR_PT_NEXTGEN_APP_PRD.md §6). Phase 0: static shell listing the
 * destinations; Phase 2 turns each row into a real nav link.
 */
import { StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold, styles as shared } from '@/components/screen-scaffold';

const ROWS = ['Subscription', 'Progress', 'My Concerns', 'Notifications', 'Profile'];

export default function MoreScreen() {
  return (
    <ScreenScaffold title="More">
      {ROWS.map((row) => (
        <View key={row} style={styles.row}>
          <Text style={shared.cardLabel}>{row}</Text>
        </View>
      ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#00000022' },
});
