/**
 * Progress tab — LEANR_PT_NEXTGEN_APP_PRD.md §9.3.
 * Phase 0: static shell; Phase 3 wires the real progress ring + trend line
 * to getMyProgressAction-equivalent data (original PRD §5).
 */
import { Text, View } from 'react-native';

import { Card, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';

export default function ProgressScreen() {
  return (
    <ScreenScaffold title="Your Progress">
      <Card>
        <Text style={shared.cardLabel}>SESSIONS THIS PLAN</Text>
        <Text style={shared.bigStat}>12 / 15</Text>
      </Card>
      <View style={shared.ctaButton}>
        <Text style={shared.ctaButtonText}>Log this week&apos;s update</Text>
      </View>
    </ScreenScaffold>
  );
}
