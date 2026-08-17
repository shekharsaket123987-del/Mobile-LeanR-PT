/**
 * Coach Schedule — LEANR_PT_MOBILE_PRD.md §5 "Day/Week toggle of
 * bookings". This phase builds the upcoming-bookings list; the day/week
 * toggle itself is a presentation detail left for a later pass.
 */
import { router } from 'expo-router';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Text } from 'react-native';
import { TextLink } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import { getCoachBookings } from '@/lib/data/coach-portal';
import { useAsync } from '@/lib/data/use-async';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CoachSchedule() {
  const { data: bookings, loading, error, reload } = useAsync(() => getCoachBookings('upcoming'), []);

  return (
    <ScreenScaffold title="Schedule">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (bookings?.length ?? 0) === 0 && <EmptyState message="No upcoming bookings." />}
      {!loading &&
        !error &&
        bookings?.map((booking) => (
          <Card key={booking.id}>
            <Text style={shared.cardLabel}>{formatSessionTime(booking.scheduled_start)}</Text>
            <TextLink
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: booking.id } })}
              style={{ fontFamily: 'Manrope_700Bold', fontSize: 14, color: Brand.yellow, marginTop: 4 }}>
              View →
            </TextLink>
          </Card>
        ))}
    </ScreenScaffold>
  );
}
