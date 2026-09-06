/**
 * Admin Escalations (global queue) — New PRD.md §4.C "Screen:
 * Escalations (global queue)" — Active/Resolved tabs, rows link to
 * Escalation Detail's gated resolution workflow (escalation/[id].tsx).
 * Relit from the previous dark-theme version — same data layer
 * (admin-escalations.ts), untouched.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getAllEscalations } from '@/lib/data/admin-escalations';
import { useAsync } from '@/lib/data/use-async';

const STATUS_TONE: Record<string, 'teal' | 'green' | 'red' | 'gray'> = {
  open: 'red',
  in_progress: 'teal',
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
    <LightScreenScaffold title="Escalations">
      <LightSegmentedControl options={TABS} value={tab} onChange={setTab} />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (escalations?.length ?? 0) === 0 && <LightEmptyState message={`No ${tab} escalations.`} icon="checkmark-circle-outline" />}
      {!loading &&
        !error &&
        escalations?.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => router.push({ pathname: '/escalation/[id]', params: { id: e.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Open escalation: ${e.reason}`}>
            <LightCard style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.date}>{formatDate(e.created_at)}</Text>
                <LightBadge label={e.status.replace('_', ' ')} tone={STATUS_TONE[e.status] ?? 'gray'} />
              </View>
              <Text style={styles.reason}>{e.reason}</Text>
              <View style={styles.footerRow}>
                {e.clientName && <Text style={styles.client}>{e.clientName}</Text>}
                <Ionicons name="chevron-forward" size={16} color={LightBrand.textMuted} />
              </View>
            </LightCard>
          </Pressable>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: LightBrand.textMuted },
  reason: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: LightBrand.navy },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  client: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: LightBrand.tealDark },
});
