/**
 * Coach Clients (roster) — New PRD.md §4.B: free-text search (name/code)
 * + status pills + a table of Client/Plan/Start Date/Slot/Progress/
 * Status, each row linking to Client Detail. Status pills use the real
 * derived 6-bucket `ClientStatus` (§6), not the raw 3-value column — see
 * `coach-clients.ts` header for why.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightAvatar } from '@/components/light/light-avatar';
import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightTextField } from '@/components/light/light-text-field';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getCoachClientsList, type CoachClientListRow, type DerivedClientStatus } from '@/lib/data/coach-clients';
import { useAsync } from '@/lib/data/use-async';

const STATUS_TONE: Record<DerivedClientStatus, 'teal' | 'green' | 'red' | 'gray'> = {
  active: 'green',
  paused: 'teal',
  created: 'teal',
  expired: 'gray',
  demo: 'gray',
  not_paid: 'gray',
};
const STATUS_LABEL: Record<DerivedClientStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  created: 'Created',
  expired: 'Expired',
  demo: 'Demo',
  not_paid: 'Not Paid',
};
const FILTERS: { key: DerivedClientStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'created', label: 'Created' },
  { key: 'expired', label: 'Expired' },
  { key: 'demo', label: 'Demo' },
  { key: 'not_paid', label: 'Not Paid' },
];

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CoachClients() {
  const { data: clients, loading, error, reload } = useAsync(getCoachClientsList, []);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DerivedClientStatus | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (clients ?? []).filter((c) => {
      const matchesQuery = !q || c.full_name?.toLowerCase().includes(q) || c.client_code?.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || c.derivedStatus === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [clients, query, statusFilter]);

  return (
    <LightScreenScaffold title="My Clients">
      <LightTextField icon="search-outline" placeholder="Search by name or ID" value={query} onChangeText={setQuery} />

      <LightChipGrid>
        {FILTERS.map((f) => (
          <LightChip key={f.key} label={f.label} selected={statusFilter === f.key} onPress={() => setStatusFilter(f.key)} />
        ))}
      </LightChipGrid>

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <LightEmptyState message="No clients match." icon="people-outline" />}
      {!loading && !error && filtered.map((client) => <ClientRow key={client.id} client={client} />)}
    </LightScreenScaffold>
  );
}

function ClientRow({ client }: { client: CoachClientListRow }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/clients/[id]', params: { id: client.id } })}
      accessibilityRole="button"
      accessibilityLabel={client.full_name}>
      <LightCard style={styles.row}>
        <LightAvatar photoUrl={client.photo_url} name={client.full_name} size={44} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {client.full_name}
            </Text>
            <LightBadge label={STATUS_LABEL[client.derivedStatus]} tone={STATUS_TONE[client.derivedStatus]} />
          </View>
          {client.client_code && <Text style={styles.meta}>#{client.client_code}</Text>}
          {client.planName && <Text style={styles.meta}>{client.planName}</Text>}
          <View style={styles.metaRow}>
            {client.startDate && <Text style={styles.metaSmall}>Start {formatDate(client.startDate)}</Text>}
            {client.slotSummary && <Text style={styles.metaSmall}>{client.slotSummary}</Text>}
          </View>
          {client.sessionsTotal != null && (
            <Text style={styles.metaSmall}>
              {client.sessionsUsed ?? 0}/{client.sessionsTotal} sessions used
            </Text>
          )}
        </View>
      </LightCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.navy, flexShrink: 1 },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.textSecondary },
  metaRow: { flexDirection: 'row', gap: 10 },
  metaSmall: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: LightBrand.textMuted },
});
