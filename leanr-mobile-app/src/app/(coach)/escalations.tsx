/**
 * Coach Escalations (read-only) — LEANR_PT_MOBILE_PRD.md §5. See
 * src/lib/data/coach-escalations.ts header for the confirmed RLS
 * (no resolution controls — a coach can only view, never resolve).
 */
import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import { getLinkedEscalations, type CoachEscalation } from '@/lib/data/coach-escalations';
import { useAsync } from '@/lib/data/use-async';

const STATUS_LABEL: Record<CoachEscalation['status'], string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
const STATUS_COLOR: Record<CoachEscalation['status'], string> = {
  open: Brand.streakEmberStart,
  in_progress: Brand.yellow,
  resolved: Brand.successEmerald,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CoachEscalationsScreen() {
  const { data: escalations, loading, error, reload } = useAsync(getLinkedEscalations, []);

  return (
    <ScreenScaffold title="Escalations">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (escalations?.length ?? 0) === 0 && <EmptyState message="No escalations for your clients." />}
      {!loading &&
        !error &&
        escalations?.map((e) => (
          <Card key={e.id}>
            <View style={styles.header}>
              <Text style={shared.cardLabel}>{formatDate(e.created_at)}</Text>
              <Text style={[styles.status, { color: STATUS_COLOR[e.status] }]}>{STATUS_LABEL[e.status]}</Text>
            </View>
            <Text style={shared.bigStat}>{e.reason}</Text>
            {e.client_name && <Text style={shared.cardLabel}>{e.client_name}</Text>}
            {e.description && <Text style={styles.bodyText}>{e.description}</Text>}
          </Card>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, marginTop: 2 },
});
