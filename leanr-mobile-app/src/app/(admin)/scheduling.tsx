/**
 * Scheduling (admin, grouped activity view) — New PRD.md §4.C "Screen:
 * Scheduling" — fully read-only, 6 sections. Web's AdminSchedulingPage
 * renders plain (non-clickable) cards, no per-row navigation — matched here
 * (the `shadow` bucket's `id` is a shadow_coach_assignments id, not a
 * booking id, so it can't route to /admin-sessions/[id] anyway).
 */
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { StatusBadge } from '@/components/ui/badge';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { getAdminScheduling, type AdminSchedulingRow, type SchedulingBucket } from '@/lib/data/admin-scheduling';
import { sessionTypeLabel } from '@/lib/data/bookings';
import { useAsync } from '@/lib/data/use-async';

const SECTIONS: { key: SchedulingBucket; title: string; icon: string }[] = [
  { key: 'todaysChanges', title: "Today's Changes", icon: 'today-outline' },
  { key: 'cancelled', title: 'Cancelled', icon: 'close-circle-outline' },
  { key: 'rescheduled', title: 'Rescheduled', icon: 'swap-horizontal-outline' },
  { key: 'manual', title: 'Manual Sessions Created', icon: 'create-outline' },
  { key: 'demo', title: 'Demo Sessions', icon: 'sparkles-outline' },
  { key: 'shadow', title: 'Shadow Sessions', icon: 'people-outline' },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AdminSchedulingScreen() {
  const { data, loading, error, reload } = useAsync(getAdminScheduling, []);

  return (
    <ScreenScaffold title="Scheduling">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading &&
        !error &&
        data &&
        SECTIONS.map((section) => {
          const rows = data[section.key];
          return (
            <View key={section.key}>
              <SectionHeader title={section.title} eyebrow={`${rows.length} SESSIONS`} />
              {rows.length === 0 && <EmptyState message="Nothing here." icon={section.icon as never} />}
              {rows.map((b: AdminSchedulingRow) => (
                <GlassCard key={b.id} style={styles.row}>
                  <View style={styles.headerRow}>
                    <Text style={styles.title}>{formatDateTime(b.scheduled_start)}</Text>
                    <View style={styles.badgeRow}>
                      {b.session_type === 'assessment' && <Text style={styles.typeTag}>{sessionTypeLabel(b.session_type)}</Text>}
                      <StatusBadge status={b.status} />
                    </View>
                  </View>
                  <Text style={styles.meta}>
                    {b.client_name} · {b.coach_name}
                  </Text>
                  {b.note && <Text style={styles.note}>{b.note}</Text>}
                </GlassCard>
              ))}
            </View>
          );
        })}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#FFFFFF' },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  note: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  typeTag: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: 'rgba(255,255,255,0.45)' },
});
