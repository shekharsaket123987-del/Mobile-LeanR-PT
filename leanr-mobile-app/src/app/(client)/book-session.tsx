/**
 * Book a Session — LEANR_PT_MOBILE_PRD.md §10 "Screen: Book a Session",
 * §13 rules 1-4. Hold->confirm ad-hoc booking wizard — see
 * src/lib/data/booking-wizard.ts for the RPC/schema detail this was built
 * against. Relit for the post-purchase light theme (mockup frame 11) —
 * real month calendar via `CalendarGrid` instead of a date-chip row.
 *
 * Reached from Sessions ("+ Book a Session") and Home ("Book a session"
 * when no upcoming booking exists) — not a tab itself, hidden from the
 * tab bar via `href: null` in the (client) layout.
 *
 * Deliberately out of scope here (see README open items): recurring
 * schedule setup/change, and demo/assessment booking (a different
 * RPC path — confirmDemoBooking — with different matching rules, §15).
 *
 * GAP-10 (web spec §13 route-guard map, matching both app PRD documents):
 * once a client has an active subscription, this ad-hoc wizard is
 * unreachable — it redirects to /my-schedule even on direct navigation,
 * same treatment web gives /client/book. Sessions happen through the
 * recurring schedule only once subscribed.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';

import { RateSessionSheet } from '@/components/rate-session-sheet';
import { CalendarGrid } from '@/components/ui/calendar-grid';
import { GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { TextLink } from '@/components/tappable';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
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
import { canRateThisWeek, rateSession } from '@/lib/data/bookings';
import { getMyCoach } from '@/lib/data/coach';
import { getUnratedCompletedDemo } from '@/lib/data/demo-booking';
import { getMyClientProfileId } from '@/lib/data/identity';
import { getClientJourneyState } from '@/lib/data/journey';
import { getMySubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';
import { Brand } from '@/constants/theme';

type Phase = 'pick' | 'holding' | 'review' | 'confirming' | 'success';

export default function BookSessionScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    // web spec §8.4/§9.2: the journey state carries its own demoSession detail in one
    // response — never a second, independent fetch for the same booking on this screen.
    const [coach, subscription, coaches, settings, unratedDemo, journeyState, clientId] = await Promise.all([
      getMyCoach(),
      getMySubscription(),
      getAvailableCoaches(),
      getBookingSettings(),
      getUnratedCompletedDemo(),
      getClientJourneyState(),
      getMyClientProfileId(),
    ]);
    // web spec §2.7/§6.9: the 7-day rating cap is GLOBAL across all of a client's bookings —
    // must gate this screen's demo-feedback sheet the same way sessions.tsx gates its own.
    const canRate = clientId ? await canRateThisWeek(clientId) : false;
    return { coach, subscription, coaches, settings, unratedDemo, journeyState, canRate };
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
  const journeyStage = data?.journeyState?.stage ?? 'marketing';
  const demoAssignedCoach = data?.journeyState?.demoSession ?? null;

  // GAP-10: server-verified guard, not just nav-hiding — re-checked on every load so a direct
  // deep link into this screen can't bypass the web-spec rule once a client is subscribed.
  useEffect(() => {
    if (!loading && subscription) {
      router.replace('/my-schedule');
    }
  }, [loading, subscription]);
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
        if (!cancelled) setActionError(getErrorMessage(err));
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
      setActionError(getErrorMessage(err));
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
      setActionError(getErrorMessage(err));
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

  // web spec §2.7/§6.9: rating is capped once per 7 days GLOBALLY across all of a client's
  // bookings — this demo-feedback gate must respect the same cap sessions.tsx's own "Rate
  // session" link enforces, not silently allow a bypass through this second entry point.
  useEffect(() => {
    if (!feedbackDismissed && data?.unratedDemo && data.canRate === false) {
      Promise.resolve().then(() => {
        Alert.alert("Can't rate yet", 'You can rate one session every 7 days.');
        setFeedbackDismissed(true);
      });
    }
  }, [data, feedbackDismissed]);

  if (loading) {
    return (
      <ScreenScaffold title="Book a Session">
        <LoadingState />
      </ScreenScaffold>
    );
  }

  if (error) {
    return (
      <ScreenScaffold title="Book a Session">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  const unratedDemo = !feedbackDismissed ? (data?.unratedDemo ?? null) : null;
  const onSubmitDemoFeedback = async (rating: { qualityRating: number; trainerRating: number; note: string }) => {
    if (!unratedDemo) return;
    await rateSession(unratedDemo.bookingId, rating);
    setFeedbackDismissed(true);
  };

  if (subscription) return null; // GAP-10: redirecting away via the effect above — avoid flashing the ad-hoc wizard first.

  // web spec §2.6/§2.9: the no-subscription case branches on journey stage — a demo in
  // flight (or just completed) changes what this screen shows, not a single generic message.
  if (!subscription) {
    if (journeyStage === 'demo_booked' && demoAssignedCoach) {
      return (
        <ScreenScaffold title="Book a Session">
          <GlassCard style={styles.demoStageCard}>
            <Text style={styles.demoStageTitle}>Your Demo Session Is Already Booked</Text>
            <Text style={styles.metaText}>
              {demoAssignedCoach.coachName} · {new Date(demoAssignedCoach.scheduledStart).toLocaleString()}
            </Text>
            <Text style={styles.metaText}>Ongoing session booking unlocks once your demo is done.</Text>
          </GlassCard>
        </ScreenScaffold>
      );
    }

    if (journeyStage === 'demo_completed') {
      return (
        <ScreenScaffold title="Book a Session">
          <GlassCard style={styles.demoStageCard}>
            <Text style={styles.demoStageTitle}>Ready when you are</Text>
            <Text style={styles.metaText}>Choose a plan to start booking ongoing sessions with your coach.</Text>
          </GlassCard>
          <PrimaryButton size="lg" onPress={() => router.push('/plans')}>
            Choose Your Plan
          </PrimaryButton>
          <RateSessionSheet
            visible={!!unratedDemo && data?.canRate !== false}
            title={unratedDemo?.coachName ? `Rate your session with ${unratedDemo.coachName}` : 'Rate your demo session'}
            requireNote
            onClose={() => setFeedbackDismissed(true)}
            onSubmit={onSubmitDemoFeedback}
          />
        </ScreenScaffold>
      );
    }

    return (
      <ScreenScaffold title="Book a Session">
        <GlassCard style={styles.demoStageCard}>
          <Text style={styles.demoStageTitle}>No Subscription Found</Text>
          <Text style={styles.metaText}>Book a free demo session, or choose a plan to get started.</Text>
        </GlassCard>
        <PrimaryButton size="lg" onPress={() => router.push('/demo-booking')}>
          Book Free Demo
        </PrimaryButton>
        <SecondaryButton size="lg" onPress={() => router.push('/plans')}>
          Choose Your Plan
        </SecondaryButton>
      </ScreenScaffold>
    );
  }

  if (!coach && coaches.length === 0) {
    return (
      <ScreenScaffold title="Book a Session">
        <EmptyState message="No coaches are available to book right now." />
      </ScreenScaffold>
    );
  }

  if (phase === 'success') {
    return (
      <ScreenScaffold title="Booked!">
        <StatCard emphasize value={formatIstDateLabel(selectedDate)} label="SESSION CONFIRMED" />
        <GlassCard>
          {selectedSlot && <Text style={styles.metaText}>{formatIstTimeLabel(selectedSlot)}</Text>}
          {activeCoachName && <Text style={styles.metaText}>with {activeCoachName}</Text>}
        </GlassCard>
        <PrimaryButton size="lg" onPress={() => router.replace('/sessions')}>
          View my sessions
        </PrimaryButton>
      </ScreenScaffold>
    );
  }

  if (phase === 'review' || phase === 'confirming') {
    return (
      <ScreenScaffold title="Confirm your session">
        <GlassCard variant="yellow">
          <Text style={styles.eyebrow}>{formatIstDateLabel(selectedDate)}</Text>
          <Text style={styles.bigTime}>{selectedSlot ? formatIstTimeLabel(selectedSlot) : ''}</Text>
          {activeCoachName && <Text style={styles.metaText}>with {activeCoachName}</Text>}
          <Text style={styles.holdTimer}>
            {holdSecondsLeft > 0
              ? `Hold expires in ${Math.floor(holdSecondsLeft / 60)}:${String(holdSecondsLeft % 60).padStart(2, '0')}`
              : 'Hold expired — go back and pick a slot again'}
          </Text>
        </GlassCard>
        {actionError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {actionError}
          </Text>
        )}
        <PrimaryButton size="lg" onPress={onConfirm} loading={phase === 'confirming'} disabled={holdSecondsLeft <= 0}>
          Confirm booking
        </PrimaryButton>
        <TextLink onPress={onRestart}>Pick a different slot</TextLink>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Book a Session" subtitle={activeCoachName ? `with ${activeCoachName}` : undefined}>
      {!coach && coaches.length > 0 && (
        <GlassCard>
          <SectionHeader title="Choose a coach" />
          <ChipGrid>
            {coaches.map((c) => (
              <Chip key={c.id} label={c.full_name} selected={c.id === selectedCoachId} onPress={() => setSelectedCoachId(c.id)} />
            ))}
          </ChipGrid>
        </GlassCard>
      )}

      <GlassCard>
        <SectionHeader title="Pick a date" />
        <Text style={styles.selectedDateText}>{formatIstDateLabel(selectedDate)}</Text>
        <CalendarGrid selected={selectedDate} onSelect={setSelectedDate} minDate={addIstDays(todayIst(), 1)} initialMonth={selectedDate} />
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Available times" />
        {slotsLoading && <LoadingState rows={1} />}
        {!slotsLoading && slots && slots.length === 0 && (
          <EmptyState message="No open slots this day — try another date." icon="calendar-clear-outline" />
        )}
        {!slotsLoading && slots && slots.length > 0 && (
          <ChipGrid>
            {slots.map((s) => (
              <Chip key={s} label={formatIstTimeLabel(s)} selected={s === selectedSlot} onPress={() => onPickSlot(s)} />
            ))}
          </ChipGrid>
        )}
      </GlassCard>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}
      {phase === 'holding' && <LoadingState rows={1} />}

      <RateSessionSheet
        visible={!!unratedDemo && data?.canRate !== false}
        title={unratedDemo?.coachName ? `Rate your session with ${unratedDemo.coachName}` : 'Rate your demo session'}
        onClose={() => setFeedbackDismissed(true)}
        onSubmit={onSubmitDemoFeedback}
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: 'rgba(255,255,255,0.6)' },
  selectedDateText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: Brand.yellow, marginBottom: 4 },
  bigTime: { fontFamily: 'Manrope_800ExtraBold', fontSize: 34, color: '#FFFFFF' },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
  holdTimer: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: Brand.yellow, marginTop: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  demoStageCard: { gap: 6, alignItems: 'center', paddingVertical: 20 },
  demoStageTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: '#FFFFFF', textAlign: 'center' },
});
