/**
 * Renewal Opportunities (coach, read-only) — LEANR_PT_MOBILE_PRD.md §5.
 * See src/lib/data/coach-renewals.ts header for the confirmed RLS and
 * the `SESSIONS_LOW_THRESHOLD` constant.
 */
import { Text } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { getRenewalOpportunities } from '@/lib/data/coach-renewals';
import { useAsync } from '@/lib/data/use-async';

export default function CoachRenewalsScreen() {
  const { data: opportunities, loading, error, reload } = useAsync(getRenewalOpportunities, []);

  return (
    <ScreenScaffold title="Renewal Opportunities" subtitle="Clients running low on sessions">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (opportunities?.length ?? 0) === 0 && (
        <EmptyState message="No clients are running low on sessions right now." />
      )}
      {!loading &&
        !error &&
        opportunities?.map((o) => (
          <Card key={o.subscriptionId}>
            <Text style={shared.cardLabel}>{o.clientName}</Text>
            <Text style={shared.bigStat}>
              {Math.max(o.sessionsRemaining, 0)} / {o.sessionsTotal} sessions left
            </Text>
          </Card>
        ))}
    </ScreenScaffold>
  );
}
