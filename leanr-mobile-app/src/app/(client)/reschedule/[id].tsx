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
 * Relit for the post-purchase light theme — real month calendar via
 * `LightCalendarGrid` (min date = today, not tomorrow, matching the
 * same-day-allowed rule above).
 *
 * Reached from Sessions ("Reschedule" on an upcoming SessionCard) — not a
 * tab itself, hidden via `href: null` in the (client) layout.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { LightCalendarGrid } from '@/components/light/light-calendar-grid';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightStatCard } from '@/components/light/light-stat-card';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
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
import { getErrorMessage } from '@/lib/data/errors';

const RESCHEDULE_WINDOW_DAYS = 30; // matches §13 rule 7's forward window (not itself server-enforced, but a sane UI bound)

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
        if (!cancelled) setActionError(getErrorMessage(err));
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
      setActionError(getErrorMessage(err));
      setPhase('pick');
    }
  };

  if (loading) {
    return (
      <LightScreenScaffold title="Reschedule">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }

  if (error) {
    return (
      <LightScreenScaffold title="Reschedule">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  if (!booking) {
    return (
      <LightScreenScaffold title="Reschedule">
        <LightEmptyState message="Session not found." />
      </LightScreenScaffold>
    );
  }

  if (booking.status !== 'upcoming') {
    return (
      <LightScreenScaffold title="Reschedule">
        <LightEmptyState message="Only upcoming sessions can be rescheduled." />
      </LightScreenScaffold>
    );
  }

  if (phase === 'success') {
    return (
      <LightScreenScaffold title="Rescheduled!">
        <LightStatCard emphasize value={formatIstDateLabel(selectedDate)} label="NEW TIME" />
        {selectedSlot && (
          <LightCard>
            <Text style={styles.metaText}>{formatIstTimeLabel(selectedSlot)}</Text>
          </LightCard>
        )}
        <LightPrimaryButton size="lg" onPress={() => router.replace('/sessions')}>
          View my sessions
        </LightPrimaryButton>
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold
      title="Reschedule"
      subtitle={`Currently ${new Date(booking.scheduled_start).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}`}>
      <LightCard>
        <LightSectionHeader title="New date" />
        <Text style={styles.selectedDateText}>{formatIstDateLabel(selectedDate)}</Text>
        <LightCalendarGrid
          selected={selectedDate}
          onSelect={setSelectedDate}
          minDate={todayIst()}
          maxDate={addIstDays(todayIst(), RESCHEDULE_WINDOW_DAYS)}
          initialMonth={selectedDate}
        />
      </LightCard>

      <LightCard>
        <LightSectionHeader title="New time" />
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
      {phase === 'saving' && <LightLoadingState rows={1} />}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: LightBrand.textSecondary },
  selectedDateText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.teal, marginBottom: 4 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
});
