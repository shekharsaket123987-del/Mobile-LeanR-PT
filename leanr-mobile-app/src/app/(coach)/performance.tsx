/**
 * Coach Performance — New PRD.md §4.B: "Fully server-rendered, no
 * interactivity, explicitly labeled read only." Reframed to the
 * mockup's "Last 30 Days" summary (Total/Completed/Cancelled/
 * Rescheduled + Client Feedback rating) while keeping the PRD's
 * all-time stats visible below — "View Detailed Report" reveals that
 * section rather than generating a new report (no such generation
 * feature exists anywhere in the PRD for coaches).
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LightStatCard } from '@/components/light/light-stat-card';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getMyPerformance, getMyPerformanceLast30Days } from '@/lib/data/coach-performance';
import { useAsync } from '@/lib/data/use-async';

export default function CoachPerformanceScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [last30, allTime] = await Promise.all([getMyPerformanceLast30Days(), getMyPerformance()]);
    return { last30, allTime };
  }, []);
  const [showDetail, setShowDetail] = useState(false);

  return (
    <LightScreenScaffold title="My Performance">
      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && data && (
        <>
          <LightSectionHeader title="Last 30 Days" />
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <LightStatCard value={String(data.last30.total)} label="TOTAL SESSIONS" />
            </View>
            <View style={styles.gridItem}>
              <LightStatCard value={String(data.last30.completed)} label="COMPLETED" />
            </View>
            <View style={styles.gridItem}>
              <LightStatCard value={String(data.last30.cancelled)} label="CANCELLED" />
            </View>
            <View style={styles.gridItem}>
              <LightStatCard value={String(data.last30.rescheduled)} label="RESCHEDULED" />
            </View>
          </View>

          <LightStatCard
            emphasize
            value={data.allTime.averageTrainerRating !== null ? data.allTime.averageTrainerRating.toFixed(1) : '—'}
            label={`CLIENT FEEDBACK · ${data.allTime.ratingCount} reviews`}
          />

          <LightPrimaryButton size="lg" onPress={() => setShowDetail((v) => !v)}>
            {showDetail ? 'Hide Detailed Report' : 'View Detailed Report'}
          </LightPrimaryButton>

          {showDetail && (
            <>
              <LightSectionHeader title="All Time" />
              <View style={styles.grid}>
                <View style={styles.gridItem}>
                  <LightStatCard value={String(data.allTime.completedSessions)} label="COMPLETED" />
                </View>
                <View style={styles.gridItem}>
                  <LightStatCard value={String(data.allTime.upcomingSessions)} label="UPCOMING" />
                </View>
              </View>
              <LightStatCard value={String(data.allTime.missedSessions)} label="MISSED SESSIONS" />
              <Text style={styles.note}>Read only — performance stats aren&apos;t editable.</Text>
            </>
          )}
        </>
      )}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { width: '47%' },
  note: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: LightBrand.textMuted, textAlign: 'center' },
});
