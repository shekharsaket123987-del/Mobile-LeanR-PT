/**
 * Sessions / My Schedule — dual-branch (New PRD.md pre-purchase
 * redesign). Pre-purchase (mockup's "My Schedule"): light list, 2 tabs
 * (Upcoming/Past), Reschedule/Cancel on upcoming demo bookings, no Rate
 * Session (the mockup's "Available Features" panel for a demo client
 * lists only Reschedule/Cancel, not rating). Post-purchase: the existing
 * dark 5-tab Sessions screen, unchanged.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { RateSessionSheet } from '@/components/rate-session-sheet';
import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { TextLink } from '@/components/tappable';
import { PrimaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Brand } from '@/constants/theme';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightCard } from '@/components/light/light-card';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightStatusBadge } from '@/components/light/light-badge';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightTextLink } from '@/components/light/light-tappable';
import { LightBrand } from '@/constants/light-theme';
import { cancelBooking, canRateThisWeek, getRescheduledSessions, getSessionsByStatus, rateSession } from '@/lib/data/bookings';
import { getMyClientProfileId } from '@/lib/data/identity';
import { getLatestSubscription } from '@/lib/data/subscription';
import type { Booking, BookingStatus } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';

type TabKey = BookingStatus | 'rescheduled';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'missed', label: 'Missed' },
  { key: 'rescheduled', label: 'Rescheduled' },
];

function getSessionsForTab(tab: TabKey) {
  return tab === 'rescheduled' ? getRescheduledSessions() : getSessionsByStatus(tab);
}

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type SimpleTab = 'upcoming' | 'past';

function PrePurchaseSessionsScreen() {
  const [activeTab, setActiveTab] = useState<SimpleTab>('upcoming');
  const { data: sessions, loading, error, reload } = useAsync(
    () => (activeTab === 'upcoming' ? getSessionsByStatus('upcoming') : getSessionsByStatus('completed')),
    [activeTab]
  );

  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const onCancel = (bookingId: string) => {
    Alert.alert('Cancel session?', 'This cannot be undone.', [
      { text: 'Keep session', style: 'cancel' },
      {
        text: 'Cancel session',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelBooking(bookingId, null);
            reload();
          } catch (err) {
            Alert.alert('Could not cancel', err instanceof Error ? err.message : String(err));
          }
        },
      },
    ]);
  };

  return (
    <LightScreenScaffold title="My Schedule">
      <LightSegmentedControl
        options={[
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'past', label: 'Past' },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (sessions?.length ?? 0) === 0 && <LightEmptyState message={`No ${activeTab} sessions.`} icon="calendar-clear-outline" />}
      {!loading &&
        !error &&
        sessions?.map((booking) => (
          <LightCard key={booking.id}>
            <View style={lightStyles.topRow}>
              <Text style={lightStyles.time}>{formatSessionTime(booking.scheduled_start)}</Text>
              <LightStatusBadge status={booking.status} />
            </View>
            {booking.coach_name && <Text style={lightStyles.meta}>{booking.coach_name}</Text>}
            <View style={lightStyles.modeRow}>
              <Text style={lightStyles.mode}>Online (Zoom)</Text>
            </View>
            {booking.status === 'upcoming' && (
              <View style={lightStyles.actionRow}>
                <LightTextLink onPress={() => router.push(`/reschedule/${booking.id}`)}>Reschedule</LightTextLink>
                <LightTextLink onPress={() => onCancel(booking.id)} style={lightStyles.cancelLink}>
                  Cancel
                </LightTextLink>
              </View>
            )}
          </LightCard>
        ))}
    </LightScreenScaffold>
  );
}

function SessionCard({
  booking,
  canRate,
  onCancelled,
  onRated,
}: {
  booking: Booking;
  canRate: boolean;
  onCancelled: () => void;
  onRated: () => void;
}) {
  const [rateSheetOpen, setRateSheetOpen] = useState(false);
  const alreadyRated = booking.quality_rating != null || booking.trainer_rating != null;

  const onCancel = () => {
    Alert.alert('Cancel session?', 'This cannot be undone.', [
      { text: 'Keep session', style: 'cancel' },
      {
        text: 'Cancel session',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelBooking(booking.id, null);
            onCancelled();
          } catch (err) {
            Alert.alert('Could not cancel', err instanceof Error ? err.message : String(err));
          }
        },
      },
    ]);
  };

  return (
    <GlassCard>
      <View style={styles.cardTopRow}>
        <Text style={styles.time}>{formatSessionTime(booking.scheduled_start)}</Text>
        <StatusBadge status={booking.status} />
      </View>
      <View style={styles.metaRow}>
        {booking.coach_name && <Text style={styles.meta}>with {booking.coach_name}</Text>}
        {booking.was_rescheduled && <Badge label="Rescheduled" tone="outline" />}
      </View>
      {booking.status === 'upcoming' && (
        <View style={styles.actionRow}>
          <TextLink onPress={() => router.push(`/reschedule/${booking.id}`)} style={styles.rescheduleLink}>
            Reschedule
          </TextLink>
          <TextLink onPress={onCancel} style={styles.cancelLink}>
            Cancel session
          </TextLink>
        </View>
      )}
      {booking.status === 'completed' && !alreadyRated && (
        <View style={styles.actionRow}>
          <TextLink
            onPress={() => (canRate ? setRateSheetOpen(true) : Alert.alert("Can't rate yet", 'You can rate one session every 7 days.'))}
            style={styles.rescheduleLink}>
            Rate session
          </TextLink>
        </View>
      )}
      <RateSessionSheet
        visible={rateSheetOpen}
        onClose={() => setRateSheetOpen(false)}
        onSubmit={async (rating) => {
          await rateSession(booking.id, { qualityRating: rating.qualityRating, trainerRating: rating.trainerRating, note: rating.note });
          setRateSheetOpen(false);
          onRated();
        }}
      />
    </GlassCard>
  );
}

function EnrolledSessionsScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');
  const { data, loading, error, reload } = useAsync(async () => {
    const [sessions, clientId] = await Promise.all([getSessionsForTab(activeTab), getMyClientProfileId()]);
    const canRate = clientId ? await canRateThisWeek(clientId) : false;
    return { sessions, canRate };
  }, [activeTab]);

  useFocusEffect(
    useCallback(() => {
      reload();
      // reload() is stable-enough here (useAsync recreates it each render,
      // but it only bumps a tick counter) — depending on it would refetch
      // on every render; empty deps + useFocusEffect's own re-run-on-focus
      // behavior is what we actually want.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  return (
    <ScreenScaffold title="Sessions">
      <PrimaryButton size="lg" onPress={() => router.push('/book-session')}>
        Book a session
      </PrimaryButton>
      <TextLink onPress={() => router.push('/my-schedule')} style={styles.scheduleLink}>
        Manage my schedule
      </TextLink>

      <SegmentedControl options={TABS} value={activeTab} onChange={setActiveTab} />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (data?.sessions.length ?? 0) === 0 && (
        <EmptyState message={`No ${activeTab} sessions.`} icon="calendar-clear-outline" />
      )}
      {!loading &&
        !error &&
        data?.sessions.map((booking) => (
          <SessionCard key={booking.id} booking={booking} canRate={data.canRate} onCancelled={reload} onRated={reload} />
        ))}
    </ScreenScaffold>
  );
}

export default function SessionsScreen() {
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;
  return subscription ? <EnrolledSessionsScreen /> : <PrePurchaseSessionsScreen />;
}

const styles = StyleSheet.create({
  scheduleLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.yellow, marginTop: -8 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFFFFF' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  actionRow: { flexDirection: 'row', gap: 20, marginTop: 6 },
  rescheduleLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.yellow },
  cancelLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.alertRed },
});

const lightStyles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.navy },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: LightBrand.textSecondary },
  modeRow: { flexDirection: 'row', alignItems: 'center' },
  mode: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted },
  actionRow: { flexDirection: 'row', gap: 20, marginTop: 6 },
  cancelLink: { color: LightBrand.alertRed },
});
