/**
 * Reschedule Session — LEANR_PT_MOBILE_PRD.md §10 "My Sessions" Reschedule
 * row, §8e. Single-step (no hold): `reschedule_booking` mutates the
 * existing booking directly, unlike the hold->confirm new-booking path
 * (src/app/(client)/book-session.tsx). Three coach-mode paths per §10:
 * "My Coach" (own coach's open-slot grid, the original/default path),
 * "Fastest Available" (soonest open slot across every active coach,
 * utilization-ranked), and "Substitute Coach" (up to 3 alternates free at
 * the client's chosen date, for that one session only — updates
 * `bookings.coach_id` directly, leaves `recurring_slot_id` untouched so
 * later occurrences revert to the original coach).
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
import { StyleSheet, Text, View } from 'react-native';

import { LightCalendarGrid } from '@/components/light/light-calendar-grid';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
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
import { getActiveCoachesByUtilization, type UtilizationRankedCoach } from '@/lib/data/coach-utilization';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

const RESCHEDULE_WINDOW_DAYS = 30; // matches §13 rule 7's forward window (not itself server-enforced, but a sane UI bound)
const MAX_SUBSTITUTE_COACHES = 3; // §10: "falls back to up to 3 substitute coaches for that one session only"

type Phase = 'pick' | 'saving' | 'success';
type CoachMode = 'own' | 'fastest' | 'substitute';
type FastestResult = { coachId: string; coachName: string; slotIso: string };
type SubstituteCandidate = { coachId: string; coachName: string; slots: string[] };

export default function RescheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync(async () => {
    const [booking, settings] = await Promise.all([getClientBookingById(id), getBookingSettings()]);
    return { booking, settings };
  }, [id]);

  const [mode, setMode] = useState<CoachMode>('own');
  const [selectedDate, setSelectedDate] = useState<IstDate>(() => todayIst());
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [actionError, setActionError] = useState<string | null>(null);

  const [fastestResult, setFastestResult] = useState<FastestResult | null>(null);
  const [fastestSearching, setFastestSearching] = useState(false);
  const [fastestError, setFastestError] = useState<string | null>(null);

  const [substituteCandidates, setSubstituteCandidates] = useState<SubstituteCandidate[] | null>(null);
  const [substituteLoading, setSubstituteLoading] = useState(false);

  const booking = data?.booking ?? null;
  const settings = data?.settings ?? null;

  // "My Coach" path — the original/default behavior, unchanged.
  useEffect(() => {
    if (mode !== 'own' || !booking || !settings) return;
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
  }, [mode, booking, settings, selectedDate]);

  // "Substitute Coach" path — up to 3 alternates (excluding the current coach) free on the chosen date.
  useEffect(() => {
    if (mode !== 'substitute' || !booking || !settings) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setSubstituteCandidates(null);
      setSubstituteLoading(true);
    });
    (async () => {
      const ranked = await getActiveCoachesByUtilization();
      const alternates = ranked.filter((c) => c.id !== booking.coach_id);
      const found: SubstituteCandidate[] = [];
      for (const coach of alternates) {
        if (found.length >= MAX_SUBSTITUTE_COACHES) break;
        const result = await getOpenSlotsForCoachOnDate(coach.id, selectedDate, booking.duration_minutes, {
          startHour: settings.bookingWindowStartHour,
          endHour: settings.bookingWindowEndHour,
        });
        const eligible = result.filter((s) => isAfterRescheduleCutoff(s, settings.rescheduleCutoffHours));
        if (eligible.length > 0) found.push({ coachId: coach.id, coachName: coach.full_name, slots: eligible });
      }
      if (!cancelled) {
        setSubstituteCandidates(found);
        setSubstituteLoading(false);
      }
    })().catch((err) => {
      if (!cancelled) {
        setActionError(getErrorMessage(err));
        setSubstituteLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, booking, settings, selectedDate]);

  const onChangeMode = (next: CoachMode) => {
    setMode(next);
    setActionError(null);
    setFastestResult(null);
    setFastestError(null);
    setSubstituteCandidates(null);
  };

  const onPickSlot = async (slotIso: string, coachId?: string) => {
    if (!booking) return;
    setSelectedSlot(slotIso);
    setActionError(null);
    setPhase('saving');
    try {
      await rescheduleBooking(booking.id, slotIso, booking.duration_minutes, true, coachId && coachId !== booking.coach_id ? coachId : undefined);
      setPhase('success');
    } catch (err) {
      setActionError(getErrorMessage(err));
      setPhase('pick');
    }
  };

  const onFindFastest = async () => {
    if (!booking || !settings) return;
    setFastestSearching(true);
    setFastestError(null);
    setFastestResult(null);
    try {
      const coaches: UtilizationRankedCoach[] = await getActiveCoachesByUtilization();
      for (let n = 0; n <= RESCHEDULE_WINDOW_DAYS; n++) {
        const date = addIstDays(todayIst(), n);
        for (const coach of coaches) {
          const result = await getOpenSlotsForCoachOnDate(coach.id, date, booking.duration_minutes, {
            startHour: settings.bookingWindowStartHour,
            endHour: settings.bookingWindowEndHour,
          });
          const eligible = result.filter((s) => isAfterRescheduleCutoff(s, settings.rescheduleCutoffHours));
          if (eligible.length > 0) {
            setFastestResult({ coachId: coach.id, coachName: coach.full_name, slotIso: eligible[0] });
            setFastestSearching(false);
            return;
          }
        }
      }
      setFastestError(`No open slots found in the next ${RESCHEDULE_WINDOW_DAYS} days.`);
    } catch (err) {
      setFastestError(getErrorMessage(err));
    } finally {
      setFastestSearching(false);
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
        <LightSegmentedControl
          options={[
            { key: 'own', label: 'My Coach' },
            { key: 'fastest', label: 'Fastest Available' },
            { key: 'substitute', label: 'Substitute Coach' },
          ]}
          value={mode}
          onChange={onChangeMode}
        />
      </LightCard>

      {mode === 'own' && (
        <>
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
        </>
      )}

      {mode === 'fastest' && (
        <LightCard>
          <LightSectionHeader title="Soonest open slot, any coach" />
          {!fastestResult && (
            <LightPrimaryButton size="lg" onPress={onFindFastest} loading={fastestSearching}>
              Find fastest available
            </LightPrimaryButton>
          )}
          {fastestError && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {fastestError}
            </Text>
          )}
          {fastestResult && (
            <>
              <Text style={styles.metaText}>
                {fastestResult.coachName} — {formatIstDateLabel(selectedDate)} {formatIstTimeLabel(fastestResult.slotIso)}
              </Text>
              <LightPrimaryButton size="lg" onPress={() => onPickSlot(fastestResult.slotIso, fastestResult.coachId)}>
                Confirm this slot
              </LightPrimaryButton>
            </>
          )}
        </LightCard>
      )}

      {mode === 'substitute' && (
        <>
          <LightCard>
            <LightSectionHeader title="Date" />
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
            <LightSectionHeader title="Available substitute coaches" />
            {substituteLoading && <LightLoadingState rows={1} />}
            {!substituteLoading && substituteCandidates && substituteCandidates.length === 0 && (
              <LightEmptyState message="No coach is available for that day — try a different date." icon="calendar-clear-outline" />
            )}
            {!substituteLoading &&
              substituteCandidates &&
              substituteCandidates.map((c) => (
                <View key={c.coachId} style={styles.substituteBlock}>
                  <Text style={styles.metaText}>{c.coachName}</Text>
                  <LightChipGrid>
                    {c.slots.map((s) => (
                      <LightChip
                        key={s}
                        label={formatIstTimeLabel(s)}
                        selected={s === selectedSlot}
                        onPress={() => onPickSlot(s, c.coachId)}
                      />
                    ))}
                  </LightChipGrid>
                </View>
              ))}
          </LightCard>
        </>
      )}

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
  substituteBlock: { gap: 6, marginBottom: 12 },
});
