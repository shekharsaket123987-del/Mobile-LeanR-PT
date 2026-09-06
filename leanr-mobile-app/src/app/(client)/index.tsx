/**
 * Home (Client) — dual-branch. Before any purchase: light "Your Demo is
 * Scheduled" hero (mockup's Home frames), reusing the same
 * `getUpcomingBookings`/`getMyCoach` data (a demo booking already surfaces
 * here structurally — `getUpcomingBookings` has no session-type filter).
 * After purchase: the Active Client Portal's own light Home (mockup frame
 * 9) — journey/streak card, Next Session card, Today's Tasks checklist.
 *
 * Today's Tasks (log water/meal plan/track workout) is shown
 * disabled/"coming soon": no diet/workout-plan or daily-task-tracking
 * feature exists anywhere in the schema or PRD, so nothing is wired behind
 * it — see the redesign plan's "unbacked mockup elements" decision. The
 * Journey card shows a real, PRD-backed streak-week count
 * (`computeWeekStreak`, same as the PRD's "sessions/streak/progress-since-
 * Day-1 summary" dashboard requirement) rather than a fabricated "Week N
 * of 24" — there's no program-length-in-weeks field anywhere to back that
 * denominator.
 */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CelebrationOverlay } from '@/components/celebration-overlay';
import { IconButton } from '@/components/ui/button';
import { LightAvatar } from '@/components/light/light-avatar';
import { LightPrimaryButton, LightSecondaryButton } from '@/components/light/light-button';
import { LightCard } from '@/components/light/light-card';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { DisplayFont } from '@/constants/theme';
import { LightBrand } from '@/constants/light-theme';
import { useAuth } from '@/lib/auth/auth-context';
import { addToDeviceCalendar } from '@/lib/media/add-to-calendar';
import { getUpcomingBookings } from '@/lib/data/bookings';
import { getMyCoach } from '@/lib/data/coach';
import { getClientJourneyGate } from '@/lib/data/journey';
import { computeWeekStreak, getCompletedBookings, milestoneHitAt } from '@/lib/data/milestones';
import { getLatestSubscription, getMySubscription, getSessionsUsedCount } from '@/lib/data/subscription';
import type { Booking } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { getJoinState, openZoomLink } from '@/lib/data/zoom';
import { getErrorMessage } from '@/lib/data/errors';

const LAST_CELEBRATED_KEY = 'leanr.lastCelebratedMilestone';

function formatSessionDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long' });
}

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatSessionDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function PrePurchaseHomeScreen() {
  const { session, profile } = useAuth();
  const { data, loading, error, reload } = useAsync(async () => {
    const [nextBookings, coach] = await Promise.all([getUpcomingBookings(1), getMyCoach()]);
    return { nextBookings, coach };
  }, []);
  const [addingToCalendar, setAddingToCalendar] = useState(false);

  const greetingName = profile?.full_name?.split(' ')[0] ?? session?.user.email?.split('@')[0] ?? 'there';
  const nextBooking = data?.nextBookings?.[0] ?? null;
  const coach = data?.coach ?? null;

  const onAddToCalendar = async (booking: Booking) => {
    setAddingToCalendar(true);
    try {
      await addToDeviceCalendar({
        title: 'LEANR Demo Session',
        startDate: new Date(booking.scheduled_start),
        durationMinutes: booking.duration_minutes,
        notes: booking.zoom_join_url ?? undefined,
      });
      Alert.alert('Added', 'This session was added to your calendar.');
    } catch (err) {
      Alert.alert('Could not add to calendar', getErrorMessage(err));
    } finally {
      setAddingToCalendar(false);
    }
  };

  return (
    <View style={lightStyles.root}>
      <SafeAreaView style={lightStyles.flex} edges={['top']}>
        <View style={lightStyles.topBar}>
          <Text style={lightStyles.greeting}>Good Morning,{'\n'}{greetingName}!</Text>
          <IconButton accessibilityLabel="Notifications" onPress={() => router.push('/notifications')}>
            <Ionicons name="notifications-outline" size={19} color={LightBrand.navy} />
          </IconButton>
        </View>

        <View style={lightStyles.scroll}>
          {loading && <LightLoadingState />}
          {error && <LightErrorState message={error} onRetry={reload} />}

          {!loading && !error && nextBooking && (
            <LightCard style={lightStyles.heroCard}>
              <Text style={lightStyles.heroEyebrow}>YOUR DEMO IS SCHEDULED</Text>
              <Text style={lightStyles.heroDate}>{formatSessionDateTime(nextBooking.scheduled_start)}</Text>
              <View style={lightStyles.modeRow}>
                <Ionicons name="videocam-outline" size={15} color={LightBrand.teal} />
                <Text style={lightStyles.modeText}>Online (Zoom)</Text>
              </View>

              {coach && (
                <View style={lightStyles.coachRow}>
                  <LightAvatar photoUrl={coach.photo_url} name={nextBooking.coach_name ?? coach.full_name} size={40} />
                  <View>
                    <Text style={lightStyles.coachName}>{nextBooking.coach_name ?? coach.full_name}</Text>
                    {coach.rating != null && <Text style={lightStyles.coachMeta}>★ {coach.rating.toFixed(1)}</Text>}
                  </View>
                </View>
              )}

              <LightSecondaryButton size="md" onPress={() => onAddToCalendar(nextBooking)} loading={addingToCalendar} style={lightStyles.calendarButton}>
                Add to Calendar
              </LightSecondaryButton>
              {coach && (
                <LightPrimaryButton size="md" onPress={() => router.push('/coach')} style={lightStyles.coachProfileButton}>
                  View Coach Profile
                </LightPrimaryButton>
              )}
            </LightCard>
          )}

          {!loading && !error && !nextBooking && (
            <LightCard>
              <LightEmptyState message="No demo booked yet." icon="calendar-outline" actionLabel="Book a Free Demo" onAction={() => router.push('/demo-booking')} />
            </LightCard>
          )}

          <LightPrimaryButton size="lg" onPress={() => router.push('/(client)/plans')}>
            Choose Your Plan
          </LightPrimaryButton>
        </View>
      </SafeAreaView>
    </View>
  );
}

const JOIN_LABEL: Record<ReturnType<typeof getJoinState>, string | null> = {
  'too-early': 'Join opens 10 min before start',
  joinable: 'Join session',
  ended: null,
};

function EnrolledJoinRow({ booking }: { booking: Booking }) {
  const state = getJoinState(booking);
  const label = JOIN_LABEL[state];
  const [joining, setJoining] = useState(false);
  if (!label) return null;

  const onJoin = async () => {
    setJoining(true);
    try {
      await openZoomLink(booking);
    } catch (err) {
      Alert.alert('Could not join', getErrorMessage(err));
    } finally {
      setJoining(false);
    }
  };

  if (state !== 'joinable') {
    return <Text style={lightStyles.joinHint}>{label}</Text>;
  }

  return (
    <LightPrimaryButton size="md" onPress={onJoin} loading={joining} style={lightStyles.joinButton}>
      {joining ? 'Starting…' : label}
    </LightPrimaryButton>
  );
}

function TodaysTasksCard() {
  const tasks = ['Log your water intake', 'Complete your meal plan', 'Track your workout'];
  return (
    <LightCard>
      <View style={lightStyles.tasksHeader}>
        <Text style={lightStyles.tasksTitle}>Today&apos;s Tasks</Text>
        <Text style={lightStyles.comingSoonBadge}>Coming soon</Text>
      </View>
      {tasks.map((t) => (
        <View key={t} style={lightStyles.taskRow}>
          <Ionicons name="ellipse-outline" size={16} color={LightBrand.textMuted} />
          <Text style={lightStyles.taskText}>{t}</Text>
        </View>
      ))}
    </LightCard>
  );
}

function EnrolledHomeScreen() {
  const { session, profile } = useAuth();
  const [gate, setGate] = useState<'checking' | 'clear'>('checking');

  useEffect(() => {
    let cancelled = false;
    // The journey gate — New PRD.md §4.A calls the web app's Dashboard "the
    // master gate": a client with a pending activation or missing
    // onboarding (src/lib/data/journey.ts) must be routed there before this
    // screen's normal widgets render, not just left to fail against a
    // client who has neither yet.
    getClientJourneyGate()
      .then((result) => {
        if (cancelled) return;
        if (result === 'needs_activation') router.replace('/activate');
        else if (result === 'needs_onboarding') router.replace('/onboarding');
        else setGate('clear');
      })
      .catch(() => {
        if (!cancelled) setGate('clear'); // fail open — never trap a client on a blank screen over a gate-check error
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const { nextBookings, coach, completedBookings } = data ?? { nextBookings: [], subscription: null, coach: null, completedBookings: [], sessionsUsed: null };
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

  if (gate === 'checking') return null; // launch animation overlay still covers this briefly; avoids flashing dashboard widgets before the gate resolves

  return (
    <View style={lightStyles.root}>
      <SafeAreaView style={lightStyles.flex} edges={['top']}>
        <View style={lightStyles.topBar}>
          <Text style={lightStyles.greeting}>Good Morning,{'\n'}{greetingName}!</Text>
          <IconButton accessibilityLabel="Notifications" onPress={() => router.push('/notifications')}>
            <Ionicons name="notifications-outline" size={19} color={LightBrand.navy} />
          </IconButton>
        </View>

        <View style={lightStyles.scroll}>
          {loading && <LightLoadingState />}
          {error && <LightErrorState message={error} onRetry={reload} />}

          {!loading && !error && (
            <>
              <LightCard variant="teal" style={lightStyles.journeyCard}>
                <View style={lightStyles.journeyRow}>
                  <Ionicons name="leaf-outline" size={20} color={LightBrand.tealDark} />
                  <View>
                    <Text style={lightStyles.journeyTitle}>Your Journey</Text>
                    <Text style={lightStyles.journeySubtitle}>
                      {streakWeeks > 0 ? `${streakWeeks}-week streak — stay consistent!` : 'Complete this week to start your streak!'}
                    </Text>
                  </View>
                </View>
              </LightCard>

              {nextBooking ? (
                <LightCard style={lightStyles.heroCard}>
                  <Text style={lightStyles.heroEyebrow}>NEXT SESSION</Text>
                  <Text style={lightStyles.heroDate}>{formatSessionDay(nextBooking.scheduled_start)}</Text>
                  <Text style={lightStyles.heroTime}>{formatSessionTime(nextBooking.scheduled_start)}</Text>

                  <View style={lightStyles.coachRow}>
                    <LightAvatar photoUrl={coach?.photo_url} name={nextBooking.coach_name ?? coach?.full_name} size={36} />
                    <Text style={lightStyles.coachName} numberOfLines={1}>
                      with {nextBooking.coach_name ?? coach?.full_name ?? 'your coach'}
                    </Text>
                  </View>

                  <EnrolledJoinRow booking={nextBooking} />
                </LightCard>
              ) : (
                <LightCard>
                  <LightEmptyState
                    message="No upcoming sessions booked yet."
                    icon="calendar-outline"
                    actionLabel="Book a session"
                    onAction={() => router.push('/book-session')}
                  />
                </LightCard>
              )}

              <TodaysTasksCard />

              <LightPrimaryButton size="lg" onPress={() => router.push(nextBooking ? '/sessions' : '/book-session')}>
                {nextBooking ? 'View sessions' : 'Book a session'}
              </LightPrimaryButton>
            </>
          )}
        </View>
      </SafeAreaView>

      {milestone && (
        <CelebrationOverlay
          title={`${milestone} sessions! 🎉`}
          subtitle="Your consistency is showing — keep it up."
          onDismiss={() => setMilestone(null)}
        />
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;
  return subscription ? <EnrolledHomeScreen /> : <PrePurchaseHomeScreen />;
}

const lightStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LightBrand.bg },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  greeting: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 22, color: LightBrand.navy, lineHeight: 26 },
  scroll: { flex: 1, padding: 20, paddingTop: 16, gap: 16 },
  heroCard: { gap: 6, paddingVertical: 18 },
  heroEyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: LightBrand.teal },
  heroDate: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: LightBrand.navy },
  heroTime: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 34, color: LightBrand.navy, letterSpacing: -0.5 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modeText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textSecondary },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  coachName: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: LightBrand.textPrimary, flexShrink: 1 },
  coachMeta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textSecondary },
  calendarButton: { marginTop: 10 },
  coachProfileButton: { marginTop: 8 },
  joinHint: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textMuted, marginTop: 10 },
  joinButton: { marginTop: 10, alignSelf: 'flex-start' },
  journeyCard: { gap: 4 },
  journeyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  journeyTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: LightBrand.navy },
  journeySubtitle: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.tealDark },
  tasksHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tasksTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: LightBrand.navy },
  comingSoonBadge: { fontFamily: 'Manrope_600SemiBold', fontSize: 10.5, color: LightBrand.textMuted },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  taskText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textMuted },
});
