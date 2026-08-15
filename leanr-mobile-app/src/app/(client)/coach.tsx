/**
 * Coach tab — LEANR_PT_NEXTGEN_APP_PRD.md §9.5, coach profile wired to
 * real data. Chat (conversations/messages + Realtime) is deliberately
 * deferred: its exact column names aren't documented anywhere in the PRD,
 * unlike coach_profiles/bookings, so guessing them risks a silently
 * broken write path rather than just a broken read — see README open
 * items.
 */
import { EmptyState, ErrorState, LoadingState, ScreenScaffold, Card, styles as shared } from '@/components/screen-scaffold';
import { Text } from 'react-native';

import { getMyCoach } from '@/lib/data/coach';
import { useAsync } from '@/lib/data/use-async';

export default function CoachScreen() {
  const { data: coach, loading, error, reload } = useAsync(getMyCoach, []);

  return (
    <ScreenScaffold title="Your Coach">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && !coach && <EmptyState message="No coach assigned yet." />}
      {!loading && !error && coach && (
        <Card>
          <Text style={shared.cardLabel}>COACH</Text>
          <Text style={shared.bigStat}>{coach.full_name}</Text>
          {coach.bio && <Text style={shared.cardLabel}>{coach.bio}</Text>}
        </Card>
      )}
    </ScreenScaffold>
  );
}
