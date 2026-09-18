/**
 * Coach Escalations (read-only) — New PRD.md §4.B: "Explicitly read-only
 * (only Admin can respond to or resolve these)" — Open/Resolved tabs
 * (`in_progress` folded into "Open", matching the web's own two-tab
 * split). No priority badges — no `priority` column exists anywhere;
 * `escalations.fault` is admin-internal only, never coach-visible per
 * RLS (see coach-escalations.ts header).
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { getLinkedEscalations, type CoachEscalation } from '@/lib/data/coach-escalations';
import { useAsync } from '@/lib/data/use-async';

const STATUS_LABEL: Record<CoachEscalation['status'], string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
const STATUS_TONE: Record<CoachEscalation['status'], 'yellow' | 'green' | 'red'> = {
  open: 'red',
  in_progress: 'yellow',
  resolved: 'green',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type Tab = 'open' | 'resolved';

export default function CoachEscalationsScreen() {
  const { data: escalations, loading, error, reload } = useAsync(getLinkedEscalations, []);
  const [tab, setTab] = useState<Tab>('open');

  const filtered = (escalations ?? []).filter((e) => (tab === 'resolved' ? e.status === 'resolved' : e.status !== 'resolved'));

  return (
    <ScreenScaffold title="Escalations" subtitle="Only Admin can respond to or resolve these.">
      <SegmentedControl
        options={[
          { key: 'open', label: 'Open' },
          { key: 'resolved', label: 'Resolved' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <EmptyState message={`No ${tab} escalations.`} icon="checkmark-circle-outline" />}
      {!loading &&
        !error &&
        filtered.map((e) => (
          <GlassCard key={e.id}>
            <View style={styles.header}>
              <Text style={styles.date}>{formatDate(e.created_at)}</Text>
              <Badge label={STATUS_LABEL[e.status]} tone={STATUS_TONE[e.status]} />
            </View>
            <Text style={styles.reason}>{e.reason}</Text>
            {e.client_name && <Text style={styles.date}>{e.client_name}</Text>}
            {e.description && <Text style={styles.bodyText}>{e.description}</Text>}
          </GlassCard>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  reason: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: '#FFFFFF' },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
});
