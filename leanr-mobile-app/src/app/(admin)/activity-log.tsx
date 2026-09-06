/**
 * Activity Log (admin) — New PRD.md §4.C "Screen: Activity Log" —
 * entity-type filter pills, row: action badge, entity type, actor,
 * computed diff summary.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
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
const ACTION_TONE: Record<string, 'green' | 'teal' | 'red'> = { INSERT: 'green', UPDATE: 'teal', DELETE: 'red' };

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AdminActivityLogScreen() {
  const [filter, setFilter] = useState<EntityType | 'all'>('all');
  const { data: rows, loading, error, reload } = useAsync(() => getAuditLog(filter === 'all' ? undefined : filter), [filter]);

  return (
    <LightScreenScaffold title="Activity Log">
      <LightChipGrid>
        <LightChip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        {ENTITY_TYPES.map((t) => (
          <LightChip key={t} label={ENTITY_LABEL[t]} selected={filter === t} onPress={() => setFilter(t)} />
        ))}
      </LightChipGrid>

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (rows?.length ?? 0) === 0 && <LightEmptyState message="No activity recorded." icon="document-text-outline" />}
      {!loading &&
        !error &&
        rows?.map((r) => (
          <LightCard key={r.id} style={styles.card}>
            <View style={styles.headerRow}>
              <LightBadge label={r.action} tone={ACTION_TONE[r.action] ?? 'gray'} />
              <Text style={styles.entity}>{ENTITY_LABEL[r.entityType as EntityType] ?? r.entityType}</Text>
            </View>
            <Text style={styles.summary}>{r.summary}</Text>
            <View style={styles.footerRow}>
              <Text style={styles.actor}>{r.actorName}</Text>
              <Text style={styles.date}>{formatDateTime(r.createdAt)}</Text>
            </View>
          </LightCard>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entity: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: LightBrand.navy },
  summary: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textSecondary },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actor: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: LightBrand.tealDark },
  date: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: LightBrand.textMuted },
});
