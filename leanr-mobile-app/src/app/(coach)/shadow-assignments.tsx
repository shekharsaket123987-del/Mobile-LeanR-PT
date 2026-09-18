/**
 * My Shadow Assignments (coach) — web spec §10 "Shadow coach" portal section: "Own list of
 * all their shadow assignments (past + active), scoped to themselves only." Read-only; the
 * covered client's sessions themselves already show up in the coach's normal Clients/Schedule
 * views since `bookings.coach_id` points at them for the assignment's date range.
 */
import { StyleSheet, Text } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { listMyShadowAssignments, type MyShadowAssignment } from '@/lib/data/coach-shadow';
import { useAsync } from '@/lib/data/use-async';

export default function ShadowAssignmentsScreen() {
  const { data: assignments, loading, error, reload } = useAsync(listMyShadowAssignments, []);

  return (
    <ScreenScaffold title="My Shadow Assignments" subtitle="Sessions you're covering for another coach">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (assignments ?? []).length === 0 && (
        <EmptyState message="You aren't covering for anyone right now." icon="shield-checkmark-outline" />
      )}
      {!loading && !error && (assignments ?? []).map((a) => <AssignmentRow key={a.id} assignment={a} />)}
    </ScreenScaffold>
  );
}

function AssignmentRow({ assignment }: { assignment: MyShadowAssignment }) {
  return (
    <GlassCard style={styles.row}>
      <Text style={styles.name}>{assignment.clientName}</Text>
      <Text style={styles.meta}>
        Covering {assignment.primaryCoachName}, {assignment.startsOn}
        {assignment.endsOn !== assignment.startsOn ? ` – ${assignment.endsOn}` : ''}
      </Text>
      <Badge label={assignment.status === 'active' ? 'Active' : 'Cancelled'} tone={assignment.status === 'active' ? 'green' : 'gray'} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, alignItems: 'flex-start' },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#FFFFFF' },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
});
