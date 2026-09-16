/**
 * My Schedule (recurring weekly pattern) — LEANR_PT_MOBILE_PRD.md §15,
 * recurrsing-slot.md §4.1/§9.7 "Recurring pattern" mechanism. Step 2 is a
 * strict 3-tier fallback, in this exact order: (1) the 3 curated weekly
 * patterns (Mon/Wed/Fri, Tue/Thu/Sat, 6-day) as the primary choice; (2) if
 * none fit, "2 Days a Week" — one of the 6 curated pairs that are subsets
 * of those same two trios, never an arbitrary day combination; (3) only as
 * the last resort, "Choose Your Own Days" (2-5 free-picked days, Mon-Sat).
 * See git history for the confirmed schema/RLS detail and remaining
 * deliberate simplifications (leave-agnostic time matching, same-coach-
 * only matching within a chosen pattern) — unchanged by this relight,
 * business logic untouched beyond the pattern-tier fix above.
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
import { LightTextLink } from '@/components/light/light-tappable';
import { LightBrand } from '@/constants/light-theme';
import { formatLocalHourLabel, getBookingSettings } from '@/lib/data/booking-wizard';
import { getMyCoach } from '@/lib/data/coach';
import {
  findCoachForSchedule,
  findDayCoverage,
  getMyActiveRecurringSlots,
  PAIRS_MWF,
  PAIRS_TTS,
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
import type { CoachProfile } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

/** Shows each slot in the viewer's own device timezone (e.g. "7:30 AM EST" for a US client), not always IST — the underlying match is still computed in IST; only the label changes per viewer. */
function formatHourLabel(hour: number) {
  return formatLocalHourLabel(hour);
}

function dayLabel(dow: number) {
  return WEEKDAYS.find((d) => d.dow === dow)?.short ?? String(dow);
}

type SlotType = 'mwf' | 'tts' | 'sixday' | 'pair' | 'custom';

/** recurrsing-slot.md §4.1: both trios' curated pairs presented together as one flat list of 6. */
const ALL_PAIRS: [number, number][] = [...PAIRS_MWF, ...PAIRS_TTS];

type Phase = 'pick' | 'saving' | 'success';

export default function MyScheduleScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [subscription, currentSlots, settings] = await Promise.all([getMySubscription(), getMyActiveRecurringSlots(), getBookingSettings()]);
    return { subscription, currentSlots, settings };
  }, []);

  const subscription = data?.subscription ?? null;
  const currentSlots = data?.currentSlots ?? [];
  const settings = data?.settings ?? null;

  // GAP-14 / web spec BR-10, §7.3: an existing active recurring slot means this is a
  // renewal/change flow, not first-time setup — web never offers "no preference" gender on
  // that path (first-time setup does). `no_preference` here means "not yet chosen," not a
  // valid selection, when `isChangeContext` — see the gated chip + submit guard below.
  const isChangeContext = currentSlots.length > 0;

  const [wizardStep, setWizardStep] = useState<2 | 3>(2);
  const [slotType, setSlotType] = useState<SlotType>('mwf');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [trainerPreference, setTrainerPreference] = useState<TrainerPreference>('same');
  const [trainerGender, setTrainerGender] = useState<TrainerGenderPreference>('no_preference');
  const genderChosen = !isChangeContext || trainerGender !== 'no_preference';

  // First-time clients have no existing coach to mean "Same trainer" against — default them
  // to the whole-roster search instead of a preference that can only ever return no match.
  useEffect(() => {
    if (!loading && !isChangeContext) setTrainerPreference('no_preference');
  }, [loading, isChangeContext]);

  const [hours, setHours] = useState<number[] | null>(null);
  const [matchedCoach, setMatchedCoach] = useState<CoachMatchCandidate | null>(null);
  const [dayCoverage, setDayCoverage] = useState<Record<number, boolean> | null>(null);
  const [assignedCoach, setAssignedCoach] = useState<CoachProfile | null>(null);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [results, setResults] = useState<SetupResult[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const onSelectPattern = (preset: (typeof PATTERN_PRESETS)[number]) => {
    setSlotType(preset.key);
    setSelectedHour(null);
    setSelectedDays([...preset.days]);
  };

  const onSelectPair = (pair: [number, number]) => {
    setSlotType('pair');
    setSelectedHour(null);
    setSelectedDays(pair);
  };

  /** Switches into custom mode on the first tap (starting a fresh 1-day selection), then behaves as a plain multi-select toggle. */
  const toggleCustomDay = (dow: number) => {
    setSelectedHour(null);
    if (slotType !== 'custom') {
      setSlotType('custom');
      setSelectedDays([dow]);
      return;
    }
    setSelectedDays((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort((a, b) => a - b)));
  };

  const daysValid =
    slotType === 'mwf' || slotType === 'tts' || slotType === 'sixday'
      ? true
      : slotType === 'pair'
        ? selectedDays.length === 2
        : selectedDays.length >= 2 && selectedDays.length <= 5;

  useEffect(() => {
    let cancelled = false;

    if (!settings || selectedDays.length === 0 || wizardStep !== 3 || !genderChosen) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setHours(null);
          setMatchedCoach(null);
          setDayCoverage(null);
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
      setDayCoverage(null);
      setSelectedHour(null);
      setHoursLoading(true);
    });
    const window = { startHour: settings.bookingWindowStartHour, endHour: settings.bookingWindowEndHour };
    findCoachForSchedule(selectedDays, settings.defaultSessionDurationMinutes, window, trainerPreference, trainerGender)
      .then(async (match) => {
        if (cancelled) return;
        setHours(match?.hours ?? []);
        setMatchedCoach(match?.coach ?? null);
        // No coach covers every selected day at any common hour — pinpoint which
        // specific day(s) are the blocker instead of a bare "no match" message.
        if (!match) {
          const coverage = await findDayCoverage(selectedDays, settings.defaultSessionDurationMinutes, window, trainerGender);
          if (!cancelled) setDayCoverage(coverage);
        }
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
  }, [settings, selectedDays, trainerPreference, trainerGender, wizardStep, genderChosen]);

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
            <LightSectionHeader title="Choose your weekly pattern" />
            <LightChipGrid>
              {PATTERN_PRESETS.map((preset) => (
                <LightChip
                  key={preset.key}
                  label={preset.key === 'sixday' ? '6 Days a Week — Mon–Sat' : `${preset.label} — 3 sessions a week`}
                  selected={slotType === preset.key}
                  onPress={() => onSelectPattern(preset)}
                />
              ))}
            </LightChipGrid>

            {!showMoreOptions && (
              <LightTextLink onPress={() => setShowMoreOptions(true)} style={styles.moreOptionsLink}>
                Not happy with these slots?
              </LightTextLink>
            )}

            {showMoreOptions && (
              <>
                <LightSectionHeader title="2 Days a Week" />
                <LightChipGrid>
                  {ALL_PAIRS.map((pair) => (
                    <LightChip
                      key={`${pair[0]}-${pair[1]}`}
                      label={`${dayLabel(pair[0])} + ${dayLabel(pair[1])}`}
                      selected={slotType === 'pair' && selectedDays[0] === pair[0] && selectedDays[1] === pair[1]}
                      onPress={() => onSelectPair(pair)}
                    />
                  ))}
                </LightChipGrid>

                <LightSectionHeader title="Choose Your Own Days (2–5 days)" />
                <LightChipGrid>
                  {WEEKDAYS.map((d) => (
                    <LightChip
                      key={d.dow}
                      label={d.short}
                      selected={slotType === 'custom' && selectedDays.includes(d.dow)}
                      onPress={() => toggleCustomDay(d.dow)}
                    />
                  ))}
                </LightChipGrid>
                {slotType === 'custom' && !daysValid && selectedDays.length > 0 && (
                  <Text style={styles.hintText}>Pick between 2 and 5 days.</Text>
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
              {!isChangeContext && (
                <LightChip
                  label="No preference"
                  selected={trainerGender === 'no_preference'}
                  onPress={() => setTrainerGender('no_preference')}
                />
              )}
            </LightChipGrid>
            {isChangeContext && !genderChosen && <Text style={styles.hintText}>Pick a preferred coach gender to continue.</Text>}

            {isChangeContext && (
              <>
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
              </>
            )}
          </LightCard>

          <LightCard>
            <LightSectionHeader title="Select preferred time" />
            {hoursLoading && <LightLoadingState rows={1} />}
            {!hoursLoading && hours && hours.length === 0 && (
              <>
                <LightEmptyState message="No coach can be assigned — none are free across every one of those days." />
                {dayCoverage && (
                  <View style={styles.coverageBlock}>
                    {selectedDays.map((d) => (
                      <Text key={d} style={dayCoverage[d] ? styles.coverageOk : styles.coverageBad}>
                        {dayLabel(d)}: {dayCoverage[d] ? 'a coach is free that day' : 'no coach is free at all that day'}
                      </Text>
                    ))}
                    <Text style={styles.hintText}>Try dropping the day(s) marked above, or a different trainer preference.</Text>
                  </View>
                )}
              </>
            )}
            {!hoursLoading && settings && (
              <>
                {hours && hours.length > 0 && matchedCoach && trainerPreference !== 'same' && (
                  <Text style={styles.matchedCoachText}>Matched with {matchedCoach.full_name}</Text>
                )}
                {/* Full 5am-9pm-style grid (the live booking window) is always shown — hours with
                    no available coach render disabled rather than disappearing, so the client can
                    see the whole day at a glance instead of just a filtered subset. */}
                <LightChipGrid>
                  {Array.from({ length: settings.bookingWindowEndHour - settings.bookingWindowStartHour }, (_, i) => settings.bookingWindowStartHour + i).map(
                    (h) => {
                      const available = hours?.includes(h) ?? false;
                      return (
                        <LightChip
                          key={h}
                          label={formatHourLabel(h)}
                          selected={h === selectedHour}
                          disabled={!available}
                          onPress={() => setSelectedHour(h)}
                        />
                      );
                    }
                  )}
                </LightChipGrid>
              </>
            )}
          </LightCard>

          {actionError && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {actionError}
            </Text>
          )}

          <LightPrimaryButton size="lg" onPress={onConfirm} loading={phase === 'saving'} disabled={selectedHour === null || !genderChosen}>
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
  coverageBlock: { gap: 4, marginTop: 8 },
  coverageOk: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.tealDark },
  coverageBad: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.alertRed },
  moreOptionsLink: { marginTop: 10 },
  warningText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.amber, marginTop: 8 },
  matchedCoachText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: LightBrand.textSecondary, marginBottom: 4 },
  successCard: { gap: 8 },
  successCoachRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  successCoachInfo: { gap: 2 },
  successCoachName: { fontFamily: 'Manrope_800ExtraBold', fontSize: 19, color: LightBrand.navy },
  successCoachRating: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: LightBrand.amber },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
});
