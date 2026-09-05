/**
 * Book a Free Demo — LEANR_PT_MOBILE_PRD.md §10 `/client/demo-booking`,
 * §15. Authenticated-client assessment booking only — see
 * src/lib/data/demo-booking.ts header for what's deliberately out of
 * scope (the anonymous prospect entry point) and how coach-matching is
 * simplified.
 *
 * Reached from Plans ("Book a Free Demo") — not a tab itself, hidden via
 * `href: null` in the (client) layout. Mirrors book-session.tsx's
 * hold->confirm shape (date chips -> time chips -> review -> confirm)
 * but with no coach picker (the client never picks for a demo, per §15)
 * and no subscription requirement (assessment sessions are free,
 * `amount_paid=0`, and can happen before a client has ever purchased a
 * plan).
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { TextLink } from '@/components/tappable';
import { PrimaryButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { Brand } from '@/constants/theme';
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

const DATE_CHOICES = 14; // tomorrow onward — §13 rule 1: no same-day booking, any type

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

  useEffect(() => {
    if (phase !== 'review' || holdSecondsLeft <= 0) return;
    const timer = setInterval(() => setHoldSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [phase, holdSecondsLeft]);

  if (loading) {
    return (
      <ScreenScaffold title="Book a Free Demo">
        <LoadingState />
      </ScreenScaffold>
    );
  }

  if (error) {
    return (
      <ScreenScaffold title="Book a Free Demo">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  if (phase === 'success') {
    return (
      <ScreenScaffold title="Demo booked!">
        <StatCard emphasize value={formatIstDateLabel(selectedDate)} label="ASSESSMENT CONFIRMED" />
        <GlassCard>
          {selectedSlot && <Text style={styles.metaText}>{formatIstTimeLabel(selectedSlot)}</Text>}
          {match && <Text style={styles.metaText}>with {match.coach.full_name}</Text>}
        </GlassCard>
        <PrimaryButton size="lg" onPress={() => router.replace('/sessions')}>
          View my sessions
        </PrimaryButton>
      </ScreenScaffold>
    );
  }

  if (phase === 'review' || phase === 'confirming') {
    return (
      <ScreenScaffold title="Confirm your demo">
        <GlassCard variant="yellow">
          <Text style={styles.eyebrow}>{formatIstDateLabel(selectedDate)}</Text>
          <Text style={styles.bigTime}>{selectedSlot ? formatIstTimeLabel(selectedSlot) : ''}</Text>
          {match && <Text style={styles.metaText}>with {match.coach.full_name}</Text>}
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
          Confirm free demo
        </PrimaryButton>
        <TextLink onPress={() => setPhase('pick')}>Pick a different slot</TextLink>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Book a Free Demo" subtitle="A free assessment session — we'll match you with an available coach">
      {data?.alreadyDone && (
        <GlassCard>
          <Text style={styles.metaText}>You already have an assessment session on record — booking another is fine too.</Text>
        </GlassCard>
      )}

      <GlassCard>
        <SectionHeader title="Pick a date" />
        <ChipGrid>
          {Array.from({ length: DATE_CHOICES }, (_, i) => addIstDays(todayIst(), i + 1)).map((d) => {
            const key = `${d.year}-${d.month}-${d.day}`;
            const isSelected = d.year === selectedDate.year && d.month === selectedDate.month && d.day === selectedDate.day;
            return <Chip key={key} label={formatIstDateLabel(d)} selected={isSelected} onPress={() => setSelectedDate(d)} />;
          })}
        </ChipGrid>
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Available times" />
        {matchLoading && <LoadingState rows={1} />}
        {!matchLoading && match === null && (
          <EmptyState message="No coaches have an opening this day — try another date." icon="calendar-clear-outline" />
        )}
        {!matchLoading && match && (
          <>
            <Text style={styles.metaText}>Matched with {match.coach.full_name}</Text>
            <ChipGrid>
              {match.slots.map((s) => (
                <Chip key={s} label={formatIstTimeLabel(s)} selected={s === selectedSlot} onPress={() => onPickSlot(s)} />
              ))}
            </ChipGrid>
          </>
        )}
      </GlassCard>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}
      {phase === 'holding' && <LoadingState rows={1} />}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: 'rgba(255,255,255,0.6)' },
  bigTime: { fontFamily: 'Manrope_800ExtraBold', fontSize: 34, color: '#FFFFFF' },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: 'rgba(255,255,255,0.7)' },
  holdTimer: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: Brand.streakEmberStart, marginTop: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
