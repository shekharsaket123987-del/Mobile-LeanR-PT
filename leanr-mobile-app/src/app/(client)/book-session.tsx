/**
 * Book a Session — LEANR_PT_MOBILE_PRD.md §10 "Screen: Book a Session",
 * §13 rules 1-4. Hold->confirm ad-hoc booking wizard — see
 * src/lib/data/booking-wizard.ts for the RPC/schema detail this was built
 * against. Relit for the post-purchase light theme (mockup frame 11) —
 * real month calendar via `LightCalendarGrid` instead of a date-chip row.
 *
 * Reached from Sessions ("+ Book a Session") and Home ("Book a session"
 * when no upcoming booking exists) — not a tab itself, hidden from the
 * tab bar via `href: null` in the (client) layout.
 *
 * Deliberately out of scope here (see README open items): recurring
 * schedule setup/change, and demo/assessment booking (a different
 * RPC path — confirmDemoBooking — with different matching rules, §15).
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { RateSessionSheet } from '@/components/rate-session-sheet';
import { LightCalendarGrid } from '@/components/light/light-calendar-grid';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightStatCard } from '@/components/light/light-stat-card';
import { LightTextLink } from '@/components/light/light-tappable';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import {
  addIstDays,
  confirmHold,
  formatIstDateLabel,
  formatIstTimeLabel,
  getAvailableCoaches,
  getBookingSettings,
  getOpenSlotsForCoachOnDate,
  holdSlot,
  todayIst,
  type IstDate,
} from '@/lib/data/booking-wizard';
import { getMyCoach } from '@/lib/data/coach';
import { getUnratedCompletedDemo } from '@/lib/data/demo-booking';
import { rateSession } from '@/lib/data/bookings';
import { getMySubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

type Phase = 'pick' | 'holding' | 'review' | 'confirming' | 'success';

export default function BookSessionScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [coach, subscription, coaches, settings, unratedDemo] = await Promise.all([
      getMyCoach(),
      getMySubscription(),
      getAvailableCoaches(),
      getBookingSettings(),
      getUnratedCompletedDemo(),
    ]);
    return { coach, subscription, coaches, settings, unratedDemo };
  }, []);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);

  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<IstDate>(() => addIstDays(todayIst(), 1));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const coach = data?.coach ?? null;
  const subscription = data?.subscription ?? null;
  const settings = data?.settings ?? null;
  const coaches = data?.coaches ?? [];
  // No coach assigned yet -> default to the first available one until the
  // client taps a different chip. Derived directly from render inputs
  // (no effect needed) so there's nothing to keep in sync.
  const coachId = coach?.id ?? selectedCoachId ?? coaches[0]?.id ?? null;
  const activeCoachName = coach?.full_name ?? coaches.find((c) => c.id === coachId)?.full_name ?? null;

  useEffect(() => {
    if (!coachId || !settings) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setSlots(null);
      setSelectedSlot(null);
      setSlotsLoading(true);
    });
    getOpenSlotsForCoachOnDate(coachId, selectedDate, settings.defaultSessionDurationMinutes, {
      startHour: settings.bookingWindowStartHour,
      endHour: settings.bookingWindowEndHour,
    })
      .then((result) => {
        if (!cancelled) setSlots(result);
      })
      .catch((err) => {
        if (!cancelled) setActionError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, selectedDate, settings]);

  useEffect(() => {
    if (phase !== 'review' || holdSecondsLeft <= 0) return;
    const timer = setInterval(() => setHoldSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [phase, holdSecondsLeft]);

  const onPickSlot = async (slotIso: string) => {
    if (!coachId || !settings) return;
    setSelectedSlot(slotIso);
    setActionError(null);
    setPhase('holding');
    try {
      const id = await holdSlot(coachId, slotIso, settings.defaultSessionDurationMinutes);
      setHoldId(id);
      setHoldSecondsLeft(settings.temporaryBookingHoldMinutes * 60);
      setPhase('review');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setPhase('pick');
    }
  };

  const onConfirm = async () => {
    if (!holdId || !subscription) return;
    setPhase('confirming');
    setActionError(null);
    try {
      await confirmHold(holdId, subscription.id);
      setPhase('success');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setPhase('pick');
      setHoldId(null);
    }
  };

  const onRestart = () => {
    setPhase('pick');
    setHoldId(null);
    setSelectedSlot(null);
    setActionError(null);
  };

  if (loading) {
    return (
      <LightScreenScaffold title="Book a Session">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }

  if (error) {
    return (
      <LightScreenScaffold title="Book a Session">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  const unratedDemo = !feedbackDismissed ? (data?.unratedDemo ?? null) : null;
  const onSubmitDemoFeedback = async (rating: { qualityRating: number; trainerRating: number; note: string }) => {
    if (!unratedDemo) return;
    await rateSession(unratedDemo.bookingId, rating);
    setFeedbackDismissed(true);
  };

  if (!subscription) {
    return (
      <LightScreenScaffold title="Book a Session">
        <LightEmptyState message="You need an active plan before you can book a session." icon="lock-closed-outline" />
        <LightPrimaryButton size="lg" onPress={() => router.push('/plans')}>
          View plans
        </LightPrimaryButton>
        <RateSessionSheet
          visible={!!unratedDemo}
          title={unratedDemo?.coachName ? `Rate your session with ${unratedDemo.coachName}` : 'Rate your demo session'}
          onClose={() => setFeedbackDismissed(true)}
          onSubmit={onSubmitDemoFeedback}
        />
      </LightScreenScaffold>
    );
  }

  if (!coach && coaches.length === 0) {
    return (
      <LightScreenScaffold title="Book a Session">
        <LightEmptyState message="No coaches are available to book right now." />
      </LightScreenScaffold>
    );
  }

  if (phase === 'success') {
    return (
      <LightScreenScaffold title="Booked!">
        <LightStatCard emphasize value={formatIstDateLabel(selectedDate)} label="SESSION CONFIRMED" />
        <LightCard>
          {selectedSlot && <Text style={styles.metaText}>{formatIstTimeLabel(selectedSlot)}</Text>}
          {activeCoachName && <Text style={styles.metaText}>with {activeCoachName}</Text>}
        </LightCard>
        <LightPrimaryButton size="lg" onPress={() => router.replace('/sessions')}>
          View my sessions
        </LightPrimaryButton>
      </LightScreenScaffold>
    );
  }

  if (phase === 'review' || phase === 'confirming') {
    return (
      <LightScreenScaffold title="Confirm your session">
        <LightCard variant="teal">
          <Text style={styles.eyebrow}>{formatIstDateLabel(selectedDate)}</Text>
          <Text style={styles.bigTime}>{selectedSlot ? formatIstTimeLabel(selectedSlot) : ''}</Text>
          {activeCoachName && <Text style={styles.metaText}>with {activeCoachName}</Text>}
          <Text style={styles.holdTimer}>
            {holdSecondsLeft > 0
              ? `Hold expires in ${Math.floor(holdSecondsLeft / 60)}:${String(holdSecondsLeft % 60).padStart(2, '0')}`
              : 'Hold expired — go back and pick a slot again'}
          </Text>
        </LightCard>
        {actionError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {actionError}
          </Text>
        )}
        <LightPrimaryButton size="lg" onPress={onConfirm} loading={phase === 'confirming'} disabled={holdSecondsLeft <= 0}>
          Confirm booking
        </LightPrimaryButton>
        <LightTextLink onPress={onRestart}>Pick a different slot</LightTextLink>
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Book a Session" subtitle={activeCoachName ? `with ${activeCoachName}` : undefined}>
      {!coach && coaches.length > 0 && (
        <LightCard>
          <LightSectionHeader title="Choose a coach" />
          <LightChipGrid>
            {coaches.map((c) => (
              <LightChip key={c.id} label={c.full_name} selected={c.id === selectedCoachId} onPress={() => setSelectedCoachId(c.id)} />
            ))}
          </LightChipGrid>
        </LightCard>
      )}

      <LightCard>
        <LightSectionHeader title="Pick a date" />
        <Text style={styles.selectedDateText}>{formatIstDateLabel(selectedDate)}</Text>
        <LightCalendarGrid selected={selectedDate} onSelect={setSelectedDate} minDate={addIstDays(todayIst(), 1)} initialMonth={selectedDate} />
      </LightCard>

      <LightCard>
        <LightSectionHeader title="Available times" />
        {slotsLoading && <LightLoadingState rows={1} />}
        {!slotsLoading && slots && slots.length === 0 && (
          <LightEmptyState message="No open slots this day — try another date." icon="calendar-clear-outline" />
        )}
        {!slotsLoading && slots && slots.length > 0 && (
          <LightChipGrid>
            {slots.map((s) => (
              <LightChip key={s} label={formatIstTimeLabel(s)} selected={s === selectedSlot} onPress={() => onPickSlot(s)} />
            ))}
          </LightChipGrid>
        )}
      </LightCard>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}
      {phase === 'holding' && <LightLoadingState rows={1} />}

      <RateSessionSheet
        visible={!!unratedDemo}
        title={unratedDemo?.coachName ? `Rate your session with ${unratedDemo.coachName}` : 'Rate your demo session'}
        onClose={() => setFeedbackDismissed(true)}
        onSubmit={onSubmitDemoFeedback}
      />
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: LightBrand.textSecondary },
  selectedDateText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.teal, marginBottom: 4 },
  bigTime: { fontFamily: 'Manrope_800ExtraBold', fontSize: 34, color: LightBrand.navy },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: LightBrand.textSecondary },
  holdTimer: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: LightBrand.amber, marginTop: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
});
