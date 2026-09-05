/**
 * Admin Escalations (list) — LEANR_PT_MOBILE_PRD.md §10 "Screen:
 * Escalations (list) — Tab Active/Resolved". Taps into the gated
 * resolution workflow (escalation/[id].tsx).
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Brand } from '@/constants/theme';
import { getAllEscalations } from '@/lib/data/admin-escalations';
import { useAsync } from '@/lib/data/use-async';

const STATUS_TONE: Record<string, 'yellow' | 'green' | 'red'> = {
  open: 'red',
  in_progress: 'yellow',
  resolved: 'green',
};

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'resolved', label: 'Resolved' },
] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminEscalationsScreen() {
  const [tab, setTab] = useState<'active' | 'resolved'>('active');
  const { data: escalations, loading, error, reload } = useAsync(() => getAllEscalations(tab), [tab]);

  return (
    <ScreenScaffold title="Escalations">
      <SegmentedControl options={TABS} value={tab} onChange={setTab} />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (escalations?.length ?? 0) === 0 && <EmptyState message={`No ${tab} escalations.`} icon="checkmark-circle-outline" />}
      {!loading &&
        !error &&
        escalations?.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => router.push({ pathname: '/escalation/[id]', params: { id: e.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Open escalation: ${e.reason}`}>
            <GlassCard>
              <View style={styles.header}>
                <Text style={styles.date}>{formatDate(e.created_at)}</Text>
                <Badge label={e.status.replace('_', ' ')} tone={STATUS_TONE[e.status] ?? 'gray'} />
              </View>
              <Text style={styles.reason}>{e.reason}</Text>
              <View style={styles.footerRow}>
                {e.clientName && <Text style={styles.client}>{e.clientName}</Text>}
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
              </View>
            </GlassCard>
          </Pressable>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  reason: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: '#FFFFFF' },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  client: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: Brand.yellow },
});
