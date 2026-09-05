/**
 * Onboarding (Initial Assessment) — New PRD.md §4.A `/client/onboarding`.
 * One-time health/goals intake, required before the Home journey gate
 * (src/lib/data/journey.ts) lets a client through to the normal dashboard.
 * Weight + Fitness Goal are the only two required fields, matching the web
 * app exactly. Not a tab itself, hidden via `href: null` in the layout.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { ScreenScaffold } from '@/components/screen-scaffold';
import { PrimaryButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { Brand, Radius } from '@/constants/theme';
import { submitOnboarding } from '@/lib/data/onboarding';
import type { FitnessGoal } from '@/lib/data/types';

const FITNESS_GOALS: { value: FitnessGoal; label: string }[] = [
  { value: 'fat_loss', label: 'Fat Loss' },
  { value: 'muscle_gain', label: 'Muscle Gain' },
  { value: 'strength', label: 'Strength' },
  { value: 'general_fitness', label: 'General Fitness' },
  { value: 'rehabilitation', label: 'Rehabilitation' },
];

const GENDERS = ['Male', 'Female', 'Other'];

function toNumber(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export default function OnboardingScreen() {
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
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenScaffold title="Tell Us About You" subtitle="A quick health check so your coach can build the right plan.">
      <GlassCard>
        <SectionHeader title="About you" />
        <TextField icon="scale-outline" placeholder="Weight (kg) *" keyboardType="numeric" value={weight} onChangeText={setWeight} />
        <TextField icon="calendar-outline" placeholder="Age" keyboardType="numeric" value={age} onChangeText={setAge} />
        <TextField icon="resize-outline" placeholder="Height (cm)" keyboardType="numeric" value={height} onChangeText={setHeight} />
        <Text style={styles.label}>GENDER</Text>
        <ChipGrid>
          {GENDERS.map((g) => (
            <Chip key={g} label={g} selected={gender === g.toLowerCase()} onPress={() => setGender(g.toLowerCase())} />
          ))}
        </ChipGrid>
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Fitness goal" />
        <ChipGrid>
          {FITNESS_GOALS.map((g) => (
            <Chip key={g.value} label={g.label} selected={goal === g.value} onPress={() => setGoal(g.value)} />
          ))}
        </ChipGrid>
      </GlassCard>

      <GlassCard>
        <SectionHeader eyebrow="Optional" title="Baseline measurements" />
        <TextField icon="body-outline" placeholder="Body fat %" keyboardType="numeric" value={bodyFat} onChangeText={setBodyFat} />
        <TextField icon="body-outline" placeholder="Muscle %" keyboardType="numeric" value={muscle} onChangeText={setMuscle} />
        <TextField icon="resize-outline" placeholder="Waist (cm)" keyboardType="numeric" value={waist} onChangeText={setWaist} />
        <TextField icon="resize-outline" placeholder="Chest (cm)" keyboardType="numeric" value={chest} onChangeText={setChest} />
        <TextField icon="resize-outline" placeholder="Hip (cm)" keyboardType="numeric" value={hip} onChangeText={setHip} />
        <TextField icon="resize-outline" placeholder="Arms (cm)" keyboardType="numeric" value={arms} onChangeText={setArms} />
        <TextField icon="resize-outline" placeholder="Thigh (cm)" keyboardType="numeric" value={thigh} onChangeText={setThigh} />
      </GlassCard>

      <GlassCard>
        <SectionHeader eyebrow="Optional" title="Medical info" />
        <TextInput
          style={styles.multilineInput}
          placeholder="Medical conditions"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={medicalConditions}
          onChangeText={setMedicalConditions}
          multiline
        />
        <TextInput
          style={styles.multilineInput}
          placeholder="Injuries"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={injuries}
          onChangeText={setInjuries}
          multiline
        />
        <TextInput
          style={styles.multilineInput}
          placeholder="Medications"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={medications}
          onChangeText={setMedications}
          multiline
        />
        <TextInput
          style={styles.multilineInput}
          placeholder="Exercise restrictions"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={exerciseRestrictions}
          onChangeText={setExerciseRestrictions}
          multiline
        />
      </GlassCard>

      {formError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {formError}
        </Text>
      )}

      <PrimaryButton size="lg" onPress={onSubmit} loading={submitting} disabled={!canSubmit}>
        Complete Assessment
      </PrimaryButton>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: 'rgba(255,255,255,0.5)' },
  multilineInput: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    padding: 14,
    color: '#FFFFFF',
    minHeight: 60,
    backgroundColor: Brand.charcoal2,
    borderRadius: Radius.md,
    textAlignVertical: 'top',
  },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
