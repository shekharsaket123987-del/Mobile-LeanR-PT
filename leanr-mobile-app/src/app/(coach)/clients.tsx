/**
 * Coach Clients (roster) — LEANR_PT_MOBILE_PRD.md §5 "assigned clients,
 * filters". This phase builds the plain roster read; search/filter and
 * the read-only client-detail push are left for a later pass.
 */
import { Text } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { getCoachClients } from '@/lib/data/coach-portal';
import { useAsync } from '@/lib/data/use-async';

export default function CoachClients() {
  const { data: clients, loading, error, reload } = useAsync(getCoachClients, []);

  return (
    <ScreenScaffold title="Clients">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (clients?.length ?? 0) === 0 && <EmptyState message="No clients assigned yet." />}
      {!loading &&
        !error &&
        clients?.map((client) => (
          <Card key={client.id}>
            <Text style={shared.bigStat}>{client.full_name}</Text>
          </Card>
        ))}
    </ScreenScaffold>
  );
}
