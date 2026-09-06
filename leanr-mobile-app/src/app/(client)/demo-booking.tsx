/**
 * Book a Free Demo (authenticated) — light-themed (New PRD.md pre-purchase
 * redesign, mockup #6-7 "Book a Demo"/"Demo Confirmation"). Same
 * hold->confirm state machine as before this pass — see
 * src/lib/data/booking-wizard.ts for the RPC/schema detail. Confirmation
 * now includes a coach card (photo/rating) and "Add to Calendar" per the
 * mockup — the one genuinely new capability in this pass (see
 * src/lib/media/add-to-calendar.ts).
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { LightAvatar } from '@/components/light/light-avatar';
import { LightPrimaryButton, LightSecondaryButton } from '@/components/light/light-button';
import { LightCalendarGrid } from '@/components/light/light-calendar-grid';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightStatCard } from '@/components/light/light-stat-card';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { addToDeviceCalendar } from '@/lib/media/add-to-calendar';
import {
  addIstDays,
  confirmHold,
  formatIstDateLabel,
  formatIstTimeLabel,
  getBookingSettings,
  holdSlot,
  todayIst,
  type IstDate,
} from '@/lib/data/booking-wizard';
import { findDemoMatch, hasExistingAssessment, type DemoMatch } from '@/lib/data/demo-booking';
import { useAsync } from '@/lib/data/use-async';

type Phase = 'pick' | 'holding' | 'review' | 'confirming' | 'success';

export default function DemoBookingScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [settings, alreadyDone] = await Promise.all([getBookingSettings(), hasExistingAssessment()]);
    return { settings, alreadyDone };
  }, []);

  const settings = data?.settings ?? null;

  const [selectedDate, setSelectedDate] = useState<IstDate>(() => addIstDays(todayIst(), 1));
  const [match, setMatch] = useState<DemoMatch | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addingToCalendar, setAddingToCalendar] = useState(false);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setMatch(null);
      setSelectedSlot(null);
      setMatchLoading(true);
    });
    findDemoMatch(selectedDate, settings.assessmentSessionDurationMinutes, {
      startHour: settings.bookingWindowStartHour,
      endHour: settings.bookingWindowEndHour,
    })
      .then((result) => {
        if (!cancelled) setMatch(result);
      })
      .catch((err) => {
        if (!cancelled) setActionError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setMatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate, settings]);

  const onPickSlot = async (slotIso: string) => {
    if (!match || !settings) return;
    setSelectedSlot(slotIso);
    setActionError(null);
    setPhase('holding');
    try {
      const id = await holdSlot(match.coach.id, slotIso, settings.assessmentSessionDurationMinutes);
      setHoldId(id);
      setHoldSecondsLeft(settings.temporaryBookingHoldMinutes * 60);
      setPhase('review');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setPhase('pick');
    }
  };

  const onConfirm = async () => {
    if (!holdId) return;
    setPhase('confirming');
    setActionError(null);
    try {
      await confirmHold(holdId, null, { sessionType: 'assessment', amountPaid: 0 });
      setPhase('success');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setPhase('pick');
      setHoldId(null);
    }
  };

  const onAddToCalendar = async () => {
    if (!selectedSlot || !settings) return;
    setAddingToCalendar(true);
    try {
      await addToDeviceCalendar({
        title: 'LEANR Demo Session',
        startDate: new Date(selectedSlot),
        durationMinutes: settings.assessmentSessionDurationMinutes,
      });
      Alert.alert('Added', 'This session was added to your calendar.');
    } catch (err) {
      Alert.alert('Could not add to calendar', err instanceof Error ? err.message : String(err));
    } finally {
      setAddingToCalendar(false);
    }
  };

  useEffect(() => {
    if (phase !== 'review' || holdSecondsLeft <= 0) return;
    const timer = setInterval(() => setHoldSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [phase, holdSecondsLeft]);

  if (loading) {
    return (
      <LightScreenScaffold title="Book a Free Demo">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }

  if (error) {
    return (
      <LightScreenScaffold title="Book a Free Demo">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  if (phase === 'success') {
    return (
      <LightScreenScaffold title="Your Demo is Booked!">
        <LightStatCard emphasize value={formatIstDateLabel(selectedDate)} label="ASSESSMENT CONFIRMED" />
        <LightCard style={styles.confirmCard}>
          {selectedSlot && <Text style={styles.metaText}>{formatIstTimeLabel(selectedSlot)}</Text>}
          <View style={styles.modeRow}>
            <Text style={styles.modeText}>Online (Zoom)</Text>
          </View>
          {match && (
            <View style={styles.coachRow}>
              <LightAvatar name={match.coach.full_name} size={48} />
              <Text style={styles.coachName}>{match.coach.full_name}</Text>
            </View>
          )}
        </LightCard>
        <LightSecondaryButton size="lg" onPress={onAddToCalendar} loading={addingToCalendar}>
          Add to Calendar
        </LightSecondaryButton>
        <LightPrimaryButton size="lg" onPress={() => router.replace('/sessions')}>
          View My Schedule
        </LightPrimaryButton>
      </LightScreenScaffold>
    );
  }

  if (phase === 'review' || phase === 'confirming') {
    return (
      <LightScreenScaffold title="Confirm your demo">
        <LightCard variant="teal">
          <Text style={styles.eyebrow}>{formatIstDateLabel(selectedDate)}</Text>
          <Text style={styles.bigTime}>{selectedSlot ? formatIstTimeLabel(selectedSlot) : ''}</Text>
          {match && <Text style={styles.metaText}>with {match.coach.full_name}</Text>}
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
          Confirm free demo
        </LightPrimaryButton>
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Book a Free Demo" subtitle="A free assessment session — we'll match you with an available coach">
      {data?.alreadyDone && (
        <LightCard>
          <Text style={styles.metaText}>You already have an assessment session on record — booking another is fine too.</Text>
        </LightCard>
      )}

      <LightCard>
        <LightSectionHeader title="Pick a date" />
        <Text style={styles.selectedDateText}>{formatIstDateLabel(selectedDate)}</Text>
        <LightCalendarGrid selected={selectedDate} onSelect={setSelectedDate} minDate={addIstDays(todayIst(), 1)} initialMonth={selectedDate} />
      </LightCard>

      <LightCard>
        <LightSectionHeader title="Available times" />
        {matchLoading && <LightLoadingState rows={1} />}
        {!matchLoading && match === null && <LightEmptyState message="No coaches have an opening this day — try another date." icon="calendar-clear-outline" />}
        {!matchLoading && match && (
          <>
            <Text style={styles.metaText}>Matched with {match.coach.full_name}</Text>
            <LightChipGrid>
              {match.slots.map((s) => (
                <LightChip key={s} label={formatIstTimeLabel(s)} selected={s === selectedSlot} onPress={() => onPickSlot(s)} />
              ))}
            </LightChipGrid>
          </>
        )}
      </LightCard>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}
      {phase === 'holding' && <LightLoadingState rows={1} />}
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
  confirmCard: { gap: 8 },
  modeRow: { flexDirection: 'row', alignItems: 'center' },
  modeText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textMuted },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  coachName: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.textPrimary },
});
