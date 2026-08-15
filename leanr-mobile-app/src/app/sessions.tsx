/**
 * Sessions tab — merges My Sessions + My Schedule + Book a Session
 * (LEANR_PT_NEXTGEN_APP_PRD.md §6, §7). Phase 0: static shell; Phase 2
 * wires segmented control state + getClientSessionsAction-equivalent reads.
 */
import { Text } from 'react-native';

import { Card, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';

export default function SessionsScreen() {
  return (
    <ScreenScaffold title="Sessions" subtitle="Upcoming · Schedule · History">
      <Card>
        <Text style={shared.cardLabel}>TUESDAY, 6:00 PM</Text>
        <Text style={shared.bigStat}>With Coach Riya</Text>
      </Card>
    </ScreenScaffold>
  );
}
