/**
 * Coach Dashboard — LEANR_PT_MOBILE_PRD.md §5 "day-at-a-glance stats +
 * Today's Tasks/Pending Tasks/Upcoming widgets", condensed to what this
 * phase built: today's bookings as tappable task rows into the session
 * workflow (§8b/§8c/§8d).
 */
import { router } from 'expo-router';
import { Text } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import { getCoachBookings } from '@/lib/data/coach-portal';
import { useAsync } from '@/lib/data/use-async';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function CoachDashboard() {
  const { data: bookings, loading, error, reload } = useAsync(() => getCoachBookings('today'), []);

  return (
    <ScreenScaffold title="Today's Tasks">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (bookings?.length ?? 0) === 0 && <EmptyState message="No sessions today." />}
      {!loading &&
        !error &&
        bookings?.map((booking) => (
          <Card key={booking.id}>
            <Text style={shared.cardLabel}>{formatSessionTime(booking.scheduled_start)}</Text>
            <Text
              style={{ fontFamily: 'Manrope_700Bold', fontSize: 15, color: Brand.yellow, marginTop: 4 }}
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: booking.id } })}>
              Open session →
            </Text>
          </Card>
        ))}
    </ScreenScaffold>
  );
}
