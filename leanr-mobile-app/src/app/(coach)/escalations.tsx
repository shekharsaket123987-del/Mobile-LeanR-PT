/**
 * Coach Escalations (read-only) — LEANR_PT_MOBILE_PRD.md §5. See
 * src/lib/data/coach-escalations.ts header for the confirmed RLS
 * (no resolution controls — a coach can only view, never resolve).
 */
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { getLinkedEscalations, type CoachEscalation } from '@/lib/data/coach-escalations';
import { useAsync } from '@/lib/data/use-async';

const STATUS_LABEL: Record<CoachEscalation['status'], string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
const STATUS_TONE: Record<CoachEscalation['status'], 'yellow' | 'green' | 'red'> = {
  open: 'red',
  in_progress: 'yellow',
  resolved: 'green',
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
      {!loading && !error && (escalations?.length ?? 0) === 0 && (
        <EmptyState message="No escalations for your clients." icon="checkmark-circle-outline" />
      )}
      {!loading &&
        !error &&
        escalations?.map((e) => (
          <GlassCard key={e.id}>
            <View style={styles.header}>
              <Text style={styles.date}>{formatDate(e.created_at)}</Text>
              <Badge label={STATUS_LABEL[e.status]} tone={STATUS_TONE[e.status]} />
            </View>
            <Text style={styles.reason}>{e.reason}</Text>
            {e.client_name && <Text style={styles.date}>{e.client_name}</Text>}
            {e.description && <Text style={styles.bodyText}>{e.description}</Text>}
          </GlassCard>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  reason: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: '#FFFFFF' },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
});
