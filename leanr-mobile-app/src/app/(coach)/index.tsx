/**
 * Coach Dashboard — New PRD.md §4.B: 7 stat cards (Today/This Week/
 * Completed/Missed/Utilization%/Avg Rating/Active Escalations) -> Today's
 * Tasks widget -> Pending Tasks widget -> Upcoming (Next 3 Days,
 * read-only) -> Cancelled Sessions (capped 5) -> Rescheduled Sessions
 * (capped 5, legitimately often empty — see coach-portal.ts header) ->
 * Your Clients preview (top 3). Rebuilt from what this phase found: a
 * bare list of today's sessions with zero KPI cards or widgets — this
 * was a real functionality gap, not just an unthemed screen.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CoachTaskRow } from '@/components/coach-task-row';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { sessionTypeLabel } from '@/lib/data/bookings';
import {
  getAttendanceMap,
  getCoachBookings,
  getCoachCancelledSessions,
  getCoachClients,
  getCoachPendingTasks,
  getCoachRescheduledSessions,
  getCoachSessionsThisWeekCount,
  getCoachUpcomingNext3Days,
} from '@/lib/data/coach-portal';
import { getLinkedEscalations } from '@/lib/data/coach-escalations';
import { getMyPerformance, getMyUtilization, getRecentReviews } from '@/lib/data/coach-performance';
import { useAsync } from '@/lib/data/use-async';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function CoachDashboard() {
  const { session } = useAuth();
  const { data, loading, error, reload } = useAsync(async () => {
    const [today, thisWeekCount, performance, utilization, escalations, pendingTasks, upcoming3Days, cancelled, rescheduled, clients, recentReviews] =
      await Promise.all([
        getCoachBookings('today'),
        getCoachSessionsThisWeekCount(),
        getMyPerformance(),
        getMyUtilization(),
        getLinkedEscalations(),
        getCoachPendingTasks(),
        getCoachUpcomingNext3Days(),
        getCoachCancelledSessions(),
        getCoachRescheduledSessions(),
        getCoachClients(),
        getRecentReviews(1),
      ]);
    const attendanceMap = await getAttendanceMap(today.map((b) => b.id));
    return {
      today,
      thisWeekCount,
      performance,
      utilization,
      escalations,
      pendingTasks,
      upcoming3Days,
      cancelled,
      rescheduled,
      clients,
      attendanceMap,
      latestReview: recentReviews[0] ?? null,
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  if (loading) {
    return (
      <ScreenScaffold title="Dashboard">
        <LoadingState />
      </ScreenScaffold>
    );
  }
  if (error || !data) {
    return (
      <ScreenScaffold title="Dashboard">
        <ErrorState message={error ?? 'Something went wrong.'} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  const activeEscalations = data.escalations.filter((e) => e.status !== 'resolved').length;

  return (
    <ScreenScaffold title="Dashboard">
      <View style={styles.statGrid}>
        <View style={styles.statCell}>
          <StatCard value={String(data.today.length)} label="TODAY" />
        </View>
        <View style={styles.statCell}>
          <StatCard value={String(data.thisWeekCount)} label="THIS WEEK" />
        </View>
        <View style={styles.statCell}>
          <StatCard value={String(data.performance.completedSessions)} label="COMPLETED" />
        </View>
        <View style={styles.statCell}>
          <StatCard value={String(data.performance.missedSessions)} label="MISSED" />
        </View>
        <View style={styles.statCell}>
          <StatCard value={data.utilization != null ? `${Math.round(data.utilization)}%` : '—'} label="UTILIZATION" />
        </View>
        <View style={styles.statCell}>
          <StatCard
            value={data.performance.averageTrainerRating != null ? data.performance.averageTrainerRating.toFixed(1) : '—'}
            label="AVG RATING"
          />
        </View>
        <View style={styles.statCell}>
          <StatCard value={String(activeEscalations)} label="ACTIVE ESCALATIONS" emphasize={activeEscalations > 0} />
        </View>
      </View>

      {data.latestReview && (
        <GlassCard style={styles.reviewCard}>
          <View style={styles.reviewHeaderRow}>
            <Text style={styles.reviewTitle}>Latest Review</Text>
            <Badge label={sessionTypeLabel(data.latestReview.sessionType)} tone="outline" />
          </View>
          <Text style={styles.reviewStars}>
            ★ {data.latestReview.trainerRating ?? '—'} trainer · ★ {data.latestReview.qualityRating ?? '—'} quality
          </Text>
          {data.latestReview.note && <Text style={styles.reviewNote}>&quot;{data.latestReview.note}&quot;</Text>}
          <Text style={styles.reviewMeta}>
            {data.latestReview.clientName} · {formatSessionTime(data.latestReview.ratedAt)}
          </Text>
        </GlassCard>
      )}

      <SectionHeader title="Today's Tasks" />
      {data.today.length === 0 && <EmptyState message="No sessions today." icon="checkmark-circle-outline" />}
      {data.today.map((booking) => (
        <CoachTaskRow key={booking.id} booking={booking} attendanceStatus={data.attendanceMap[booking.id] ?? null} onChanged={reload} />
      ))}

      <Pressable onPress={() => router.push('/pending-tasks')} accessibilityRole="button">
        <GlassCard style={styles.linkCard}>
          <SectionHeader title="Pending Tasks" />
          <Text style={styles.linkBody}>
            {data.pendingTasks.length === 0
              ? 'Nothing owed — you’re all caught up.'
              : `${data.pendingTasks.length} session${data.pendingTasks.length === 1 ? '' : 's'} still owed attendance or notes.`}
          </Text>
        </GlassCard>
      </Pressable>

      <SectionHeader title="Upcoming (Next 3 Days)" />
      {data.upcoming3Days.length === 0 && <EmptyState message="Nothing on the calendar for the next 3 days." icon="calendar-outline" />}
      {data.upcoming3Days.map((b) => (
        <GlassCard key={b.id} style={styles.simpleRow}>
          <Text style={styles.simpleRowTime}>{formatSessionTime(b.scheduled_start)}</Text>
          <StatusBadge status={b.status} />
        </GlassCard>
      ))}

      {data.cancelled.length > 0 && (
        <>
          <SectionHeader title="Cancelled Sessions" />
          {data.cancelled.map((b) => (
            <GlassCard key={b.id} style={styles.simpleRow}>
              <Text style={styles.simpleRowTime}>{formatSessionTime(b.scheduled_start)}</Text>
              <Badge label={`Cancelled by ${b.cancelled_by === session?.user.id ? 'you' : 'client'}`} tone="red" />
            </GlassCard>
          ))}
        </>
      )}

      {data.rescheduled.length > 0 && (
        <>
          <SectionHeader title="Rescheduled Sessions" />
          {data.rescheduled.map((b) => (
            <GlassCard key={b.id} style={styles.simpleRow}>
              <Text style={styles.simpleRowTime}>{formatSessionTime(b.scheduled_start)}</Text>
              <Badge label="Rescheduled" tone="outline" />
            </GlassCard>
          ))}
        </>
      )}

      <SectionHeader title="Your Clients" actionLabel="View all" onAction={() => router.push('/clients')} />
      {data.clients.length === 0 && <EmptyState message="No clients assigned yet." icon="people-outline" />}
      {data.clients.slice(0, 3).map((c) => (
        <Pressable key={c.id} onPress={() => router.push({ pathname: '/clients/[id]', params: { id: c.id } })} accessibilityRole="button">
          <GlassCard style={styles.clientRow}>
            <Avatar photoUrl={c.photo_url} name={c.full_name} size={40} />
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{c.full_name}</Text>
              <StatusBadge status={c.status} />
            </View>
          </GlassCard>
        </Pressable>
      ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCell: { width: '47%' },
  linkCard: { gap: 4 },
  linkBody: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  simpleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  simpleRowTime: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#FFFFFF' },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clientInfo: { gap: 4 },
  clientName: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: '#FFFFFF' },
  reviewCard: { gap: 4 },
  reviewHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewTitle: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  reviewStars: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: Brand.yellow },
  reviewNote: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: '#FFFFFF', fontStyle: 'italic' },
  reviewMeta: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: 'rgba(255,255,255,0.45)' },
});
