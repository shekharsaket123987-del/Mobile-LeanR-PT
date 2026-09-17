/**
 * My Shadow Assignments (coach) — web spec §10 "Shadow coach" portal section: "Own list of
 * all their shadow assignments (past + active), scoped to themselves only." Read-only; the
 * covered client's sessions themselves already show up in the coach's normal Clients/Schedule
 * views since `bookings.coach_id` points at them for the assignment's date range.
 */
import { StyleSheet, Text } from 'react-native';

import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { listMyShadowAssignments, type MyShadowAssignment } from '@/lib/data/coach-shadow';
import { useAsync } from '@/lib/data/use-async';

export default function ShadowAssignmentsScreen() {
  const { data: assignments, loading, error, reload } = useAsync(listMyShadowAssignments, []);

  return (
    <LightScreenScaffold title="My Shadow Assignments" subtitle="Sessions you're covering for another coach">
      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (assignments ?? []).length === 0 && (
        <LightEmptyState message="You aren't covering for anyone right now." icon="shield-checkmark-outline" />
      )}
      {!loading && !error && (assignments ?? []).map((a) => <AssignmentRow key={a.id} assignment={a} />)}
    </LightScreenScaffold>
  );
}

function AssignmentRow({ assignment }: { assignment: MyShadowAssignment }) {
  return (
    <LightCard style={styles.row}>
      <Text style={styles.name}>{assignment.clientName}</Text>
      <Text style={styles.meta}>
        Covering {assignment.primaryCoachName}, {assignment.startsOn}
        {assignment.endsOn !== assignment.startsOn ? ` – ${assignment.endsOn}` : ''}
      </Text>
      <LightBadge label={assignment.status === 'active' ? 'Active' : 'Cancelled'} tone={assignment.status === 'active' ? 'green' : 'gray'} />
    </LightCard>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, alignItems: 'flex-start' },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: LightBrand.navy },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textSecondary },
});
