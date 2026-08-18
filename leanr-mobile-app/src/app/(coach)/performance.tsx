/**
 * Coach Performance Dashboard — LEANR_PT_MOBILE_PRD.md §5. See
 * src/lib/data/coach-performance.ts header for why this is computed
 * fresh from `bookings.trainer_rating` rather than trusting
 * `coach_profiles.rating`.
 */
import { Text } from 'react-native';

import { Card, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
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
          <Card>
            <Text style={shared.cardLabel}>AVERAGE RATING</Text>
            <Text style={shared.bigStat}>
              {performance.averageTrainerRating !== null ? performance.averageTrainerRating.toFixed(1) : '—'} / 5
            </Text>
            <Text style={shared.cardLabel}>{performance.ratingCount} ratings</Text>
          </Card>

          <Card>
            <Text style={shared.cardLabel}>COMPLETED SESSIONS</Text>
            <Text style={shared.bigStat}>{performance.completedSessions}</Text>
          </Card>

          <Card>
            <Text style={shared.cardLabel}>UPCOMING SESSIONS</Text>
            <Text style={shared.bigStat}>{performance.upcomingSessions}</Text>
          </Card>

          <Card>
            <Text style={shared.cardLabel}>MISSED SESSIONS</Text>
            <Text style={shared.bigStat}>{performance.missedSessions}</Text>
          </Card>
        </>
      )}
    </ScreenScaffold>
  );
}
