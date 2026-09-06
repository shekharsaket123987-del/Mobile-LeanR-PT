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
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CoachTaskRow } from '@/components/coach-task-row';
import { LightAvatar } from '@/components/light/light-avatar';
import { LightBadge, LightStatusBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightStatCard } from '@/components/light/light-stat-card';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { useAuth } from '@/lib/auth/auth-context';
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
import { getMyPerformance, getMyUtilization } from '@/lib/data/coach-performance';
import { useAsync } from '@/lib/data/use-async';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function CoachDashboard() {
  const { session } = useAuth();
  const { data, loading, error, reload } = useAsync(async () => {
    const [today, thisWeekCount, performance, utilization, escalations, pendingTasks, upcoming3Days, cancelled, rescheduled, clients] =
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
      ]);
    const attendanceMap = await getAttendanceMap(today.map((b) => b.id));
    return { today, thisWeekCount, performance, utilization, escalations, pendingTasks, upcoming3Days, cancelled, rescheduled, clients, attendanceMap };
  }, []);

  if (loading) {
    return (
      <LightScreenScaffold title="Dashboard">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }
  if (error || !data) {
    return (
      <LightScreenScaffold title="Dashboard">
        <LightErrorState message={error ?? 'Something went wrong.'} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  const activeEscalations = data.escalations.filter((e) => e.status !== 'resolved').length;

  return (
    <LightScreenScaffold title="Dashboard">
      <View style={styles.statGrid}>
        <View style={styles.statCell}>
          <LightStatCard value={String(data.today.length)} label="TODAY" />
        </View>
        <View style={styles.statCell}>
          <LightStatCard value={String(data.thisWeekCount)} label="THIS WEEK" />
        </View>
        <View style={styles.statCell}>
          <LightStatCard value={String(data.performance.completedSessions)} label="COMPLETED" />
        </View>
        <View style={styles.statCell}>
          <LightStatCard value={String(data.performance.missedSessions)} label="MISSED" />
        </View>
        <View style={styles.statCell}>
          <LightStatCard value={data.utilization != null ? `${Math.round(data.utilization)}%` : '—'} label="UTILIZATION" />
        </View>
        <View style={styles.statCell}>
          <LightStatCard
            value={data.performance.averageTrainerRating != null ? data.performance.averageTrainerRating.toFixed(1) : '—'}
            label="AVG RATING"
          />
        </View>
        <View style={styles.statCell}>
          <LightStatCard value={String(activeEscalations)} label="ACTIVE ESCALATIONS" emphasize={activeEscalations > 0} />
        </View>
      </View>

      <LightSectionHeader title="Today's Tasks" />
      {data.today.length === 0 && <LightEmptyState message="No sessions today." icon="checkmark-circle-outline" />}
      {data.today.map((booking) => (
        <CoachTaskRow key={booking.id} booking={booking} attendanceStatus={data.attendanceMap[booking.id] ?? null} onChanged={reload} />
      ))}

      <Pressable onPress={() => router.push('/pending-tasks')} accessibilityRole="button">
        <LightCard style={styles.linkCard}>
          <LightSectionHeader title="Pending Tasks" />
          <Text style={styles.linkBody}>
            {data.pendingTasks.length === 0
              ? 'Nothing owed — you’re all caught up.'
              : `${data.pendingTasks.length} session${data.pendingTasks.length === 1 ? '' : 's'} still owed attendance or notes.`}
          </Text>
        </LightCard>
      </Pressable>

      <LightSectionHeader title="Upcoming (Next 3 Days)" />
      {data.upcoming3Days.length === 0 && <LightEmptyState message="Nothing on the calendar for the next 3 days." icon="calendar-outline" />}
      {data.upcoming3Days.map((b) => (
        <LightCard key={b.id} style={styles.simpleRow}>
          <Text style={styles.simpleRowTime}>{formatSessionTime(b.scheduled_start)}</Text>
          <LightStatusBadge status={b.status} />
        </LightCard>
      ))}

      {data.cancelled.length > 0 && (
        <>
          <LightSectionHeader title="Cancelled Sessions" />
          {data.cancelled.map((b) => (
            <LightCard key={b.id} style={styles.simpleRow}>
              <Text style={styles.simpleRowTime}>{formatSessionTime(b.scheduled_start)}</Text>
              <LightBadge label={`Cancelled by ${b.cancelled_by === session?.user.id ? 'you' : 'client'}`} tone="red" />
            </LightCard>
          ))}
        </>
      )}

      {data.rescheduled.length > 0 && (
        <>
          <LightSectionHeader title="Rescheduled Sessions" />
          {data.rescheduled.map((b) => (
            <LightCard key={b.id} style={styles.simpleRow}>
              <Text style={styles.simpleRowTime}>{formatSessionTime(b.scheduled_start)}</Text>
              <LightBadge label="Rescheduled" tone="outline" />
            </LightCard>
          ))}
        </>
      )}

      <LightSectionHeader title="Your Clients" actionLabel="View all" onAction={() => router.push('/clients')} />
      {data.clients.length === 0 && <LightEmptyState message="No clients assigned yet." icon="people-outline" />}
      {data.clients.slice(0, 3).map((c) => (
        <Pressable key={c.id} onPress={() => router.push({ pathname: '/clients/[id]', params: { id: c.id } })} accessibilityRole="button">
          <LightCard style={styles.clientRow}>
            <LightAvatar photoUrl={c.photo_url} name={c.full_name} size={40} />
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{c.full_name}</Text>
              <LightStatusBadge status={c.status} />
            </View>
          </LightCard>
        </Pressable>
      ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCell: { width: '47%' },
  linkCard: { gap: 4 },
  linkBody: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textSecondary },
  simpleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  simpleRowTime: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.navy },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clientInfo: { gap: 4 },
  clientName: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: LightBrand.navy },
});
