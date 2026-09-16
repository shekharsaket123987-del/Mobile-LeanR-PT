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
import {
  cancelBooking,
  canRateThisWeek,
  getRescheduledSessions,
  getSchedulingRules,
  getSessionsByStatus,
  getWorkoutNotesForBookings,
  rateSession,
  type SchedulingRules,
} from '@/lib/data/bookings';
import { getMyClientProfileId } from '@/lib/data/identity';
import { acknowledgeShadowCoverage, getMyActiveShadowCoverage } from '@/lib/data/shadow-coverage';
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

function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3600_000;
}

/**
 * reschedule.md §6.1/§11.7 — per-row policy display, computed from the same
 * live cutoff settings + weekly-usage count the server-side action would
 * use. Advisory only: the Cancel/Reschedule actions themselves re-validate
 * independently (reschedule.md §11: "never trust a client-computed allowed
 * flag as authorization").
 */
function SchedulingActionRow({
  booking,
  rules,
  onCancel,
}: {
  booking: Booking;
  rules: SchedulingRules;
  onCancel: () => void;
}) {
  const hrs = hoursUntil(booking.scheduled_start);
  const canCancel = hrs > rules.cancellationCutoffHours;
  const canReschedule = hrs > rules.rescheduleCutoffHours && rules.reschedulesRemaining > 0;
  const cancellableUntil = new Date(new Date(booking.scheduled_start).getTime() - rules.cancellationCutoffHours * 3600_000);
  const reschedulableUntil = new Date(new Date(booking.scheduled_start).getTime() - rules.rescheduleCutoffHours * 3600_000);

  return (
    <View>
      <View style={lightStyles.actionRow}>
        <LightTextLink onPress={() => router.push(`/reschedule/${booking.id}`)} disabled={!canReschedule} style={!canReschedule && lightStyles.actionDisabled}>
          Reschedule
        </LightTextLink>
        <LightTextLink onPress={onCancel} disabled={!canCancel} style={[lightStyles.cancelLink, !canCancel && lightStyles.actionDisabled]}>
          Cancel
        </LightTextLink>
      </View>
      <Text style={lightStyles.cutoffHint}>
        {canCancel ? `Cancellable until ${formatSessionTime(cancellableUntil.toISOString())}` : 'Cancellation window closed'}
      </Text>
      <Text style={lightStyles.cutoffHint}>
        {rules.reschedulesRemaining <= 0
          ? 'No reschedules left this week'
          : canReschedule
            ? `Reschedulable until ${formatSessionTime(reschedulableUntil.toISOString())}`
            : 'Reschedule window closed'}
      </Text>
    </View>
  );
}

function SchedulingPolicyBanner({ rules }: { rules: SchedulingRules }) {
  return (
    <LightCard variant="teal" style={lightStyles.policyBanner}>
      <Text style={lightStyles.policyText}>
        Sessions must be cancelled at least {rules.cancellationCutoffHours} hour{rules.cancellationCutoffHours === 1 ? '' : 's'} before start, or
        rescheduled at least {rules.rescheduleCutoffHours} hour{rules.rescheduleCutoffHours === 1 ? '' : 's'} before start.
      </Text>
      <Text style={lightStyles.policyText}>
        {rules.reschedulesRemaining} of 2 reschedules left this week.
      </Text>
    </LightCard>
  );
}

type SimpleTab = 'upcoming' | 'past';

function PrePurchaseSessionsScreen() {
  const [activeTab, setActiveTab] = useState<SimpleTab>('upcoming');
  const { data, loading, error, reload } = useAsync(async () => {
    const [sessions, rules] = await Promise.all([
      activeTab === 'upcoming' ? getSessionsByStatus('upcoming') : getSessionsByStatus('completed'),
      getSchedulingRules(),
    ]);
    return { sessions, rules };
  }, [activeTab]);
  const sessions = data?.sessions;
  const rules = data?.rules;

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
      {!loading && !error && activeTab === 'upcoming' && rules && <SchedulingPolicyBanner rules={rules} />}
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
            {booking.status === 'upcoming' && rules && <SchedulingActionRow booking={booking} rules={rules} onCancel={() => onCancel(booking.id)} />}
          </LightCard>
        ))}
    </LightScreenScaffold>
  );
}

function EnrolledSessionCard({
  booking,
  rules,
  canRate,
  notes,
  onCancelled,
  onRated,
}: {
  booking: Booking;
  rules: SchedulingRules;
  canRate: boolean;
  notes?: string;
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
      {/* GAP-04 / web spec §10, §12: read-only coach notes on a completed session. */}
      {notes && (
        <View style={lightStyles.notesBox}>
          <Text style={lightStyles.notesLabel}>COACH NOTES</Text>
          <Text style={lightStyles.notesText}>{notes}</Text>
        </View>
      )}
      {booking.status === 'upcoming' && <SchedulingActionRow booking={booking} rules={rules} onCancel={onCancel} />}
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
    const [sessions, clientId, rules] = await Promise.all([getSessionsForTab(activeTab), getMyClientProfileId(), getSchedulingRules()]);
    const canRate = clientId ? await canRateThisWeek(clientId) : false;
    // GAP-04: only completed sessions can have coach notes worth fetching.
    const completedIds = sessions.filter((s) => s.status === 'completed').map((s) => s.id);
    const notesById = await getWorkoutNotesForBookings(completedIds);
    return { sessions, canRate, notesById, rules };
  }, [activeTab]);

  // GAP-05: one-time acknowledgeable "Covering for {coach}" banner — separate load so it
  // doesn't get refetched on every tab switch.
  const { data: shadowCoverage, reload: reloadShadowCoverage } = useAsync(getMyActiveShadowCoverage, []);
  const onAcknowledgeShadow = async () => {
    if (!shadowCoverage) return;
    await acknowledgeShadowCoverage(shadowCoverage.id);
    reloadShadowCoverage();
  };

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
      {shadowCoverage && !shadowCoverage.acknowledged && (
        <LightCard variant="teal">
          <Text style={lightStyles.shadowText}>
            {shadowCoverage.shadowCoachName} is covering your sessions with {shadowCoverage.primaryCoachName} from{' '}
            {new Date(shadowCoverage.startsOn).toLocaleDateString()} to {new Date(shadowCoverage.endsOn).toLocaleDateString()}.
          </Text>
          <LightTextLink onPress={onAcknowledgeShadow}>Got it</LightTextLink>
        </LightCard>
      )}

      {/* GAP-10: ad-hoc "Book a session" removed for subscribed clients — sessions come from
          the recurring schedule once subscribed, matching web spec §13. */}
      <LightPrimaryButton size="lg" onPress={() => router.push('/my-schedule')}>
        Manage my schedule
      </LightPrimaryButton>

      <LightSegmentedControl options={TABS} value={activeTab} onChange={setActiveTab} />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && activeTab === 'upcoming' && data?.rules && <SchedulingPolicyBanner rules={data.rules} />}
      {!loading && !error && (data?.sessions.length ?? 0) === 0 && (
        <LightEmptyState message={`No ${activeTab} sessions.`} icon="calendar-clear-outline" />
      )}
      {!loading &&
        !error &&
        data?.rules &&
        (() => {
          const rules = data.rules;
          return data.sessions.map((booking) => (
            <EnrolledSessionCard
              key={booking.id}
              booking={booking}
              rules={rules}
              canRate={data.canRate}
              notes={data.notesById.get(booking.id)}
              onCancelled={reload}
              onRated={reload}
            />
          ));
        })()}
    </LightScreenScaffold>
  );
}

export default function SessionsScreen() {
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;
  return subscription ? <EnrolledSessionsScreen /> : <PrePurchaseSessionsScreen />;
}

const lightStyles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.navy },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: LightBrand.textSecondary },
  modeRow: { flexDirection: 'row', alignItems: 'center' },
  mode: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted },
  actionRow: { flexDirection: 'row', gap: 20, marginTop: 6 },
  cancelLink: { color: LightBrand.alertRed },
  notesBox: { marginTop: 8, gap: 3 },
  notesLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11, letterSpacing: 0.6, color: LightBrand.textMuted },
  notesText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textSecondary, lineHeight: 19 },
  shadowText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.tealDark, lineHeight: 19, marginBottom: 6 },
  actionDisabled: { color: LightBrand.textMuted },
  cutoffHint: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: LightBrand.textMuted, marginTop: 4 },
  policyBanner: { gap: 4 },
  policyText: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.tealDark, lineHeight: 17 },
});
