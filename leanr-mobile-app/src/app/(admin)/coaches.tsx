/**
 * Admin Coaches (list) — New PRD.md §4.C "Screen: Coaches (list)" —
 * search (name only), table Coach/Utilization/Active Clients/Rating/
 * Status, row -> Coach Detail, header "+ Add Coach".
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { GhostButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { TextField } from '@/components/ui/text-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { listAdminCoaches, type AdminCoachListRow } from '@/lib/data/admin-coaches';
import { useAsync } from '@/lib/data/use-async';

const STATUS_TONE: Record<string, 'yellow' | 'green' | 'red' | 'gray'> = { active: 'green', inactive: 'gray', 'on-leave': 'yellow' };

export default function AdminCoachesScreen() {
  const { data: coaches, loading, error, reload } = useAsync(listAdminCoaches, []);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (coaches ?? []).filter((c) => !q || c.full_name.toLowerCase().includes(q));
  }, [coaches, query]);

  return (
    <ScreenScaffold title="Coaches" subtitle={coaches ? `${coaches.length} total` : undefined}>
      <GhostButton onPress={() => router.push('/coaches/new')} leading={<Ionicons name="add" size={18} color={Brand.yellow} />}>
        Add Coach
      </GhostButton>

      <TextField icon="search-outline" placeholder="Search by name" value={query} onChangeText={setQuery} />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <EmptyState message="No coaches match." icon="barbell-outline" />}
      {!loading && !error && filtered.map((coach) => <CoachRow key={coach.id} coach={coach} />)}
    </ScreenScaffold>
  );
}

function CoachRow({ coach }: { coach: AdminCoachListRow }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/coaches/[id]', params: { id: coach.id } })} accessibilityRole="button" accessibilityLabel={coach.full_name}>
      <GlassCard style={styles.row}>
        <Avatar photoUrl={coach.photo_url} name={coach.full_name} size={44} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {coach.full_name}
            </Text>
            <Badge label={coach.status} tone={STATUS_TONE[coach.status] ?? 'gray'} />
          </View>
          <Text style={styles.meta}>#{coach.employeeCode} · {coach.specialization ?? 'Coach'}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaSmall}>{coach.activeClients} active clients</Text>
            {coach.utilizationPct != null && <Text style={styles.metaSmall}>{coach.utilizationPct.toFixed(0)}% utilization</Text>}
            {coach.rating != null && <Text style={styles.metaSmall}>★ {coach.rating.toFixed(1)}</Text>}
          </View>
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
  metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metaSmall: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: 'rgba(255,255,255,0.45)' },
});
