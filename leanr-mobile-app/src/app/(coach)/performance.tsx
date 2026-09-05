/**
 * Coach Performance Dashboard — LEANR_PT_MOBILE_PRD.md §5. See
 * src/lib/data/coach-performance.ts header for why this is computed
 * fresh from `bookings.trainer_rating` rather than trusting
 * `coach_profiles.rating`.
 */
import { StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { StatCard } from '@/components/ui/stat-card';
import { getMyPerformance } from '@/lib/data/coach-performance';
import { useAsync } from '@/lib/data/use-async';

export default function CoachPerformanceScreen() {
  const { data: performance, loading, error, reload } = useAsync(getMyPerformance, []);

  return (
    <ScreenScaffold title="Performance">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && performance && (
        <>
          <StatCard
            emphasize
            value={`${performance.averageTrainerRating !== null ? performance.averageTrainerRating.toFixed(1) : '—'} / 5`}
            label={`AVERAGE RATING · ${performance.ratingCount} ratings`}
          />

          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <StatCard value={String(performance.completedSessions)} label="COMPLETED" />
            </View>
            <View style={styles.gridItem}>
              <StatCard value={String(performance.upcomingSessions)} label="UPCOMING" />
            </View>
          </View>
          <StatCard value={String(performance.missedSessions)} label="MISSED SESSIONS" />
        </>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 16 },
  gridItem: { flex: 1 },
});
