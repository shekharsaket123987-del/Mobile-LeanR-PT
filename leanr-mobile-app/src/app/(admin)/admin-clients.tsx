/**
 * Admin Clients (list) — New PRD.md §4.C "Screen: Clients (list)" —
 * search (name/ID/phone) + 6-way status filter (client-side, same as
 * web), row -> Client Detail, header "+ Add Client" -> migration wizard.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { GhostButton } from '@/components/ui/button';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { TextField } from '@/components/ui/text-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { listAdminClients, type AdminClientListRow } from '@/lib/data/admin-clients';
import type { DerivedClientStatus } from '@/lib/data/coach-clients';
import { useAsync } from '@/lib/data/use-async';

const STATUS_TONE: Record<DerivedClientStatus, 'yellow' | 'green' | 'red' | 'gray'> = {
  active: 'green',
  paused: 'yellow',
  created: 'yellow',
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

export default function AdminClientsScreen() {
  const { data: clients, loading, error, reload } = useAsync(listAdminClients, []);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DerivedClientStatus | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (clients ?? []).filter((c) => {
      const matchesQuery = !q || c.full_name.toLowerCase().includes(q) || c.client_code.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || c.derivedStatus === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [clients, query, statusFilter]);

  return (
    <ScreenScaffold title="Clients" subtitle={clients ? `${clients.length} total` : undefined}>
      <GhostButton onPress={() => router.push('/admin-clients/new')} leading={<Ionicons name="add" size={18} color={Brand.yellow} />}>
        Add Client
      </GhostButton>

      <TextField icon="search-outline" placeholder="Search by name, ID, or phone" value={query} onChangeText={setQuery} />

      <ChipGrid>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={statusFilter === f.key} onPress={() => setStatusFilter(f.key)} />
        ))}
      </ChipGrid>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <EmptyState message="No clients match." icon="people-outline" />}
      {!loading && !error && filtered.map((client) => <ClientRow key={client.id} client={client} />)}
    </ScreenScaffold>
  );
}

function ClientRow({ client }: { client: AdminClientListRow }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/admin-clients/[id]', params: { id: client.id } })}
      accessibilityRole="button"
      accessibilityLabel={client.full_name}>
      <GlassCard style={styles.row}>
        <Avatar photoUrl={client.photo_url} name={client.full_name} size={44} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {client.full_name}
            </Text>
            <Badge label={STATUS_LABEL[client.derivedStatus]} tone={STATUS_TONE[client.derivedStatus]} />
          </View>
          <Text style={styles.meta}>#{client.client_code}</Text>
          {client.planName && <Text style={styles.meta}>{client.planName}</Text>}
          <View style={styles.metaRow}>
            {client.coachName && <Text style={styles.metaSmall}>Coach: {client.coachName}</Text>}
            {client.startDate && <Text style={styles.metaSmall}>Start {formatDate(client.startDate)}</Text>}
          </View>
          {client.sessionsTotal != null && (
            <Text style={styles.metaSmall}>
              {client.sessionsUsed ?? 0}/{client.sessionsTotal} sessions used
            </Text>
          )}
        </View>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFFFFF', flexShrink: 1 },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' },
  metaRow: { flexDirection: 'row', gap: 10 },
  metaSmall: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: 'rgba(255,255,255,0.45)' },
});
