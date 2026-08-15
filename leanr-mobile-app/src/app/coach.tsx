/**
 * Coach tab — merged My Coach + Chats (LEANR_PT_NEXTGEN_APP_PRD.md §9.5).
 * Phase 0: static shell; Phase 2 wires getMyCoachAction + Realtime chat.
 */
import { Text } from 'react-native';

import { Card, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';

export default function CoachScreen() {
  return (
    <ScreenScaffold title="Your Coach">
      <Card>
        <Text style={shared.cardLabel}>COACH</Text>
        <Text style={shared.bigStat}>Riya Sharma</Text>
        <Text style={shared.cardLabel}>Strength & mobility specialist</Text>
      </Card>
    </ScreenScaffold>
  );
}
