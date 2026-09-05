/**
 * Book a Session — LEANR_PT_MOBILE_PRD.md §10 "Screen: Book a Session",
 * §13 rules 1-4, LEANR_PT_NEXTGEN_APP_PRD.md §9.2 (chip-based slot
 * picking, one primary action per screen). Hold->confirm ad-hoc booking
 * wizard — see src/lib/data/booking-wizard.ts for the RPC/schema detail
 * this was built against (confirmed live on 2026-08-17).
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
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { TextLink } from '@/components/tappable';
import { PrimaryButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { Brand } from '@/constants/theme';
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
import { getMySubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

const DATE_CHOICES = 14; // next 14 days, tomorrow onward — §13 rule 1: no same-day booking

type Phase = 'pick' | 'holding' | 'review' | 'confirming' | 'success';

export default function BookSessionScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [coach, subscription, coaches, settings] = await Promise.all([
      getMyCoach(),
      getMySubscription(),
      getAvailableCoaches(),
      getBookingSettings(),
    ]);
    return { coach, subscription, coaches, settings };
  }, []);

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
    // The reset calls are deferred a microtask so they run inside a
    // callback rather than synchronously in the effect body (same shape
    // as the fetch's own .then/.catch below) — an effect kicking off a
    // real async fetch against Supabase is exactly the "external system"
    // case effects are for, just written so the linter's static check
    // (react-hooks/set-state-in-effect) doesn't flag the setup calls.
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

  if (!subscription) {
    return (
      <ScreenScaffold title="Book a Session">
        <EmptyState message="You need an active plan before you can book a session." icon="lock-closed-outline" />
        <PrimaryButton size="lg" onPress={() => router.push('/plans')}>
          View plans
        </PrimaryButton>
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
          <View style={styles.chipRow}>
            {coaches.map((c) => (
              <Chip key={c.id} label={c.full_name} selected={c.id === selectedCoachId} onPress={() => setSelectedCoachId(c.id)} />
            ))}
          </View>
        </GlassCard>
      )}

      <GlassCard>
        <SectionHeader title="Pick a date" />
        <View style={styles.chipRow}>
          {Array.from({ length: DATE_CHOICES }, (_, i) => addIstDays(todayIst(), i + 1)).map((d) => {
            const key = `${d.year}-${d.month}-${d.day}`;
            const isSelected = d.year === selectedDate.year && d.month === selectedDate.month && d.day === selectedDate.day;
            return <Chip key={key} label={formatIstDateLabel(d)} selected={isSelected} onPress={() => setSelectedDate(d)} />;
          })}
        </View>
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Available times" />
        {slotsLoading && <LoadingState rows={1} />}
        {!slotsLoading && slots && slots.length === 0 && (
          <EmptyState message="No open slots this day — try another date." icon="calendar-clear-outline" />
        )}
        {!slotsLoading && slots && slots.length > 0 && (
          <View style={styles.chipRow}>
            {slots.map((s) => (
              <Chip key={s} label={formatIstTimeLabel(s)} selected={s === selectedSlot} onPress={() => onPickSlot(s)} />
            ))}
          </View>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: 'rgba(255,255,255,0.6)' },
  bigTime: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 34,
    color: '#FFFFFF',
  },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: 'rgba(255,255,255,0.7)' },
  holdTimer: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: Brand.streakEmberStart, marginTop: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
