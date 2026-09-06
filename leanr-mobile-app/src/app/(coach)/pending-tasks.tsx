/**
 * Pending Tasks — New PRD.md §4.B: promotes the Dashboard's Pending Tasks
 * widget (any-day `upcoming` bookings already past their time, owed
 * attendance/notes) to its own screen, matching the mockup's frame 8.
 * The mockup's "All(3)/Clients(2)/Admin(1)" tabs aren't reproduced —
 * "pending tasks" in the PRD is exactly this one concept (owed
 * attendance/notes), nothing broader like a general admin-tasks inbox,
 * so there's no real second category to split out.
 *
 * Reached from the Dashboard's "Pending Tasks" card — not a tab itself,
 * hidden via `href: null` in the (coach) layout.
 */
import { CoachTaskRow } from '@/components/coach-task-row';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { getAttendanceMap, getCoachPendingTasks } from '@/lib/data/coach-portal';
import { useAsync } from '@/lib/data/use-async';

export default function PendingTasksScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const tasks = await getCoachPendingTasks();
    const attendanceMap = await getAttendanceMap(tasks.map((b) => b.id));
    return { tasks, attendanceMap };
  }, []);

  return (
    <LightScreenScaffold title="Pending Tasks">
      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (data?.tasks.length ?? 0) === 0 && (
        <LightEmptyState message="Nothing owed — you’re all caught up." icon="checkmark-circle-outline" />
      )}
      {!loading &&
        !error &&
        data?.tasks.map((booking) => (
          <CoachTaskRow key={booking.id} booking={booking} attendanceStatus={data.attendanceMap[booking.id] ?? null} onChanged={reload} />
        ))}
    </LightScreenScaffold>
  );
}
