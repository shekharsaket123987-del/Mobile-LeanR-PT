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

import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { getAllEscalations } from '@/lib/data/admin-escalations';
import { useAsync } from '@/lib/data/use-async';

const STATUS_TONE: Record<string, 'yellow' | 'green' | 'red' | 'gray'> = {
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

const CATEGORY_LABELS: Record<string, string> = {
  slot_not_available: 'Slot not available',
  coach_missed_session: 'Coach missed session',
  need_schedule_change: 'Need schedule change',
  payment_issue: 'Payment issue',
  technical_issue: 'Technical issue',
  want_coach_change: 'Want to change coach',
  other: 'Other',
};
function categoryLabel(value: string | null) {
  return (value && CATEGORY_LABELS[value]) ?? 'Other';
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
            <GlassCard style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.code}>{e.clientCode ? `#${e.clientCode}` : `#${e.id.slice(0, 8).toUpperCase()}`}</Text>
                <Badge label={categoryLabel(e.category)} tone="gray" />
                <Badge label={e.status.replace('_', ' ')} tone={STATUS_TONE[e.status] ?? 'gray'} />
              </View>
              <Text style={styles.date}>
                Raised {formatDate(e.created_at)}
                {e.resolved_at ? ` · Resolved ${formatDate(e.resolved_at)}` : ''}
              </Text>
              <Text style={styles.reason}>{e.reason}</Text>
              {e.description && <Text style={styles.description}>{e.description}</Text>}
              {e.status === 'resolved' && e.resolution_notes && (
                <Text style={styles.resolution}>Resolution: {e.resolution_notes}</Text>
              )}
              <View style={styles.footerRow}>
                {e.clientName && (
                  <Text style={styles.client}>
                    {e.clientName}
                    {e.packageName ? ` · ${e.packageName}` : ''}
                  </Text>
                )}
                <Ionicons name="chevron-forward" size={16} color={'rgba(255,255,255,0.45)'} />
              </View>
            </GlassCard>
          </Pressable>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  code: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: 'rgba(255,255,255,0.45)' },
  date: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  reason: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#FFFFFF' },
  description: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  resolution: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: Brand.yellow, marginTop: 2 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  client: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: Brand.yellow },
});
