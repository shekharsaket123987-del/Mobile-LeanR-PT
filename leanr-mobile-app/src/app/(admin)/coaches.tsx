/**
 * Admin Coaches (list) — New PRD.md §4.C "Screen: Coaches (list)" —
 * search (name only), table Coach/Utilization/Active Clients/Rating/
 * Status, row -> Coach Detail, header "+ Add Coach".
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightAvatar } from '@/components/light/light-avatar';
import { LightBadge } from '@/components/light/light-badge';
import { LightGhostButton } from '@/components/light/light-button';
import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightTextField } from '@/components/light/light-text-field';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { listAdminCoaches, type AdminCoachListRow } from '@/lib/data/admin-coaches';
import { useAsync } from '@/lib/data/use-async';

const STATUS_TONE: Record<string, 'teal' | 'green' | 'red' | 'gray'> = { active: 'green', inactive: 'gray', 'on-leave': 'teal' };

export default function AdminCoachesScreen() {
  const { data: coaches, loading, error, reload } = useAsync(listAdminCoaches, []);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (coaches ?? []).filter((c) => !q || c.full_name.toLowerCase().includes(q));
  }, [coaches, query]);

  return (
    <LightScreenScaffold title="Coaches" subtitle={coaches ? `${coaches.length} total` : undefined}>
      <LightGhostButton onPress={() => router.push('/coaches/new')} leading={<Ionicons name="add" size={18} color={LightBrand.tealDark} />}>
        Add Coach
      </LightGhostButton>

      <LightTextField icon="search-outline" placeholder="Search by name" value={query} onChangeText={setQuery} />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <LightEmptyState message="No coaches match." icon="barbell-outline" />}
      {!loading && !error && filtered.map((coach) => <CoachRow key={coach.id} coach={coach} />)}
    </LightScreenScaffold>
  );
}

function CoachRow({ coach }: { coach: AdminCoachListRow }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/coaches/[id]', params: { id: coach.id } })} accessibilityRole="button" accessibilityLabel={coach.full_name}>
      <LightCard style={styles.row}>
        <LightAvatar photoUrl={coach.photo_url} name={coach.full_name} size={44} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {coach.full_name}
            </Text>
            <LightBadge label={coach.status} tone={STATUS_TONE[coach.status] ?? 'gray'} />
          </View>
          <Text style={styles.meta}>#{coach.employeeCode} · {coach.specialization ?? 'Coach'}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaSmall}>{coach.activeClients} active clients</Text>
            {coach.utilizationPct != null && <Text style={styles.metaSmall}>{coach.utilizationPct.toFixed(0)}% utilization</Text>}
            {coach.rating != null && <Text style={styles.metaSmall}>★ {coach.rating.toFixed(1)}</Text>}
          </View>
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
  metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metaSmall: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: LightBrand.textMuted },
});
