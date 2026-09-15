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

import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightStatCard } from '@/components/light/light-stat-card';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { sessionTypeLabel } from '@/lib/data/bookings';
import { getMyPerformance, getMyPerformanceLast30Days, getRecentReviews } from '@/lib/data/coach-performance';
import { useAsync } from '@/lib/data/use-async';

function formatReviewDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function CoachPerformanceScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [last30, allTime, recentReviews] = await Promise.all([getMyPerformanceLast30Days(), getMyPerformance(), getRecentReviews(10)]);
    return { last30, allTime, recentReviews };
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

          <LightSectionHeader title="Recent Reviews" />
          {data.recentReviews.length === 0 && <LightEmptyState message="No client ratings yet." icon="star-outline" />}
          {data.recentReviews.map((review) => (
            <LightCard key={review.bookingId} style={styles.reviewCard}>
              <View style={styles.reviewHeaderRow}>
                <Text style={styles.reviewClient}>{review.clientName}</Text>
                <LightBadge label={sessionTypeLabel(review.sessionType)} tone="outline" />
              </View>
              <Text style={styles.reviewStars}>
                ★ {review.trainerRating ?? '—'} trainer · ★ {review.qualityRating ?? '—'} quality
              </Text>
              {review.note && <Text style={styles.reviewNote}>&quot;{review.note}&quot;</Text>}
              <Text style={styles.reviewMeta}>{formatReviewDate(review.ratedAt)}</Text>
            </LightCard>
          ))}

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
  reviewCard: { gap: 4 },
  reviewHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewClient: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.navy },
  reviewStars: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: LightBrand.amber },
  reviewNote: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textPrimary, fontStyle: 'italic' },
  reviewMeta: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: LightBrand.textMuted },
});
