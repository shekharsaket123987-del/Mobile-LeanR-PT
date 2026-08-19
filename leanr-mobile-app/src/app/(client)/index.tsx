/**
 * Home (Client) — LEANR_PT_NEXTGEN_APP_PRD.md §9.1, wired to real data,
 * now carrying the motivation layer (§8): streak chip + milestone
 * celebration, both computed client-side from bookings already fetched.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { CelebrationOverlay } from '@/components/celebration-overlay';
import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { StreakChip } from '@/components/streak-chip';
import { CtaButton, TextLink } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { getUpcomingBookings } from '@/lib/data/bookings';
import { getMyCoach } from '@/lib/data/coach';
import { computeWeekStreak, getCompletedBookings, milestoneHitAt } from '@/lib/data/milestones';
import { getMySubscription, getSessionsUsedCount } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';
import { getJoinState, openZoomLink } from '@/lib/data/zoom';

const LAST_CELEBRATED_KEY = 'leanr.lastCelebratedMilestone';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const { data, loading, error, reload } = useAsync(async () => {
    const [nextBookings, subscription, coach, completedBookings] = await Promise.all([
      getUpcomingBookings(1),
      getMySubscription(),
      getMyCoach(),
      getCompletedBookings(),
    ]);
    const sessionsUsed = subscription ? await getSessionsUsedCount(subscription.id) : null;
    return { nextBookings, subscription, coach, completedBookings, sessionsUsed };
  }, []);
  const [milestone, setMilestone] = useState<number | null>(null);

  const greetingName = profile?.full_name?.split(' ')[0] ?? session?.user.email?.split('@')[0] ?? 'there';
  const { nextBookings, subscription, coach, completedBookings, sessionsUsed } =
    data ?? { nextBookings: [], subscription: null, coach: null, completedBookings: [], sessionsUsed: null };
  const nextBooking = nextBookings?.[0] ?? null;
  const streakWeeks = completedBookings ? computeWeekStreak(completedBookings) : 0;

  useEffect(() => {
    if (!completedBookings || completedBookings.length === 0) return;
    const hit = milestoneHitAt(completedBookings.length);
    if (!hit) return;

    AsyncStorage.getItem(LAST_CELEBRATED_KEY).then((lastRaw) => {
      const last = lastRaw ? Number(lastRaw) : 0;
      if (hit > last) {
        setMilestone(hit);
        AsyncStorage.setItem(LAST_CELEBRATED_KEY, String(hit));
      }
    });
  }, [completedBookings]);

  return (
    <ScreenScaffold title={`Hi ${greetingName} 👋`}>
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <StreakChip weeks={streakWeeks} />

          {nextBooking ? (
            <Card>
              <Text style={shared.cardLabel}>NEXT SESSION</Text>
              <Text style={shared.bigStat}>{formatSessionTime(nextBooking.scheduled_start)}</Text>
              {coach && <Text style={shared.cardLabel}>with {coach.full_name}</Text>}
              <JoinRow booking={nextBooking} />
            </Card>
          ) : (
            <EmptyState message="No upcoming sessions booked yet." />
          )}

          {subscription && (
            <Card>
              <Text style={shared.cardLabel}>THIS PLAN</Text>
              <Text style={shared.bigStat}>
                {sessionsUsed ?? '—'} / {subscription.sessions_total ?? '—'} sessions
              </Text>
            </Card>
          )}

          <CtaButton onPress={() => router.push(nextBooking ? '/sessions' : '/book-session')}>
            {nextBooking ? 'View sessions' : 'Book a session'}
          </CtaButton>
        </>
      )}

      {milestone && (
        <CelebrationOverlay
          title={`${milestone} sessions! 🎉`}
          subtitle="Your consistency is showing — keep it up."
          onDismiss={() => setMilestone(null)}
        />
      )}
    </ScreenScaffold>
  );
}

const JOIN_LABEL: Record<ReturnType<typeof getJoinState>, string | null> = {
  'too-early': 'Join opens 10 min before start',
  joinable: 'Join session →',
  ended: null,
};

function JoinRow({ booking }: { booking: Parameters<typeof getJoinState>[0] }) {
  const state = getJoinState(booking);
  const label = JOIN_LABEL[state];
  const [joining, setJoining] = useState(false);
  if (!label) return null;

  const onJoin = async () => {
    setJoining(true);
    try {
      await openZoomLink(booking);
    } catch (err) {
      Alert.alert('Could not join', err instanceof Error ? err.message : String(err));
    } finally {
      setJoining(false);
    }
  };

  return (
    <TextLink
      disabled={state !== 'joinable' || joining}
      onPress={onJoin}
      style={{
        fontFamily: 'Manrope_700Bold',
        fontSize: 14,
        color: state === 'joinable' ? Brand.yellow : '#888',
        marginTop: 8,
      }}>
      {joining ? 'Starting meeting…' : label}
    </TextLink>
  );
}
