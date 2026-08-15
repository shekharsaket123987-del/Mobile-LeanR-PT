/**
 * Home (Client) — LEANR_PT_NEXTGEN_APP_PRD.md §9.1, wired to real data.
 * Mirrors the web dashboard's parallel-load pattern (original PRD §5:
 * "6 parallel actions") with the reads this phase actually built.
 */
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { getUpcomingBookings } from '@/lib/data/bookings';
import { getMyCoach } from '@/lib/data/coach';
import { getMySubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HomeScreen() {
  const { session } = useAuth();
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([getUpcomingBookings(1), getMySubscription(), getMyCoach()]),
    []
  );

  const greetingName = session?.user.email?.split('@')[0] ?? 'there';
  const [nextBookings, subscription, coach] = data ?? [[], null, null];
  const nextBooking = nextBookings?.[0] ?? null;

  return (
    <ScreenScaffold title={`Hi ${greetingName} 👋`}>
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          {nextBooking ? (
            <Card>
              <Text style={shared.cardLabel}>NEXT SESSION</Text>
              <Text style={shared.bigStat}>{formatSessionTime(nextBooking.scheduled_start)}</Text>
              {coach && <Text style={shared.cardLabel}>with {coach.full_name}</Text>}
            </Card>
          ) : (
            <EmptyState message="No upcoming sessions booked yet." />
          )}

          {subscription && (
            <Card>
              <Text style={shared.cardLabel}>THIS PLAN</Text>
              <Text style={shared.bigStat}>
                {subscription.sessions_used ?? '—'} / {subscription.sessions_total ?? '—'} sessions
              </Text>
            </Card>
          )}

          <View style={shared.ctaButton}>
            <Text style={shared.ctaButtonText} onPress={() => router.push('/sessions')}>
              {nextBooking ? 'View sessions' : 'Book a session'}
            </Text>
          </View>
        </>
      )}
    </ScreenScaffold>
  );
}
