/**
 * Sessions ("Schedule" tab, mockup frame 10) — dual-branch. Pre-purchase
 * (mockup's "My Schedule" for a demo client): light list, 2 tabs
 * (Upcoming/Past), Reschedule/Cancel on upcoming demo bookings, no Rate
 * Session (the mockup's "Available Features" panel for a demo client
 * lists only Reschedule/Cancel, not rating).
 *
 * Enrolled (mockup frame 10, tab labeled "Schedule" in the layout): same
 * 5 status tabs (Upcoming/Completed/Cancelled/Missed/Rescheduled) and
 * Reschedule/Cancel/Rate logic as before this relight, just the light
 * palette — business logic untouched. The rate-session bottom sheet stays
 * the existing dark `RateSessionSheet` (a floating overlay surface, not
 * page background — same precedent as reusing the dark `CelebrationOverlay`
 * inside otherwise-light screens elsewhere in this app).
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { RateSessionSheet } from '@/components/rate-session-sheet';
import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightBadge, LightStatusBadge } from '@/components/light/light-badge';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightTextLink } from '@/components/light/light-tappable';
import { LightBrand } from '@/constants/light-theme';
import { cancelBooking, canRateThisWeek, getRescheduledSessions, getSessionsByStatus, rateSession } from '@/lib/data/bookings';
import { getMyClientProfileId } from '@/lib/data/identity';
import { getLatestSubscription } from '@/lib/data/subscription';
import type { Booking, BookingStatus } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

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
            Alert.alert('Could not cancel', getErrorMessage(err));
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

function EnrolledSessionCard({
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
            Alert.alert('Could not cancel', getErrorMessage(err));
          }
        },
      },
    ]);
  };

  return (
    <LightCard>
      <View style={lightStyles.topRow}>
        <Text style={lightStyles.time}>{formatSessionTime(booking.scheduled_start)}</Text>
        <LightStatusBadge status={booking.status} />
      </View>
      <View style={lightStyles.metaRow}>
        {booking.coach_name && <Text style={lightStyles.meta}>with {booking.coach_name}</Text>}
        {booking.was_rescheduled && <LightBadge label="Rescheduled" tone="outline" />}
      </View>
      {booking.status === 'upcoming' && (
        <View style={lightStyles.actionRow}>
          <LightTextLink onPress={() => router.push(`/reschedule/${booking.id}`)}>Reschedule</LightTextLink>
          <LightTextLink onPress={onCancel} style={lightStyles.cancelLink}>
            Cancel session
          </LightTextLink>
        </View>
      )}
      {booking.status === 'completed' && !alreadyRated && (
        <View style={lightStyles.actionRow}>
          <LightTextLink onPress={() => (canRate ? setRateSheetOpen(true) : Alert.alert("Can't rate yet", 'You can rate one session every 7 days.'))}>
            Rate session
          </LightTextLink>
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
    </LightCard>
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
    <LightScreenScaffold title="My Schedule">
      <LightPrimaryButton size="lg" onPress={() => router.push('/book-session')}>
        Book a session
      </LightPrimaryButton>
      <LightTextLink onPress={() => router.push('/my-schedule')} style={lightStyles.scheduleLink}>
        Manage my schedule
      </LightTextLink>

      <LightSegmentedControl options={TABS} value={activeTab} onChange={setActiveTab} />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (data?.sessions.length ?? 0) === 0 && (
        <LightEmptyState message={`No ${activeTab} sessions.`} icon="calendar-clear-outline" />
      )}
      {!loading &&
        !error &&
        data?.sessions.map((booking) => (
          <EnrolledSessionCard key={booking.id} booking={booking} canRate={data.canRate} onCancelled={reload} onRated={reload} />
        ))}
    </LightScreenScaffold>
  );
}

export default function SessionsScreen() {
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;
  return subscription ? <EnrolledSessionsScreen /> : <PrePurchaseSessionsScreen />;
}

const lightStyles = StyleSheet.create({
  scheduleLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: LightBrand.teal, marginTop: -8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.navy },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: LightBrand.textSecondary },
  modeRow: { flexDirection: 'row', alignItems: 'center' },
  mode: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted },
  actionRow: { flexDirection: 'row', gap: 20, marginTop: 6 },
  cancelLink: { color: LightBrand.alertRed },
});
