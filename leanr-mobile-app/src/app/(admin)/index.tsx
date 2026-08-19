/**
 * Admin Escalations (list) — LEANR_PT_MOBILE_PRD.md §10 "Screen:
 * Escalations (list) — Tab Active/Resolved". Taps into the gated
 * resolution workflow (escalation/[id].tsx).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { TextLink } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import { getAllEscalations } from '@/lib/data/admin-escalations';
import { useAsync } from '@/lib/data/use-async';

const STATUS_COLOR: Record<string, string> = {
  open: Brand.streakEmberStart,
  in_progress: Brand.yellow,
  resolved: Brand.successEmerald,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminEscalationsScreen() {
  const [tab, setTab] = useState<'active' | 'resolved'>('active');
  const { data: escalations, loading, error, reload } = useAsync(() => getAllEscalations(tab), [tab]);

  return (
    <ScreenScaffold title="Escalations">
      <View style={styles.tabRow} accessibilityRole="tablist">
        {(['active', 'resolved'] as const).map((t) => (
          <TextLink
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabLabel, tab === t && styles.tabLabelActive]}
            accessibilityLabel={t}>
            {t === 'active' ? 'Active' : 'Resolved'}
          </TextLink>
        ))}
      </View>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (escalations?.length ?? 0) === 0 && <EmptyState message={`No ${tab} escalations.`} />}
      {!loading &&
        !error &&
        escalations?.map((e) => (
          <Card key={e.id}>
            <View style={styles.header}>
              <Text style={shared.cardLabel}>{formatDate(e.created_at)}</Text>
              <Text style={[styles.status, { color: STATUS_COLOR[e.status] }]}>{e.status.replace('_', ' ')}</Text>
            </View>
            <Text style={shared.bigStat}>{e.reason}</Text>
            {e.clientName && <Text style={shared.cardLabel}>{e.clientName}</Text>}
            <TextLink
              onPress={() => router.push({ pathname: '/escalation/[id]', params: { id: e.id } })}
              style={styles.openLink}>
              Open →
            </TextLink>
          </Card>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', gap: 16, marginBottom: 4 },
  tabLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, opacity: 0.5, color: Brand.yellow },
  tabLabelActive: { opacity: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { fontFamily: 'Manrope_700Bold', fontSize: 12, textTransform: 'capitalize' },
  openLink: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: Brand.yellow, marginTop: 8 },
});
