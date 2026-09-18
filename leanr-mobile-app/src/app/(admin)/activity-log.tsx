/**
 * Activity Log (admin) — New PRD.md §4.C "Screen: Activity Log" —
 * entity-type filter pills, row: action badge, entity type, actor,
 * computed diff summary.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { ENTITY_TYPES, getAuditLog, type EntityType } from '@/lib/data/admin-activity-log';
import { useAsync } from '@/lib/data/use-async';

const ENTITY_LABEL: Record<EntityType, string> = {
  bookings: 'Bookings',
  subscriptions: 'Subscriptions',
  coach_change_requests: 'Coach Changes',
  client_profiles: 'Client Profiles',
  coach_profiles: 'Coach Profiles',
  package_tiers: 'Packages',
  system_settings: 'Settings',
};
const ACTION_TONE: Record<string, 'green' | 'yellow' | 'red'> = { INSERT: 'green', UPDATE: 'yellow', DELETE: 'red' };

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AdminActivityLogScreen() {
  const [filter, setFilter] = useState<EntityType | 'all'>('all');
  const { data: rows, loading, error, reload } = useAsync(() => getAuditLog(filter === 'all' ? undefined : filter), [filter]);

  return (
    <ScreenScaffold title="Activity Log">
      <ChipGrid>
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        {ENTITY_TYPES.map((t) => (
          <Chip key={t} label={ENTITY_LABEL[t]} selected={filter === t} onPress={() => setFilter(t)} />
        ))}
      </ChipGrid>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (rows?.length ?? 0) === 0 && <EmptyState message="No activity recorded." icon="document-text-outline" />}
      {!loading &&
        !error &&
        rows?.map((r) => (
          <GlassCard key={r.id} style={styles.card}>
            <View style={styles.headerRow}>
              <Badge label={r.action} tone={ACTION_TONE[r.action] ?? 'gray'} />
              <Text style={styles.entity}>{ENTITY_LABEL[r.entityType as EntityType] ?? r.entityType}</Text>
            </View>
            <Text style={styles.summary}>{r.summary}</Text>
            <View style={styles.footerRow}>
              <Text style={styles.actor}>{r.actorName}</Text>
              <Text style={styles.date}>{formatDateTime(r.createdAt)}</Text>
            </View>
          </GlassCard>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entity: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#FFFFFF' },
  summary: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actor: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: Brand.yellow },
  date: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: 'rgba(255,255,255,0.45)' },
});
