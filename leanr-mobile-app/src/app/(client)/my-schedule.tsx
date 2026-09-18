/**
 * My Schedule — recurring weekly pattern. Ported from
 * mobile-app-reference/audit/recurring-slot.md §4/§5/§6 (authoritative
 * spec, reverse-engineered from the web app). Three distinct flows share
 * this one screen, exactly as the web's `ScheduleSetupClient`/
 * `ChangeScheduleClient` do:
 *
 * - **First-time setup** (`currentSlots.length === 0`): pattern+time
 *   picker only, no trainer-preference step, exact-match-or-fail against
 *   the whole roster (`findAvailableCoachExact`) — doc §9 rule 8.
 * - **Mid-plan change** (`currentSlots.length > 0`, no
 *   `renewalSubscriptionId` param): the current schedule renders
 *   read-only first, behind a "Change My Schedule" button (doc §5) — only
 *   pressing it reveals the picker. Trainer Preference offers all three
 *   modes (Same/New/No Preference), no gender selector (doc §5.1's table
 *   doesn't mention one for this path).
 * - **Renewal "No, Change It"** (reached via `?renewalSubscriptionId=`
 *   from renewal-scheduling.tsx): skips the read-only summary (the
 *   Keep-vs-Change decision already happened), Trainer Preference is
 *   Same/New only (doc §6.1 — no "No Preference" for renewals), and
 *   choosing New Trainer reveals a Gender Preference selector that only
 *   exists on this path.
 *
 * "Same Trainer" and the same-coach half of "No Preference" get the real
 * fallback ladder (`matchRecurringPatternForCoach`); "New Trainer" and the
 * whole-roster half of "No Preference" are exact-match-only
 * (`findAvailableCoachExact`) — doc §9 rule 8, kept as two separate data-
 * layer functions rather than one "smart" matcher (doc §10). A match
 * result that isn't the client's exact request is always labeled "Closest
 * available match," never silently substituted (doc §5.2).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { TextLink } from '@/components/tappable';
import { formatLocalHourLabel, getBookingSettings } from '@/lib/data/booking-wizard';
import { getMyCoach } from '@/lib/data/coach';
import type { GenderPreference } from '@/lib/data/demo-booking';
import {
  changeMyRecurringSchedule,
  createRecurringSlots,
  findAvailableCoachExact,
  findDayCoverage,
  matchRecurringPatternForCoach,
  getMyActiveRecurringSlots,
  PAIRS_MWF,
  PAIRS_TTS,
  PATTERN_PRESETS,
  reportScheduleUnmatched,
  WEEKDAYS,
  type PatternKey,
  type RecurringSlot,
  type TrainerPreference,
} from '@/lib/data/recurring-schedule';
import { getMySubscription } from '@/lib/data/subscription';
import type { CoachProfile } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';
import { Brand } from '@/constants/theme';

function formatHourLabel(hour: number) {
  return formatLocalHourLabel(hour);
}

function dayLabel(dow: number) {
  return WEEKDAYS.find((d) => d.dow === dow)?.short ?? String(dow);
}

/** recurrsing-slot.md §4.1/§9.7: both trios' curated pairs presented together as one flat list of 6. */
const ALL_PAIRS: [number, number][] = [...PAIRS_MWF, ...PAIRS_TTS];

type SlotType = 'mwf' | 'tts' | 'sixday' | 'pair' | 'custom';
type Phase = 'summary' | 'pick' | 'result' | 'saving' | 'success';

/** A curated pair or free `custom` selection both feed the matcher as `pattern:'custom'` + explicit days — 'pair' is a UI curation only, not a distinct matcher input (doc §11.4's `PatternKey` has no 'pair' member). */
function toMatcherPattern(slotType: SlotType): PatternKey {
  return slotType === 'pair' || slotType === 'custom' ? 'custom' : slotType;
}

type MatchResult = { coachId: string; coachName: string; days: number[]; hour: number; exact: boolean };

export default function MyScheduleScreen() {
  const { renewalSubscriptionId } = useLocalSearchParams<{ renewalSubscriptionId?: string }>();
  const isRenewal = !!renewalSubscriptionId;

  const { data, loading, error, reload } = useAsync(async () => {
    const [subscription, currentSlots, settings, currentCoach] = await Promise.all([
      getMySubscription(),
      getMyActiveRecurringSlots(),
      getBookingSettings(),
      getMyCoach(),
    ]);
    return { subscription, currentSlots, settings, currentCoach };
  }, []);

  const subscription = data?.subscription ?? null;
  const currentSlots = data?.currentSlots ?? [];
  const settings = data?.settings ?? null;
  const currentCoach = data?.currentCoach ?? null;
  const isChangeContext = currentSlots.length > 0;

  // `null` = not yet overridden by a user action — the effective phase is then derived purely
  // from loaded data, so the read-only "current schedule" gate (mid-plan change only; renewal
  // already made its Keep-vs-Change decision on the previous screen) needs no effect at all.
  const [phaseOverride, setPhaseOverride] = useState<Phase | null>(null);
  const phase: Phase = phaseOverride ?? (isChangeContext && !isRenewal ? 'summary' : 'pick');
  const setPhase = setPhaseOverride;

  const [slotType, setSlotType] = useState<SlotType>('mwf');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [preferredHour, setPreferredHour] = useState<number | null>(null);
  const [trainerPreference, setTrainerPreference] = useState<TrainerPreference>('same');
  const [genderPreference, setGenderPreference] = useState<GenderPreference | null>(null);

  const daysValid =
    slotType === 'mwf' || slotType === 'tts' || slotType === 'sixday'
      ? true
      : slotType === 'pair'
        ? selectedDays.length === 2
        : selectedDays.length >= 2 && selectedDays.length <= 5;

  const onSelectPattern = (preset: (typeof PATTERN_PRESETS)[number]) => {
    setSlotType(preset.key);
    setSelectedDays([...preset.days]);
  };

  const onSelectPair = (pair: [number, number]) => {
    setSlotType('pair');
    setSelectedDays(pair);
  };

  const toggleCustomDay = (dow: number) => {
    if (slotType !== 'custom') {
      setSlotType('custom');
      setSelectedDays([dow]);
      return;
    }
    setSelectedDays((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort((a, b) => a - b)));
  };

  const [searching, setSearching] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [noMatch, setNoMatch] = useState(false);
  const [dayCoverage, setDayCoverage] = useState<Record<number, boolean> | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [assignedCoach, setAssignedCoach] = useState<CoachProfile | null>(null);
  const [resultLabel, setResultLabel] = useState<string>('');

  const onCheckAvailability = async () => {
    if (!settings || preferredHour === null) return;
    setSearching(true);
    setMatchError(null);
    setNoMatch(false);
    setDayCoverage(null);
    setMatchResult(null);
    const window = { startHour: settings.bookingWindowStartHour, endHour: settings.bookingWindowEndHour };
    const pattern = toMatcherPattern(slotType);
    const customDays = pattern === 'custom' ? selectedDays : undefined;

    try {
      // First-time setup: exact-match-only, whole roster (doc §4.2/§9 rule 8).
      if (!isChangeContext) {
        const r = await findAvailableCoachExact(pattern, preferredHour, window, { customDays });
        if (!r) {
          setNoMatch(true);
          const coverage = await findDayCoverage(customDays ?? selectedDays, window);
          setDayCoverage(coverage);
          return;
        }
        setMatchResult({ coachId: r.coach.id, coachName: r.coach.full_name, days: r.days, hour: r.hour, exact: true });
        setResultLabel('Exact match');
        return;
      }

      // "New Trainer": exact-match-only, never the current coach (doc §5.1/§9 rule 8).
      if (trainerPreference === 'new') {
        const r = await findAvailableCoachExact(pattern, preferredHour, window, {
          customDays,
          excludeCoachId: currentCoach?.id,
          genderPreference: isRenewal ? (genderPreference ?? undefined) : undefined,
        });
        if (!r) {
          setNoMatch(true);
          const coverage = await findDayCoverage(customDays ?? selectedDays, window, isRenewal ? (genderPreference ?? undefined) : undefined);
          setDayCoverage(coverage);
          return;
        }
        setMatchResult({ coachId: r.coach.id, coachName: r.coach.full_name, days: r.days, hour: r.hour, exact: true });
        setResultLabel('Exact match');
        return;
      }

      // "Same Trainer": the one real fallback ladder, never changes coach (doc §5.2).
      if (trainerPreference === 'same') {
        if (!currentCoach) {
          setMatchError('No current coach on file to match against.');
          return;
        }
        const r = await matchRecurringPatternForCoach(currentCoach.id, pattern, preferredHour, window, { customDays });
        if (!r) {
          setNoMatch(true);
          return;
        }
        setMatchResult({ coachId: currentCoach.id, coachName: currentCoach.full_name ?? 'your coach', days: r.days, hour: r.hour, exact: r.exact });
        setResultLabel(r.exact ? 'Exact match' : 'Closest available match');
        return;
      }

      // "No Preference": same-coach ladder first (maximizes continuity); if that finds
      // nothing, widen to the whole roster, exact pattern/time only (no ladder) — doc §5.1.
      if (currentCoach) {
        const same = await matchRecurringPatternForCoach(currentCoach.id, pattern, preferredHour, window, { customDays });
        if (same) {
          setMatchResult({ coachId: currentCoach.id, coachName: currentCoach.full_name ?? 'your coach', days: same.days, hour: same.hour, exact: same.exact });
          setResultLabel(same.exact ? 'Exact match' : 'Closest available match');
          return;
        }
      }
      const widened = await findAvailableCoachExact(pattern, preferredHour, window, { customDays, excludeCoachId: currentCoach?.id });
      if (!widened) {
        setNoMatch(true);
        const coverage = await findDayCoverage(customDays ?? selectedDays, window);
        setDayCoverage(coverage);
        return;
      }
      setMatchResult({ coachId: widened.coach.id, coachName: widened.coach.full_name, days: widened.days, hour: widened.hour, exact: true });
      setResultLabel('Exact match');
    } catch (err) {
      setMatchError(getErrorMessage(err));
    } finally {
      setSearching(false);
      setPhase('result');
    }
  };

  const onConfirm = async () => {
    if (!matchResult) return;
    setConfirming(true);
    setMatchError(null);
    try {
      if (!isChangeContext) {
        await createRecurringSlots({ coachId: matchResult.coachId, days: matchResult.days, hour: matchResult.hour });
      } else {
        await changeMyRecurringSchedule({
          coachId: matchResult.coachId,
          days: matchResult.days,
          hour: matchResult.hour,
          subscriptionId: renewalSubscriptionId,
        });
      }
      const fullCoach = await getMyCoach();
      setAssignedCoach(fullCoach);
      setPhase('success');
    } catch (err) {
      setMatchError(getErrorMessage(err));
      setPhase('result');
    } finally {
      setConfirming(false);
    }
  };

  const onNotifySupport = async () => {
    await reportScheduleUnmatched({
      coachName: trainerPreference === 'same' ? (currentCoach?.full_name ?? null) : null,
      patternAttempted: `${slotType} (${selectedDays.map(dayLabel).join('/')}) at ${preferredHour !== null ? formatHourLabel(preferredHour) : '—'}`,
    });
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

  // doc §5: the read-only current-schedule gate — only a "Change My Schedule" tap reveals the picker.
  if (phase === 'summary') {
    return (
      <ScreenScaffold title="My Schedule" subtitle="Your current weekly pattern.">
        <GlassCard>
          <SectionHeader title="Current schedule" />
          {currentCoach && (
            <View style={styles.summaryCoachRow}>
              <Avatar photoUrl={currentCoach.photo_url} name={currentCoach.full_name} size={40} />
              <Text style={styles.summaryCoachName}>{currentCoach.full_name ?? 'Your coach'}</Text>
            </View>
          )}
          {currentSlots.map((s: RecurringSlot) => (
            <Text key={s.id} style={styles.slotRow}>
              {dayLabel(s.day_of_week)} — {formatHourLabel(Number(s.start_time.slice(0, 2)))}
            </Text>
          ))}
        </GlassCard>
        <PrimaryButton size="lg" onPress={() => setPhase('pick')}>
          Change My Schedule
        </PrimaryButton>
      </ScreenScaffold>
    );
  }

  if (phase === 'success') {
    return (
      <ScreenScaffold title="Your Coach is Ready!" subtitle="We've matched you with the best coach for your goals.">
        <GlassCard style={styles.successCard}>
          <View style={styles.successCoachRow}>
            <Avatar photoUrl={assignedCoach?.photo_url} name={assignedCoach?.full_name} size={64} ring />
            <View style={styles.successCoachInfo}>
              <Text style={styles.successCoachName}>{assignedCoach?.full_name ?? matchResult?.coachName}</Text>
              {assignedCoach?.rating != null && <Text style={styles.successCoachRating}>★ {assignedCoach.rating.toFixed(1)}</Text>}
            </View>
          </View>
          <Text style={styles.eyebrow}>YOUR NEW WEEKLY PLAN</Text>
          {matchResult?.days.map((d) => (
            <Text key={d} style={styles.resultRow}>
              {dayLabel(d)} at {formatHourLabel(matchResult.hour)}
            </Text>
          ))}
          <Text style={styles.successHint}>Your next few sessions have already been added to your calendar.</Text>
        </GlassCard>
        <PrimaryButton size="lg" onPress={() => router.push('/my-coach')}>
          View Coach Profile
        </PrimaryButton>
        <SecondaryButton size="lg" onPress={() => router.replace('/(client)')}>
          Go to Dashboard
        </SecondaryButton>
      </ScreenScaffold>
    );
  }

  if (phase === 'result') {
    return (
      <ScreenScaffold title="Set Up Your Schedule">
        {searching && <LoadingState />}

        {!searching && matchResult && (
          <GlassCard>
            <Badge label={resultLabel} tone={matchResult.exact ? 'green' : 'yellow'} />
            <Text style={styles.matchedCoachText}>Matched with {matchResult.coachName}</Text>
            {matchResult.days.map((d) => (
              <Text key={d} style={styles.resultRow}>
                {dayLabel(d)} at {formatHourLabel(matchResult.hour)}
              </Text>
            ))}
            {!matchResult.exact && (
              <Text style={styles.hintText}>This isn&apos;t exactly what you asked for — review before confirming.</Text>
            )}
          </GlassCard>
        )}

        {!searching && noMatch && (
          <GlassCard>
            <EmptyState message="No coach can be matched to that request." icon="calendar-outline" />
            {dayCoverage && (
              <View style={styles.coverageBlock}>
                {Object.entries(dayCoverage).map(([d, ok]) => (
                  <Text key={d} style={ok ? styles.coverageOk : styles.coverageBad}>
                    {dayLabel(Number(d))}: {ok ? 'a coach is free that day' : 'no coach is free at all that day'}
                  </Text>
                ))}
              </View>
            )}
            <Text style={styles.hintText}>Try a 2-day pairing, custom days, or notify support to resolve manually.</Text>
            <TextLink onPress={onNotifySupport} style={styles.notifyLink}>
              Notify Support
            </TextLink>
          </GlassCard>
        )}

        {matchError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {matchError}
          </Text>
        )}

        {!searching && matchResult && (
          <PrimaryButton size="lg" onPress={onConfirm} loading={confirming}>
            Confirm
          </PrimaryButton>
        )}
        <SecondaryButton size="lg" onPress={() => setPhase('pick')}>
          Back
        </SecondaryButton>
      </ScreenScaffold>
    );
  }

  const genderChosen = trainerPreference !== 'new' || !isRenewal || genderPreference !== null;

  return (
    <ScreenScaffold title="Set Up Your Schedule" subtitle={isChangeContext ? 'Choose your new weekly pattern.' : `Step 1 of ${isChangeContext ? 2 : 1}`}>
      <GlassCard>
        <SectionHeader title="Choose your weekly pattern" />
        <ChipGrid>
          {PATTERN_PRESETS.map((preset) => (
            <Chip
              key={preset.key}
              label={preset.key === 'sixday' ? '6 Days a Week — Mon–Sat' : `${preset.label} — 3 sessions a week`}
              selected={slotType === preset.key}
              onPress={() => onSelectPattern(preset)}
            />
          ))}
        </ChipGrid>

        {!showMoreOptions && (
          <TextLink onPress={() => setShowMoreOptions(true)} style={styles.moreOptionsLink}>
            Not happy with these slots?
          </TextLink>
        )}

        {showMoreOptions && (
          <>
            <SectionHeader title="2 Days a Week" />
            <ChipGrid>
              {ALL_PAIRS.map((pair) => (
                <Chip
                  key={`${pair[0]}-${pair[1]}`}
                  label={`${dayLabel(pair[0])} + ${dayLabel(pair[1])}`}
                  selected={slotType === 'pair' && selectedDays[0] === pair[0] && selectedDays[1] === pair[1]}
                  onPress={() => onSelectPair(pair)}
                />
              ))}
            </ChipGrid>

            <SectionHeader title="Choose Your Own Days (2–5 days)" />
            <ChipGrid>
              {WEEKDAYS.map((d) => (
                <Chip
                  key={d.dow}
                  label={d.short}
                  selected={slotType === 'custom' && selectedDays.includes(d.dow)}
                  onPress={() => toggleCustomDay(d.dow)}
                />
              ))}
            </ChipGrid>
            {slotType === 'custom' && !daysValid && selectedDays.length > 0 && (
              <Text style={styles.hintText}>Pick between 2 and 5 days.</Text>
            )}
          </>
        )}
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Preferred time" />
        {settings && (
          <ChipGrid>
            {Array.from({ length: settings.bookingWindowEndHour - settings.bookingWindowStartHour }, (_, i) => settings.bookingWindowStartHour + i).map(
              (h) => (
                <Chip key={h} label={formatHourLabel(h)} selected={h === preferredHour} onPress={() => setPreferredHour(h)} />
              )
            )}
          </ChipGrid>
        )}
      </GlassCard>

      {isChangeContext && (
        <GlassCard>
          <SectionHeader title="Trainer preference" />
          <ChipGrid>
            <Chip label="Same trainer" selected={trainerPreference === 'same'} onPress={() => setTrainerPreference('same')} />
            <Chip label="New trainer" selected={trainerPreference === 'new'} onPress={() => setTrainerPreference('new')} />
            {/* doc §6.1: "No Preference" is offered for a regular mid-plan change but NOT for a renewal's Change flow. */}
            {!isRenewal && (
              <Chip
                label="Any Available (Best Match)"
                selected={trainerPreference === 'no_preference'}
                onPress={() => setTrainerPreference('no_preference')}
              />
            )}
          </ChipGrid>

          {/* doc §6.1: the Gender Preference selector only exists on the renewal + New Trainer path. */}
          {isRenewal && trainerPreference === 'new' && (
            <>
              <SectionHeader title="Preferred coach gender" />
              <ChipGrid>
                <Chip label="Male" selected={genderPreference === 'male'} onPress={() => setGenderPreference('male')} />
                <Chip label="Female" selected={genderPreference === 'female'} onPress={() => setGenderPreference('female')} />
                <Chip label="Other" selected={genderPreference === 'other'} onPress={() => setGenderPreference('other')} />
              </ChipGrid>
              {!genderChosen && <Text style={styles.hintText}>Pick a preferred coach gender to continue.</Text>}
            </>
          )}
        </GlassCard>
      )}

      {matchError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {matchError}
        </Text>
      )}

      <PrimaryButton
        size="lg"
        onPress={onCheckAvailability}
        loading={searching}
        disabled={!daysValid || preferredHour === null || !genderChosen}
      >
        Check Availability
      </PrimaryButton>
      {isChangeContext && !isRenewal && (
        <SecondaryButton size="lg" onPress={() => setPhase('summary')}>
          Back
        </SecondaryButton>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: 'rgba(255,255,255,0.6)', marginTop: 10 },
  resultRow: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFFFFF', marginTop: 4 },
  slotRow: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  hintText: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginTop: 6 },
  coverageBlock: { gap: 4, marginTop: 8 },
  coverageOk: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: Brand.yellow },
  coverageBad: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: Brand.alertRed },
  moreOptionsLink: { marginTop: 10 },
  notifyLink: { marginTop: 10 },
  successCard: { gap: 8 },
  successCoachRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  successCoachInfo: { gap: 2 },
  successCoachName: { fontFamily: 'Manrope_800ExtraBold', fontSize: 19, color: '#FFFFFF' },
  successCoachRating: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.yellow },
  successHint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginTop: 8 },
  matchedCoachText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: 'rgba(255,255,255,0.6)', marginTop: 6, marginBottom: 2 },
  summaryCoachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  summaryCoachName: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: '#FFFFFF' },
});
