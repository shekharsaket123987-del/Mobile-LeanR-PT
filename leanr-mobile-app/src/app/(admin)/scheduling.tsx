/**
 * Scheduling (admin, grouped activity view) — New PRD.md §4.C "Screen:
 * Scheduling" — fully read-only, 6 sections.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getAdminScheduling, type AdminSchedulingRow, type SchedulingBucket } from '@/lib/data/admin-scheduling';
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
    <LightScreenScaffold title="Scheduling">
      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading &&
        !error &&
        data &&
        SECTIONS.map((section) => {
          const rows = data[section.key];
          return (
            <View key={section.key}>
              <LightSectionHeader title={section.title} eyebrow={`${rows.length} SESSIONS`} />
              {rows.length === 0 && <LightEmptyState message="Nothing here." icon={section.icon as never} />}
              {rows.map((b: AdminSchedulingRow) => (
                <Pressable key={b.id} onPress={() => router.push({ pathname: '/admin-sessions/[id]', params: { id: b.id } })} accessibilityRole="button" accessibilityLabel={`Session with ${b.client_name}`}>
                  <LightCard style={styles.row}>
                    <Text style={styles.title}>{formatDateTime(b.scheduled_start)}</Text>
                    <Text style={styles.meta}>
                      {b.client_name} · {b.coach_name}
                    </Text>
                  </LightCard>
                </Pressable>
              ))}
            </View>
          );
        })}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.navy },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: LightBrand.textSecondary },
});
