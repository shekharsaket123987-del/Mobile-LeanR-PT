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
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton } from '@/components/tappable';
import { Brand, Colors } from '@/constants/theme';
import { getBookingSettings } from '@/lib/data/booking-wizard';
import { getMyCoach } from '@/lib/data/coach';
import {
  getCommonAvailableHours,
  getMyActiveRecurringSlots,
  PATTERN_PRESETS,
  setUpRecurringSchedule,
  WEEKDAYS,
  type RecurringSlot,
  type SetupResult,
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
  const [hours, setHours] = useState<number[] | null>(null);
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
        if (!cancelled) setHours(null);
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve().then(() => {
      if (cancelled) return;
      setHours(null);
      setSelectedHour(null);
      setHoursLoading(true);
    });
    getCommonAvailableHours(coach.id, selectedDays, settings.defaultSessionDurationMinutes, {
      startHour: settings.bookingWindowStartHour,
      endHour: settings.bookingWindowEndHour,
    })
      .then((result) => {
        if (!cancelled) setHours(result);
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
  }, [coach, settings, selectedDays]);

  const onConfirm = async () => {
    if (!settings || selectedHour === null || selectedDays.length === 0) return;
    setPhase('saving');
    setActionError(null);
    try {
      const setupResults = await setUpRecurringSchedule(selectedDays, selectedHour, settings.defaultSessionDurationMinutes);
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
        <EmptyState message="You need an active plan before setting up a recurring schedule." />
        <CtaButton onPress={() => router.push('/plans')}>View plans</CtaButton>
      </ScreenScaffold>
    );
  }

  if (!coach) {
    return (
      <ScreenScaffold title="My Schedule">
        <EmptyState message="You need a coach assigned before setting up a recurring schedule." />
      </ScreenScaffold>
    );
  }

  if (phase === 'success') {
    const shortfall = results.some((r) => r.confirmed < r.requested);
    return (
      <ScreenScaffold title="Schedule set!">
        <Card>
          <Text style={shared.cardLabel}>YOUR NEW WEEKLY PLAN</Text>
          {results.map((r) => (
            <Text key={r.dayOfWeek} style={shared.bigStat}>
              {dayLabel(r.dayOfWeek)} — {r.confirmed}/{r.requested} sessions confirmed
            </Text>
          ))}
          {shortfall && (
            <Text style={styles.warningText}>
              Your coach is heavily booked at this time on at least one day — fewer upcoming sessions were confirmed
              than requested. Check My Sessions, or try a different time.
            </Text>
          )}
        </Card>
        <CtaButton onPress={() => router.replace('/sessions')}>View my sessions</CtaButton>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="My Schedule" subtitle={`with ${coach.full_name}`}>
      {currentSlots.length > 0 && (
        <Card>
          <Text style={shared.cardLabel}>CURRENT SCHEDULE</Text>
          {currentSlots.map((s) => (
            <CurrentSlotRow key={s.id} slot={s} />
          ))}
        </Card>
      )}

      <Card>
        <Text style={shared.cardLabel}>QUICK PICK</Text>
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

        <Text style={shared.cardLabel}>OR PICK DAYS (2-6)</Text>
        <View style={styles.chipRow}>
          {WEEKDAYS.map((d) => (
            <Chip key={d.dow} label={d.short} selected={selectedDays.includes(d.dow)} onPress={() => toggleDay(d.dow)} />
          ))}
        </View>
      </Card>

      {selectedDays.length > 0 && selectedDays.length < 2 && <EmptyState message="Pick at least 2 days." />}

      {selectedDays.length >= 2 && (
        <Card>
          <Text style={shared.cardLabel}>TIME (SAME EVERY DAY)</Text>
          {hoursLoading && <LoadingState />}
          {!hoursLoading && hours && hours.length === 0 && (
            <EmptyState message="No single time works for your coach across all those days — try different days." />
          )}
          {!hoursLoading && hours && hours.length > 0 && (
            <View style={styles.chipRow}>
              {hours.map((h) => (
                <Chip key={h} label={formatHourLabel(h)} selected={h === selectedHour} onPress={() => setSelectedHour(h)} />
              ))}
            </View>
          )}
        </Card>
      )}

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}

      {selectedHour !== null && (
        <CtaButton onPress={onConfirm} loading={phase === 'saving'}>
          Confirm Schedule
        </CtaButton>
      )}
    </ScreenScaffold>
  );
}

function CurrentSlotRow({ slot }: { slot: RecurringSlot }) {
  const hour = Number(slot.start_time.slice(0, 2));
  return (
    <Text style={shared.cardLabel}>
      {dayLabel(slot.day_of_week)} — {formatHourLabel(hour)}
    </Text>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.chip, { backgroundColor: selected ? Brand.yellow : colors.backgroundElement }]}>
      <Text style={[styles.chipLabel, { color: selected ? Brand.black : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 8 },
  chip: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  chipLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  warningText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: Brand.streakEmberStart, marginTop: 8 },
});
