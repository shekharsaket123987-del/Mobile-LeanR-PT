/**
 * Renewal Opportunities (coach, read-only) — LEANR_PT_MOBILE_PRD.md §5.
 * See src/lib/data/coach-renewals.ts header for the confirmed RLS and
 * the `SESSIONS_LOW_THRESHOLD` constant.
 */
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { GlassCard } from '@/components/ui/glass-card';
import { Brand } from '@/constants/theme';
import { getRenewalOpportunities } from '@/lib/data/coach-renewals';
import { useAsync } from '@/lib/data/use-async';

export default function CoachRenewalsScreen() {
  const { data: opportunities, loading, error, reload } = useAsync(getRenewalOpportunities, []);

  return (
    <ScreenScaffold title="Renewal Opportunities" subtitle="Clients running low on sessions">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (opportunities?.length ?? 0) === 0 && (
        <EmptyState message="No clients are running low on sessions right now." icon="trending-up-outline" />
      )}
      {!loading &&
        !error &&
        opportunities?.map((o) => (
          <GlassCard key={o.subscriptionId} variant="yellow">
            <View style={styles.row}>
              <Text style={styles.name}>{o.clientName}</Text>
              <Text style={styles.sessions}>
                {Math.max(o.sessionsRemaining, 0)}/{o.sessionsTotal}
              </Text>
            </View>
          </GlassCard>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFFFFF', flexShrink: 1 },
  sessions: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: Brand.yellow },
});
