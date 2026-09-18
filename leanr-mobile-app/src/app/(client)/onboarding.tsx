/**
 * Onboarding (Initial Assessment) — New PRD.md §4.A `/client/onboarding`.
 * One-time health/goals intake, required before the Home journey gate
 * (src/lib/data/journey.ts) lets a client through to the normal dashboard.
 * Weight + Fitness Goal are the only two required fields, matching the web
 * app exactly. Not a tab itself, hidden via `href: null` in the layout.
 *
 * Relit + restructured into a 3-step wizard for the post-purchase light
 * theme (mockup frame 5, "Step 1 of 3") — same fields/validation/one-time
 * submit as before, just paced across 3 screens instead of one long form.
 *
 * The mockup's step-1 "Current Fitness Level" (Beginner/Intermediate/
 * Advanced) selector is deliberately omitted: `client_onboarding` has no
 * such column (only `fitness_goal` does) — nothing to persist it to, so
 * showing that control would silently discard whatever the client picked.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { LoadingState } from '@/components/ui/states';
import { getMyOnboarding, submitOnboarding } from '@/lib/data/onboarding';
import type { FitnessGoal } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';
import { Brand } from '@/constants/theme';

const FITNESS_GOALS: { value: FitnessGoal; label: string }[] = [
  { value: 'fat_loss', label: 'Fat Loss' },
  { value: 'muscle_gain', label: 'Muscle Gain' },
  { value: 'strength', label: 'Strength' },
  { value: 'general_fitness', label: 'General Fitness' },
  { value: 'rehabilitation', label: 'Rehabilitation' },
];

const GENDERS = ['Male', 'Female', 'Other'];
const TOTAL_STEPS = 3;

function toNumber(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export default function OnboardingScreen() {
  // AUTH-008 fix: re-verify server-side on every load that onboarding hasn't already been
  // submitted, instead of rendering the form and only discovering the "already submitted"
  // error at the moment of a doomed submit attempt.
  const { data: existingOnboarding, loading: checkingExisting } = useAsync(getMyOnboarding, []);
  useEffect(() => {
    if (!checkingExisting && existingOnboarding) {
      router.replace('/(client)');
    }
  }, [checkingExisting, existingOnboarding]);

  const [step, setStep] = useState(1);
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState<FitnessGoal | null>(null);
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [height, setHeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [muscle, setMuscle] = useState('');
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [hip, setHip] = useState('');
  const [arms, setArms] = useState('');
  const [thigh, setThigh] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [injuries, setInjuries] = useState('');
  const [medications, setMedications] = useState('');
  const [exerciseRestrictions, setExerciseRestrictions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const weightNum = toNumber(weight);
  const canSubmit = weightNum !== undefined && goal !== null;

  const onNext = () => {
    setFormError(null);
    if (step === 1 && !goal) {
      setFormError('Pick a fitness goal to continue.');
      return;
    }
    if (step === 2 && weightNum === undefined) {
      setFormError('Weight is required to continue.');
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const onBack = () => {
    setFormError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const onSubmit = async () => {
    if (!canSubmit || weightNum === undefined || !goal) {
      setFormError('Weight and a fitness goal are required.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await submitOnboarding({
        weightKg: weightNum,
        fitnessGoal: goal,
        age: toNumber(age),
        gender: gender ?? undefined,
        heightCm: toNumber(height),
        bodyFatPct: toNumber(bodyFat),
        musclePct: toNumber(muscle),
        waist: toNumber(waist),
        chest: toNumber(chest),
        hip: toNumber(hip),
        arms: toNumber(arms),
        thigh: toNumber(thigh),
        medicalConditions: medicalConditions.trim() || undefined,
        injuries: injuries.trim() || undefined,
        medications: medications.trim() || undefined,
        exerciseRestrictions: exerciseRestrictions.trim() || undefined,
      });
      router.replace('/(client)');
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingExisting) {
    return (
      <ScreenScaffold title="Let's Get Started!">
        <LoadingState />
      </ScreenScaffold>
    );
  }
  if (existingOnboarding) return null; // redirecting via the effect above

  return (
    <ScreenScaffold title="Let's Get Started!" subtitle={`Step ${step} of ${TOTAL_STEPS}`}>
      {step === 1 && (
        <GlassCard>
          <SectionHeader title="Your fitness goal" />
          <ChipGrid>
            {FITNESS_GOALS.map((g) => (
              <Chip key={g.value} label={g.label} selected={goal === g.value} onPress={() => setGoal(g.value)} />
            ))}
          </ChipGrid>
        </GlassCard>
      )}

      {step === 2 && (
        <GlassCard>
          <SectionHeader title="Baseline measurements" />
          <TextField placeholder="Weight (kg) *" keyboardType="numeric" value={weight} onChangeText={setWeight} />
          <TextField placeholder="Age" keyboardType="numeric" value={age} onChangeText={setAge} />
          <TextField placeholder="Height (cm)" keyboardType="numeric" value={height} onChangeText={setHeight} />
          <Text style={styles.label}>GENDER</Text>
          <ChipGrid>
            {GENDERS.map((g) => (
              <Chip key={g} label={g} selected={gender === g.toLowerCase()} onPress={() => setGender(g.toLowerCase())} />
            ))}
          </ChipGrid>
          <Text style={[styles.label, styles.optionalLabel]}>OPTIONAL</Text>
          <TextField placeholder="Body fat %" keyboardType="numeric" value={bodyFat} onChangeText={setBodyFat} />
          <TextField placeholder="Muscle %" keyboardType="numeric" value={muscle} onChangeText={setMuscle} />
          {/* AUTH-006 fix: web spec has these as inches, not cm (BR-8 / ClientPortal.md §7.2). */}
          <TextField placeholder="Waist (in)" keyboardType="numeric" value={waist} onChangeText={setWaist} />
          <TextField placeholder="Chest (in)" keyboardType="numeric" value={chest} onChangeText={setChest} />
          <TextField placeholder="Hip (in)" keyboardType="numeric" value={hip} onChangeText={setHip} />
          <TextField placeholder="Arms (in)" keyboardType="numeric" value={arms} onChangeText={setArms} />
          <TextField placeholder="Thigh (in)" keyboardType="numeric" value={thigh} onChangeText={setThigh} />
        </GlassCard>
      )}

      {step === 3 && (
        <GlassCard>
          <SectionHeader eyebrow="Optional" title="Medical info" />
          <TextField
            placeholder="Medical conditions"
            value={medicalConditions}
            onChangeText={setMedicalConditions}
            multiline
            style={styles.multilineInput}
          />
          <TextField placeholder="Injuries" value={injuries} onChangeText={setInjuries} multiline style={styles.multilineInput} />
          <TextField
            placeholder="Medications"
            value={medications}
            onChangeText={setMedications}
            multiline
            style={styles.multilineInput}
          />
          <TextField
            placeholder="Exercise restrictions"
            value={exerciseRestrictions}
            onChangeText={setExerciseRestrictions}
            multiline
            style={styles.multilineInput}
          />
        </GlassCard>
      )}

      {formError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {formError}
        </Text>
      )}

      {step < TOTAL_STEPS ? (
        <PrimaryButton size="lg" onPress={onNext}>
          Next
        </PrimaryButton>
      ) : (
        <PrimaryButton size="lg" onPress={onSubmit} loading={submitting} disabled={!canSubmit}>
          Complete Assessment
        </PrimaryButton>
      )}
      {step > 1 && (
        <SecondaryButton size="lg" onPress={onBack}>
          Back
        </SecondaryButton>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: 'rgba(255,255,255,0.45)' },
  optionalLabel: { marginTop: 4 },
  multilineInput: { minHeight: 70, textAlignVertical: 'top', paddingTop: 14 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
