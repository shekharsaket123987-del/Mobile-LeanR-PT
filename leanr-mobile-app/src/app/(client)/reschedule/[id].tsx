/**
 * Reschedule Session — LEANR_PT_MOBILE_PRD.md §10 "My Sessions" Reschedule
 * row, §8e. Single-step (no hold): `reschedule_booking` mutates the
 * existing booking directly, unlike the hold->confirm new-booking path
 * (src/app/(client)/book-session.tsx). Reuses the same slot-availability
 * logic (src/lib/data/booking-wizard.ts) against the booking's existing
 * coach — this build doesn't offer "fastest available"/substitute-coach
 * rescheduling (§10 mentions both; out of scope here, same as the rest
 * of the recurring-schedule/coach-matching machinery — see README).
 *
 * Unlike a fresh booking, same-day is allowed: the live `reschedule_booking`
 * RPC only enforces a 1-hour (configurable) cutoff against the CURRENT
 * scheduled_start, not a tomorrow-onward rule — confirmed by reading the
 * function body directly, not assumed from the PRD prose (see
 * booking-wizard.ts's `isAfterRescheduleCutoff` comment).
 *
 * Reached from Sessions ("Reschedule" on an upcoming SessionCard) — not a
 * tab itself, hidden via `href: null` in the (client) layout.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useColorScheme, View, Pressable } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton } from '@/components/tappable';
import { Brand, Colors } from '@/constants/theme';
import {
  addIstDays,
  formatIstDateLabel,
  formatIstTimeLabel,
  getBookingSettings,
  getOpenSlotsForCoachOnDate,
  isAfterRescheduleCutoff,
  todayIst,
  type IstDate,
} from '@/lib/data/booking-wizard';
import { getClientBookingById, rescheduleBooking } from '@/lib/data/bookings';
import { useAsync } from '@/lib/data/use-async';

const DATE_CHOICES = 30; // matches §13 rule 7's forward window (not itself server-enforced, but a sane UI bound)

type Phase = 'pick' | 'saving' | 'success';

export default function RescheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync(async () => {
    const [booking, settings] = await Promise.all([getClientBookingById(id), getBookingSettings()]);
    return { booking, settings };
  }, [id]);

  const [selectedDate, setSelectedDate] = useState<IstDate>(() => todayIst());
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [actionError, setActionError] = useState<string | null>(null);

  const booking = data?.booking ?? null;
  const settings = data?.settings ?? null;

  useEffect(() => {
    if (!booking || !settings) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setSlots(null);
      setSelectedSlot(null);
      setSlotsLoading(true);
    });
    getOpenSlotsForCoachOnDate(booking.coach_id, selectedDate, booking.duration_minutes, {
      startHour: settings.bookingWindowStartHour,
      endHour: settings.bookingWindowEndHour,
    })
      .then((result) => {
        if (cancelled) return;
        const eligible = result.filter((s) => isAfterRescheduleCutoff(s, settings.rescheduleCutoffHours));
        setSlots(eligible);
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
  }, [booking, settings, selectedDate]);

  const onPickSlot = async (slotIso: string) => {
    if (!booking) return;
    setSelectedSlot(slotIso);
    setActionError(null);
    setPhase('saving');
    try {
      await rescheduleBooking(booking.id, slotIso, booking.duration_minutes);
      setPhase('success');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setPhase('pick');
    }
  };

  if (loading) {
    return (
      <ScreenScaffold title="Reschedule">
        <LoadingState />
      </ScreenScaffold>
    );
  }

  if (error) {
    return (
      <ScreenScaffold title="Reschedule">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  if (!booking) {
    return (
      <ScreenScaffold title="Reschedule">
        <EmptyState message="Session not found." />
      </ScreenScaffold>
    );
  }

  if (booking.status !== 'upcoming') {
    return (
      <ScreenScaffold title="Reschedule">
        <EmptyState message="Only upcoming sessions can be rescheduled." />
      </ScreenScaffold>
    );
  }

  if (phase === 'success') {
    return (
      <ScreenScaffold title="Rescheduled!">
        <Card>
          <Text style={shared.cardLabel}>NEW TIME</Text>
          <Text style={shared.bigStat}>{formatIstDateLabel(selectedDate)}</Text>
          {selectedSlot && <Text style={shared.cardLabel}>{formatIstTimeLabel(selectedSlot)}</Text>}
        </Card>
        <CtaButton onPress={() => router.replace('/sessions')}>View my sessions</CtaButton>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold
      title="Reschedule"
      subtitle={`Currently ${new Date(booking.scheduled_start).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}`}>
      <Card>
        <Text style={shared.cardLabel}>NEW DATE</Text>
        <View style={styles.chipRow}>
          {Array.from({ length: DATE_CHOICES }, (_, i) => addIstDays(todayIst(), i)).map((d) => {
            const key = `${d.year}-${d.month}-${d.day}`;
            const isSelected = d.year === selectedDate.year && d.month === selectedDate.month && d.day === selectedDate.day;
            return <Chip key={key} label={formatIstDateLabel(d)} selected={isSelected} onPress={() => setSelectedDate(d)} />;
          })}
        </View>
      </Card>

      <Card>
        <Text style={shared.cardLabel}>NEW TIME</Text>
        {slotsLoading && <LoadingState />}
        {!slotsLoading && slots && slots.length === 0 && <EmptyState message="No open slots this day — try another date." />}
        {!slotsLoading && slots && slots.length > 0 && (
          <View style={styles.chipRow}>
            {slots.map((s) => (
              <Chip key={s} label={formatIstTimeLabel(s)} selected={s === selectedSlot} onPress={() => onPickSlot(s)} />
            ))}
          </View>
        )}
      </Card>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}
      {phase === 'saving' && <LoadingState />}
    </ScreenScaffold>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  chipLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
