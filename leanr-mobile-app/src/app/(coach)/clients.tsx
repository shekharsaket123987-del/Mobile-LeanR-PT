/**
 * Coach Clients (roster) — LEANR_PT_MOBILE_PRD.md §5 "assigned clients,
 * filters". This phase builds the plain roster read; search/filter and
 * the read-only client-detail push are left for a later pass.
 */
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { Avatar } from '@/components/ui/avatar';
import { GlassCard } from '@/components/ui/glass-card';
import { getCoachClients } from '@/lib/data/coach-portal';
import { useAsync } from '@/lib/data/use-async';

export default function CoachClients() {
  const { data: clients, loading, error, reload } = useAsync(getCoachClients, []);

  return (
    <ScreenScaffold title="Clients">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (clients?.length ?? 0) === 0 && <EmptyState message="No clients assigned yet." icon="people-outline" />}
      {!loading &&
        !error &&
        clients?.map((client) => (
          <GlassCard key={client.id}>
            <View style={styles.row}>
              <Avatar name={client.full_name} size={40} />
              <Text style={styles.name} numberOfLines={1}>
                {client.full_name}
              </Text>
            </View>
          </GlassCard>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFFFFF', flexShrink: 1 },
});
