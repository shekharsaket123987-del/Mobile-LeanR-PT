/**
 * Home (Client) — LEANR_PT_NEXTGEN_APP_PRD.md §9.1.
 * Phase 0: static brand shell only. Phase 2 replaces the mock values below
 * with getClientDashboardAction-equivalent Supabase reads (original PRD §5).
 */
import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { Card, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';

export default function HomeScreen() {
  return (
    <ScreenScaffold title="Hi Aman 👋" subtitle="Let's keep the streak alive">
      <Card>
        <Text style={shared.cardLabel}>🔥 STREAK</Text>
        <Text style={shared.bigStat}>5 weeks</Text>
        <Text style={[shared.cardLabel, styles.spaced]}>Next session in 2h 14m with Coach Riya</Text>
      </Card>

      <Card>
        <Text style={shared.cardLabel}>THIS MONTH</Text>
        <Text style={shared.bigStat}>3 / 5 sessions</Text>
      </Card>

      <Card>
        <Text style={shared.cardLabel}>📝 COACH NOTE</Text>
        <Text style={styles.note}>&ldquo;Great form on your last set — keep that tempo.&rdquo;</Text>
      </Card>

      <View style={shared.ctaButton}>
        <Text style={shared.ctaButtonText}>Join next session</Text>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  spaced: { marginTop: 4 },
  note: { fontFamily: 'Manrope_500Medium', fontSize: 15, color: Brand.charcoal2 },
});
