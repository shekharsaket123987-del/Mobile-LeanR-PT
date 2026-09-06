/**
 * My Schedule (recurring weekly pattern) — LEANR_PT_MOBILE_PRD.md §15
 * "Recurring pattern" mechanism, §13 rules 18-19. See git history for the
 * confirmed schema/RLS detail and deliberate simplifications (leave-
 * agnostic time matching, same-coach-only matching, simplified fallback
 * ladder) — unchanged by this relight, business logic untouched.
 *
 * Relit + restructured for the post-purchase light theme (mockup frames
 * 6-7, "Schedule Setup" — continuing onboarding's step numbering: this
 * screen is steps 2-3 of the same 3-step setup wizard). Mockup's Trainer
 * Preference offers "Any Available (Best Match)" / "Specific Coach (if
 * any)" — the second option has no backing anywhere (no coach-browsing
 * mechanism exists; PRD is explicit everywhere that "the client never
 * picks the coach"). The existing Same/New/No-Preference choice IS real,
 * PRD-backed functionality (§4.A "Trainer Preference (Same/New/No-
 * Preference)") richer than the mockup's simplification, so it's kept
 * as-is rather than removed to match the mockup literally — removing real
 * functionality to chase a simpler mockup would violate prompt2.md's own
 * "do not remove web functionality" rule.
 *
 * Reached from Sessions ("Manage my schedule") post-setup, or directly
 * from the activation funnel (onboarding -> here) the first time.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightAvatar } from '@/components/light/light-avatar';
import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton, LightSecondaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getBookingSettings } from '@/lib/data/booking-wizard';
import { getMyCoach } from '@/lib/data/coach';
import {
  findCoachForSchedule,
  getMyActiveRecurringSlots,
  setUpRecurringSchedule,
  WEEKDAYS,
  type CoachMatchCandidate,
  type RecurringSlot,
  type SetupResult,
  type TrainerGenderPreference,
  type TrainerPreference,
} from '@/lib/data/recurring-schedule';
import { getMySubscription } from '@/lib/data/subscription';
import type { CoachProfile } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

function formatHourLabel(hour: number) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour >= 12 ? 'PM' : 'AM'} IST`;
}

function dayLabel(dow: number) {
  return WEEKDAYS.find((d) => d.dow === dow)?.short ?? String(dow);
}

type SlotType = 'standard' | 'pair' | 'custom';
const STANDARD_DAYS = [1, 3, 5];

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

  const [wizardStep, setWizardStep] = useState<2 | 3>(2);
  const [slotType, setSlotType] = useState<SlotType>('standard');
  const [selectedDays, setSelectedDays] = useState<number[]>(STANDARD_DAYS);
  const [trainerPreference, setTrainerPreference] = useState<TrainerPreference>('same');
  const [trainerGender, setTrainerGender] = useState<TrainerGenderPreference>('no_preference');
  const [hours, setHours] = useState<number[] | null>(null);
  const [matchedCoach, setMatchedCoach] = useState<CoachMatchCandidate | null>(null);
  const [assignedCoach, setAssignedCoach] = useState<CoachProfile | null>(null);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [results, setResults] = useState<SetupResult[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const onSelectSlotType = (type: SlotType) => {
    setSlotType(type);
    setSelectedHour(null);
    if (type === 'standard') setSelectedDays(STANDARD_DAYS);
    else setSelectedDays([]);
  };

  const toggleDay = (dow: number) => {
    setSelectedHour(null);
    setSelectedDays((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort((a, b) => a - b)));
  };

  const daysValid =
    slotType === 'standard' ? true : slotType === 'pair' ? selectedDays.length === 2 : selectedDays.length >= 2 && selectedDays.length <= 5;

  useEffect(() => {
    let cancelled = false;

    if (!coach || !settings || selectedDays.length === 0 || wizardStep !== 3) {
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
        if (!cancelled) setActionError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setHoursLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coach, settings, selectedDays, trainerPreference, trainerGender, wizardStep]);

  const onConfirm = async () => {
    if (!settings || selectedHour === null || selectedDays.length === 0 || !matchedCoach) return;
    setPhase('saving');
    setActionError(null);
    try {
      const setupResults = await setUpRecurringSchedule(selectedDays, selectedHour, settings.defaultSessionDurationMinutes, matchedCoach.id);
      setResults(setupResults);
      const fullCoach = await getMyCoach();
      setAssignedCoach(fullCoach);
      setPhase('success');
    } catch (err) {
      setActionError(getErrorMessage(err));
      setPhase('pick');
    }
  };

  if (loading) {
    return (
      <LightScreenScaffold title="Set Up Your Schedule">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }

  if (error) {
    return (
      <LightScreenScaffold title="Set Up Your Schedule">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  if (!subscription) {
    return (
      <LightScreenScaffold title="Set Up Your Schedule">
        <LightEmptyState message="You need an active plan before setting up a recurring schedule." icon="lock-closed-outline" />
        <LightPrimaryButton size="lg" onPress={() => router.push('/plans')}>
          View plans
        </LightPrimaryButton>
      </LightScreenScaffold>
    );
  }

  if (!coach) {
    return (
      <LightScreenScaffold title="Set Up Your Schedule">
        <LightEmptyState message="You need a coach assigned before setting up a recurring schedule." icon="person-outline" />
      </LightScreenScaffold>
    );
  }

  if (phase === 'success') {
    const shortfall = results.some((r) => r.confirmed < r.requested);
    const tags = [assignedCoach?.specialization, ...(assignedCoach?.secondary_specializations ?? [])].filter(
      (t): t is string => !!t
    );
    return (
      <LightScreenScaffold title="Your Coach is Ready!" subtitle="We've matched you with the best coach for your goals.">
        <LightCard style={styles.successCard}>
          <View style={styles.successCoachRow}>
            <LightAvatar photoUrl={assignedCoach?.photo_url} name={assignedCoach?.full_name} size={64} ring />
            <View style={styles.successCoachInfo}>
              <Text style={styles.successCoachName}>{assignedCoach?.full_name ?? matchedCoach?.full_name}</Text>
              {assignedCoach?.rating != null && <Text style={styles.successCoachRating}>★ {assignedCoach.rating.toFixed(1)}</Text>}
            </View>
          </View>
          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map((t) => (
                <LightBadge key={t} label={t} tone="teal" />
              ))}
            </View>
          )}
          <Text style={styles.eyebrow}>YOUR NEW WEEKLY PLAN</Text>
          {results.map((r) => (
            <Text key={r.dayOfWeek} style={styles.resultRow}>
              {dayLabel(r.dayOfWeek)} — {r.confirmed}/{r.requested} sessions confirmed
            </Text>
          ))}
          {shortfall && (
            <Text style={styles.warningText}>
              Your coach is heavily booked at this time on at least one day — fewer upcoming sessions were confirmed than
              requested. Check My Sessions, or try a different time.
            </Text>
          )}
        </LightCard>
        <LightPrimaryButton size="lg" onPress={() => router.push('/my-coach')}>
          View Coach Profile
        </LightPrimaryButton>
        <LightSecondaryButton size="lg" onPress={() => router.replace('/(client)')}>
          Go to Dashboard
        </LightSecondaryButton>
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Set Up Your Schedule" subtitle={`Step ${wizardStep} of 3`}>
      {currentSlots.length > 0 && (
        <LightCard>
          <LightSectionHeader title="Current schedule" />
          {currentSlots.map((s) => (
            <CurrentSlotRow key={s.id} slot={s} />
          ))}
        </LightCard>
      )}

      {wizardStep === 2 && (
        <>
          <LightCard>
            <LightSectionHeader title="Select your slots type" />
            <LightChipGrid>
              <LightChip label="Standard (Mon, Wed, Fri)" selected={slotType === 'standard'} onPress={() => onSelectSlotType('standard')} />
              <LightChip label="Pair (Any 2 days)" selected={slotType === 'pair'} onPress={() => onSelectSlotType('pair')} />
              <LightChip label="Custom (Choose 2–5 days)" selected={slotType === 'custom'} onPress={() => onSelectSlotType('custom')} />
            </LightChipGrid>

            {slotType !== 'standard' && (
              <>
                <LightSectionHeader title="Select days" />
                <LightChipGrid>
                  {WEEKDAYS.map((d) => (
                    <LightChip key={d.dow} label={d.short} selected={selectedDays.includes(d.dow)} onPress={() => toggleDay(d.dow)} />
                  ))}
                </LightChipGrid>
                {!daysValid && selectedDays.length > 0 && (
                  <Text style={styles.hintText}>
                    {slotType === 'pair' ? 'Pick exactly 2 days.' : 'Pick between 2 and 5 days.'}
                  </Text>
                )}
              </>
            )}
          </LightCard>

          <LightPrimaryButton size="lg" onPress={() => setWizardStep(3)} disabled={!daysValid}>
            Next
          </LightPrimaryButton>
        </>
      )}

      {wizardStep === 3 && (
        <>
          <LightCard>
            <LightSectionHeader title="Preferred coach gender" />
            <LightChipGrid>
              <LightChip label="Male" selected={trainerGender === 'male'} onPress={() => setTrainerGender('male')} />
              <LightChip label="Female" selected={trainerGender === 'female'} onPress={() => setTrainerGender('female')} />
              <LightChip
                label="No preference"
                selected={trainerGender === 'no_preference'}
                onPress={() => setTrainerGender('no_preference')}
              />
            </LightChipGrid>

            <LightSectionHeader title="Trainer preference" />
            <LightChipGrid>
              <LightChip label="Same trainer" selected={trainerPreference === 'same'} onPress={() => setTrainerPreference('same')} />
              <LightChip label="New trainer" selected={trainerPreference === 'new'} onPress={() => setTrainerPreference('new')} />
              <LightChip
                label="Any Available (Best Match)"
                selected={trainerPreference === 'no_preference'}
                onPress={() => setTrainerPreference('no_preference')}
              />
            </LightChipGrid>
          </LightCard>

          <LightCard>
            <LightSectionHeader title="Select preferred time" />
            {hoursLoading && <LightLoadingState rows={1} />}
            {!hoursLoading && hours && hours.length === 0 && (
              <LightEmptyState message="No single time works across all those days — try a different trainer preference." />
            )}
            {!hoursLoading && hours && hours.length > 0 && (
              <>
                {matchedCoach && trainerPreference !== 'same' && (
                  <Text style={styles.matchedCoachText}>Matched with {matchedCoach.full_name}</Text>
                )}
                <LightChipGrid>
                  {hours.map((h) => (
                    <LightChip key={h} label={formatHourLabel(h)} selected={h === selectedHour} onPress={() => setSelectedHour(h)} />
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

          <LightPrimaryButton size="lg" onPress={onConfirm} loading={phase === 'saving'} disabled={selectedHour === null}>
            Find My Coach
          </LightPrimaryButton>
          <LightSecondaryButton size="lg" onPress={() => setWizardStep(2)}>
            Back
          </LightSecondaryButton>
        </>
      )}
    </LightScreenScaffold>
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
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: LightBrand.textSecondary, marginTop: 10 },
  resultRow: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.navy, marginTop: 4 },
  slotRow: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: LightBrand.textSecondary, marginTop: 4 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
  hintText: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted, marginTop: 2 },
  warningText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.amber, marginTop: 8 },
  matchedCoachText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: LightBrand.textSecondary, marginBottom: 4 },
  successCard: { gap: 8 },
  successCoachRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  successCoachInfo: { gap: 2 },
  successCoachName: { fontFamily: 'Manrope_800ExtraBold', fontSize: 19, color: LightBrand.navy },
  successCoachRating: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: LightBrand.amber },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
});
