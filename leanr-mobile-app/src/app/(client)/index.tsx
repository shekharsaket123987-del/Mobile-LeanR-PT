/**
 * Home (Client) — dual-branch (New PRD.md pre-purchase redesign). Before
 * any purchase: light "Your Demo is Scheduled" hero (mockup's Home
 * frames), reusing the same `getUpcomingBookings`/`getMyCoach` data (a
 * demo booking already surfaces here structurally — `getUpcomingBookings`
 * has no session-type filter). After purchase: the existing dark
 * dashboard, unchanged, moved into `EnrolledHomeScreen`.
 */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CelebrationOverlay } from '@/components/celebration-overlay';
import { StreakChip } from '@/components/streak-chip';
import { Avatar } from '@/components/ui/avatar';
import { IconButton, PrimaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { ProfileButton } from '@/components/ui/profile-menu';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { StatCard } from '@/components/ui/stat-card';
import { Brand, DisplayFont } from '@/constants/theme';
import { LightAvatar } from '@/components/light/light-avatar';
import { LightPrimaryButton, LightSecondaryButton } from '@/components/light/light-button';
import { LightCard } from '@/components/light/light-card';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
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
      Alert.alert('Could not add to calendar', err instanceof Error ? err.message : String(err));
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

  if (gate === 'checking') return null; // launch animation overlay still covers this briefly; avoids flashing dashboard widgets before the gate resolves

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['rgba(245,217,10,0.07)', 'rgba(245,217,10,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.glow}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>WELCOME BACK</Text>
            <Text style={styles.greeting}>Hi {greetingName} 👋</Text>
          </View>
          <View style={styles.topActions}>
            <IconButton accessibilityLabel="Notifications" onPress={() => router.push('/notifications')}>
              <Ionicons name="notifications-outline" size={19} color="#FFFFFF" />
            </IconButton>
            <ProfileButton />
          </View>
        </View>

        <View style={styles.scroll}>
          {loading && <LoadingState />}
          {error && <ErrorState message={error} onRetry={reload} />}

          {!loading && !error && (
            <>
              <StreakChip weeks={streakWeeks} />

              {nextBooking ? (
                <GlassCard variant="yellow" style={styles.heroCard}>
                  <Text style={styles.heroEyebrow}>NEXT SESSION</Text>
                  <Text style={styles.heroDay}>{formatSessionDay(nextBooking.scheduled_start)}</Text>
                  <Text style={styles.heroTime}>{formatSessionTime(nextBooking.scheduled_start)}</Text>

                  <View style={styles.coachRow}>
                    <Avatar photoUrl={coach?.photo_url} name={nextBooking.coach_name ?? coach?.full_name} size={36} />
                    <Text style={styles.coachName} numberOfLines={1}>
                      with {nextBooking.coach_name ?? coach?.full_name ?? 'your coach'}
                    </Text>
                  </View>

                  <JoinRow booking={nextBooking} />
                </GlassCard>
              ) : (
                <GlassCard>
                  <EmptyState
                    message="No upcoming sessions booked yet."
                    icon="calendar-outline"
                    actionLabel="Book a session"
                    onAction={() => router.push('/book-session')}
                  />
                </GlassCard>
              )}

              {subscription && (
                <StatCard
                  value={`${sessionsUsed ?? '—'}/${subscription.sessions_total ?? '—'}`}
                  label="SESSIONS THIS MONTH"
                />
              )}

              <PrimaryButton size="lg" onPress={() => router.push(nextBooking ? '/sessions' : '/book-session')}>
                {nextBooking ? 'View sessions' : 'Book a session'}
              </PrimaryButton>
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

const JOIN_LABEL: Record<ReturnType<typeof getJoinState>, string | null> = {
  'too-early': 'Join opens 10 min before start',
  joinable: 'Join session',
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

  if (state !== 'joinable') {
    return <Text style={styles.joinHint}>{label}</Text>;
  }

  return (
    <PrimaryButton size="md" onPress={onJoin} loading={joining} style={styles.joinButton}>
      {joining ? 'Starting…' : label}
    </PrimaryButton>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Brand.bg },
  flex: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 260 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 11, letterSpacing: 1, color: 'rgba(255,255,255,0.4)' },
  greeting: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 24, color: '#FFFFFF' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scroll: { flex: 1, padding: 20, paddingTop: 16, gap: 16 },
  heroCard: { gap: 4, paddingVertical: 20 },
  heroEyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 1, color: Brand.yellow },
  heroDay: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  heroTime: {
    fontFamily: DisplayFont,
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 44,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  coachName: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.8)', flexShrink: 1 },
  joinHint: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 14 },
  joinButton: { marginTop: 14, alignSelf: 'flex-start' },
});

const lightStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LightBrand.bg },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  greeting: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 22, color: LightBrand.navy, lineHeight: 26 },
  scroll: { flex: 1, padding: 20, paddingTop: 16, gap: 16 },
  heroCard: { gap: 6, paddingVertical: 18 },
  heroEyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: LightBrand.teal },
  heroDate: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: LightBrand.navy },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modeText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textSecondary },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  coachName: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: LightBrand.textPrimary },
  coachMeta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textSecondary },
  calendarButton: { marginTop: 10 },
  coachProfileButton: { marginTop: 8 },
});
