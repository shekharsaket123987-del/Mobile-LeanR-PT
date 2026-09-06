/**
 * My Schedule — LEANR_PT_MOBILE_PRD.md §10 "My Schedule" row, §15
 * recurring-pattern setup. See src/lib/data/recurring-schedule.ts for
 * the confirmed schema/RLS detail and the deliberate simplifications
 * this build makes (leave-agnostic time matching per §13 rule 19,
 * same-coach only, simplified fallback ladder).
 *
 * Reached from Sessions ("Manage My Schedule") — not a tab itself,
 * hidden via `href: null` in the (client) layout. The NextGen PRD (§6)
 * describes merging this into a segmented Sessions header rather than a
 * separate screen; keeping it a distinct screen here is a smaller,
 * lower-risk change than reworking the existing Sessions tab structure.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { PrimaryButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Brand } from '@/constants/theme';
import { getBookingSettings } from '@/lib/data/booking-wizard';
import { getMyCoach } from '@/lib/data/coach';
import {
  findCoachForSchedule,
  getMyActiveRecurringSlots,
  PATTERN_PRESETS,
  setUpRecurringSchedule,
  WEEKDAYS,
  type CoachMatchCandidate,
  type RecurringSlot,
  type SetupResult,
  type TrainerGenderPreference,
  type TrainerPreference,
} from '@/lib/data/recurring-schedule';
import { getMySubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

function formatHourLabel(hour: number) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour >= 12 ? 'PM' : 'AM'} IST`;
}

function dayLabel(dow: number) {
  return WEEKDAYS.find((d) => d.dow === dow)?.short ?? String(dow);
}

type Phase = 'pick' | 'saving' | 'success';

export default function MyScheduleScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [coach, subscription, currentSlots, settings] = await Promise.all([
      getMyCoach(),
      getMySubscription(),
      getMyActiveRecurringSlots(),
      getBookingSettings(),
    ]);
    return { coach, subscription, currentSlots, settings };
  }, []);

  const coach = data?.coach ?? null;
  const subscription = data?.subscription ?? null;
  const currentSlots = data?.currentSlots ?? [];
  const settings = data?.settings ?? null;

  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [trainerPreference, setTrainerPreference] = useState<TrainerPreference>('same');
  const [trainerGender, setTrainerGender] = useState<TrainerGenderPreference>('no_preference');
  const [hours, setHours] = useState<number[] | null>(null);
  const [matchedCoach, setMatchedCoach] = useState<CoachMatchCandidate | null>(null);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [results, setResults] = useState<SetupResult[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleDay = (dow: number) => {
    setSelectedHour(null);
    setSelectedDays((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort((a, b) => a - b)));
  };

  useEffect(() => {
    let cancelled = false;

    if (!coach || !settings || selectedDays.length === 0) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setHours(null);
          setMatchedCoach(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve().then(() => {
      if (cancelled) return;
      setHours(null);
      setMatchedCoach(null);
      setSelectedHour(null);
      setHoursLoading(true);
    });
    findCoachForSchedule(
      selectedDays,
      settings.defaultSessionDurationMinutes,
      { startHour: settings.bookingWindowStartHour, endHour: settings.bookingWindowEndHour },
      trainerPreference,
      trainerGender
    )
      .then((match) => {
        if (cancelled) return;
        setHours(match?.hours ?? []);
        setMatchedCoach(match?.coach ?? null);
      })
      .catch((err) => {
        if (!cancelled) setActionError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setHoursLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coach, settings, selectedDays, trainerPreference, trainerGender]);

  const onConfirm = async () => {
    if (!settings || selectedHour === null || selectedDays.length === 0 || !matchedCoach) return;
    setPhase('saving');
    setActionError(null);
    try {
      const setupResults = await setUpRecurringSchedule(
        selectedDays,
        selectedHour,
        settings.defaultSessionDurationMinutes,
        matchedCoach.id
      );
      setResults(setupResults);
      setPhase('success');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setPhase('pick');
    }
  };

  if (loading) {
    return (
      <ScreenScaffold title="My Schedule">
        <LoadingState />
      </ScreenScaffold>
    );
  }

  if (error) {
    return (
      <ScreenScaffold title="My Schedule">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  if (!subscription) {
    return (
      <ScreenScaffold title="My Schedule">
        <EmptyState message="You need an active plan before setting up a recurring schedule." icon="lock-closed-outline" />
        <PrimaryButton size="lg" onPress={() => router.push('/plans')}>
          View plans
        </PrimaryButton>
      </ScreenScaffold>
    );
  }

  if (!coach) {
    return (
      <ScreenScaffold title="My Schedule">
        <EmptyState message="You need a coach assigned before setting up a recurring schedule." icon="person-outline" />
      </ScreenScaffold>
    );
  }

  if (phase === 'success') {
    const shortfall = results.some((r) => r.confirmed < r.requested);
    return (
      <ScreenScaffold title="Schedule set!">
        <GlassCard variant="yellow">
          <Text style={styles.eyebrow}>YOUR NEW WEEKLY PLAN</Text>
          {results.map((r) => (
            <Text key={r.dayOfWeek} style={styles.resultRow}>
              {dayLabel(r.dayOfWeek)} — {r.confirmed}/{r.requested} sessions confirmed
            </Text>
          ))}
          {shortfall && (
            <Text style={styles.warningText}>
              Your coach is heavily booked at this time on at least one day — fewer upcoming sessions were confirmed
              than requested. Check My Sessions, or try a different time.
            </Text>
          )}
        </GlassCard>
        <PrimaryButton size="lg" onPress={() => router.replace('/sessions')}>
          View my sessions
        </PrimaryButton>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="My Schedule" subtitle={`with ${coach.full_name}`}>
      {currentSlots.length > 0 && (
        <GlassCard>
          <SectionHeader title="Current schedule" />
          {currentSlots.map((s) => (
            <CurrentSlotRow key={s.id} slot={s} />
          ))}
        </GlassCard>
      )}

      <GlassCard>
        <SectionHeader title="Quick pick" />
        <View style={styles.chipRow}>
          {PATTERN_PRESETS.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              selected={p.days.length === selectedDays.length && p.days.every((d) => selectedDays.includes(d))}
              onPress={() => {
                setSelectedHour(null);
                setSelectedDays([...p.days]);
              }}
            />
          ))}
        </View>

        <SectionHeader title="Or pick days (2–6)" />
        <View style={styles.chipRow}>
          {WEEKDAYS.map((d) => (
            <Chip key={d.dow} label={d.short} selected={selectedDays.includes(d.dow)} onPress={() => toggleDay(d.dow)} />
          ))}
        </View>
      </GlassCard>

      {selectedDays.length > 0 && selectedDays.length < 2 && (
        <EmptyState message="Pick at least 2 days." icon="calendar-outline" />
      )}

      {selectedDays.length >= 2 && (
        <GlassCard>
          <SectionHeader title="Trainer preference" />
          <View style={styles.chipRow}>
            <Chip label="Same trainer" selected={trainerPreference === 'same'} onPress={() => setTrainerPreference('same')} />
            <Chip label="New trainer" selected={trainerPreference === 'new'} onPress={() => setTrainerPreference('new')} />
            <Chip
              label="No preference"
              selected={trainerPreference === 'no_preference'}
              onPress={() => setTrainerPreference('no_preference')}
            />
          </View>

          {trainerPreference !== 'same' && (
            <>
              <SectionHeader title="Trainer gender" />
              <View style={styles.chipRow}>
                <Chip label="Male" selected={trainerGender === 'male'} onPress={() => setTrainerGender('male')} />
                <Chip label="Female" selected={trainerGender === 'female'} onPress={() => setTrainerGender('female')} />
                <Chip
                  label="No preference"
                  selected={trainerGender === 'no_preference'}
                  onPress={() => setTrainerGender('no_preference')}
                />
              </View>
            </>
          )}
        </GlassCard>
      )}

      {selectedDays.length >= 2 && (
        <GlassCard>
          <SectionHeader title="Time (same every day)" />
          {hoursLoading && <LoadingState rows={1} />}
          {!hoursLoading && hours && hours.length === 0 && (
            <EmptyState message="No single time works across all those days — try different days, or a different trainer preference." />
          )}
          {!hoursLoading && hours && hours.length > 0 && (
            <>
              {matchedCoach && trainerPreference !== 'same' && (
                <Text style={styles.matchedCoachText}>Matched with {matchedCoach.full_name}</Text>
              )}
              <View style={styles.chipRow}>
                {hours.map((h) => (
                  <Chip key={h} label={formatHourLabel(h)} selected={h === selectedHour} onPress={() => setSelectedHour(h)} />
                ))}
              </View>
            </>
          )}
        </GlassCard>
      )}

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}

      {selectedHour !== null && (
        <PrimaryButton size="lg" onPress={onConfirm} loading={phase === 'saving'}>
          Confirm schedule
        </PrimaryButton>
      )}
    </ScreenScaffold>
  );
}

function CurrentSlotRow({ slot }: { slot: RecurringSlot }) {
  const hour = Number(slot.start_time.slice(0, 2));
  return (
    <Text style={styles.slotRow}>
      {dayLabel(slot.day_of_week)} — {formatHourLabel(hour)}
    </Text>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 8 },
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: 'rgba(255,255,255,0.6)' },
  resultRow: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#FFFFFF', marginTop: 6 },
  slotRow: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  warningText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: Brand.streakEmberStart, marginTop: 8 },
  matchedCoachText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
});
