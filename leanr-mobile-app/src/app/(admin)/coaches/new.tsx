/**
 * Add Coach — New PRD.md §4.C "Screen: Add Coach". Identity, Skills,
 * Languages (required, ≥1), Weekly Slot Openings (repeatable time+day
 * rows, ≥1 valid row required). Account creation needs the service-role
 * key, so this calls the `admin-provisioning` Edge Function (see
 * admin-provisioning.ts header).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LightPrimaryButton, LightGhostButton, LightSecondaryButton } from '@/components/light/light-button';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightTextField } from '@/components/light/light-text-field';
import { LightBrand } from '@/constants/light-theme';
import { createCoach, type CreateCoachInput } from '@/lib/data/admin-provisioning';
import { getErrorMessage } from '@/lib/data/errors';

const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Bengali'];
const DAYS = [
  { key: 1, label: 'Mon' },
  { key: 2, label: 'Tue' },
  { key: 3, label: 'Wed' },
  { key: 4, label: 'Thu' },
  { key: 5, label: 'Fri' },
  { key: 6, label: 'Sat' },
  { key: 0, label: 'Sun' },
];

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

type SlotRow = { days: number[]; hour: string };

export default function AdminAddCoachScreen() {
  const [fullName, setFullName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(randomPassword());
  const [specialization, setSpecialization] = useState('');
  const [additionalSkills, setAdditionalSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([{ days: [], hour: '6' }]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ coachId: string } | null>(null);

  const toggleLanguage = (lang: string) => setLanguages((cur) => (cur.includes(lang) ? cur.filter((l) => l !== lang) : [...cur, lang]));
  const toggleSlotDay = (i: number, d: number) =>
    setSlots((cur) => cur.map((s, idx) => (idx === i ? { ...s, days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d] } : s)));

  const hasValidSlot = slots.some((s) => s.days.length > 0);
  const canSubmit = fullName.trim() && employeeCode.trim() && email.trim() && password.trim() && specialization.trim() && languages.length > 0 && hasValidSlot;

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateCoachInput = {
        fullName: fullName.trim(),
        employeeCode: employeeCode.trim(),
        email: email.trim(),
        password,
        specialization: specialization.trim(),
        additionalSkills,
        languages,
        slots: slots.filter((s) => s.days.length > 0).map((s) => ({ days: s.days, hour: Number(s.hour) || 0, durationMinutes: 45 })),
      };
      setResult(await createCoach(input));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <LightScreenScaffold title="Coach Created">
        <LightCard variant="teal" style={styles.card}>
          <Text style={styles.successTitle}>Account created</Text>
          <Text style={styles.successBody}>Share these one-time credentials with the coach:</Text>
          <Text style={styles.credential}>Email: {email}</Text>
          <Text style={styles.credential}>Temporary Password: {password}</Text>
        </LightCard>
        <LightPrimaryButton onPress={() => router.replace({ pathname: '/coaches/[id]', params: { id: result.coachId } })}>Back to Coaches</LightPrimaryButton>
        <LightGhostButton onPress={() => router.replace('/coaches/new')}>Add Another Coach</LightGhostButton>
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Add Coach">
      <LightCard style={styles.card}>
        <LightSectionHeader title="Identity" />
        <LightTextField placeholder="Full Name" value={fullName} onChangeText={setFullName} accessibilityLabel="Full name" />
        <LightTextField placeholder="Employee Code" value={employeeCode} onChangeText={setEmployeeCode} accessibilityLabel="Employee code" />
        <LightTextField placeholder="Login Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Login email" />
        <View style={styles.passwordRow}>
          <View style={styles.passwordField}>
            <LightTextField placeholder="Temporary Password" value={password} onChangeText={setPassword} accessibilityLabel="Temporary password" />
          </View>
          <LightGhostButton size="sm" onPress={() => setPassword(randomPassword())}>
            Shuffle
          </LightGhostButton>
        </View>
      </LightCard>

      <LightCard style={styles.card}>
        <LightSectionHeader title="Skills" />
        <LightTextField placeholder="Primary Specialization" value={specialization} onChangeText={setSpecialization} accessibilityLabel="Primary specialization" />
        <LightChipGrid>
          {additionalSkills.map((s) => (
            <LightChip key={s} label={`${s} ✕`} selected onPress={() => setAdditionalSkills(additionalSkills.filter((x) => x !== s))} />
          ))}
        </LightChipGrid>
        <View style={styles.addSkillRow}>
          <View style={styles.passwordField}>
            <LightTextField placeholder="Add additional skill" value={newSkill} onChangeText={setNewSkill} accessibilityLabel="Add additional skill" />
          </View>
          <LightSecondaryButton
            size="sm"
            disabled={!newSkill.trim()}
            onPress={() => {
              setAdditionalSkills([...additionalSkills, newSkill.trim()]);
              setNewSkill('');
            }}>
            Add
          </LightSecondaryButton>
        </View>
      </LightCard>

      <LightCard style={styles.card}>
        <LightSectionHeader title="Languages" eyebrow="REQUIRED · AT LEAST ONE" />
        <LightChipGrid>
          {LANGUAGE_OPTIONS.map((lang) => (
            <LightChip key={lang} label={lang} selected={languages.includes(lang)} onPress={() => toggleLanguage(lang)} />
          ))}
        </LightChipGrid>
      </LightCard>

      <LightCard style={styles.card}>
        <LightSectionHeader title="Weekly Slot Openings" eyebrow="REQUIRED · AT LEAST ONE" />
        {slots.map((s, i) => (
          <View key={i} style={styles.slotRow}>
            <LightTextField
              keyboardType="number-pad"
              placeholder="Hour (0-23, IST)"
              value={s.hour}
              onChangeText={(t) => setSlots((cur) => cur.map((x, idx) => (idx === i ? { ...x, hour: t } : x)))}
              accessibilityLabel={`Slot ${i + 1} hour`}
            />
            <LightChipGrid>
              {DAYS.map((d) => (
                <LightChip key={d.key} label={d.label} selected={s.days.includes(d.key)} onPress={() => toggleSlotDay(i, d.key)} />
              ))}
            </LightChipGrid>
            {slots.length > 1 && (
              <LightGhostButton size="sm" onPress={() => setSlots((cur) => cur.filter((_, idx) => idx !== i))}>
                Remove Slot
              </LightGhostButton>
            )}
          </View>
        ))}
        <LightSecondaryButton onPress={() => setSlots((cur) => [...cur, { days: [], hour: '6' }])}>Add Slot</LightSecondaryButton>
      </LightCard>

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <LightPrimaryButton size="lg" loading={submitting} disabled={!canSubmit} onPress={onSubmit}>
        Create Coach
      </LightPrimaryButton>
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordField: { flex: 1 },
  addSkillRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotRow: { gap: 8, marginBottom: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.alertRed },
  successTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: LightBrand.tealDark },
  successBody: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textSecondary },
  credential: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.navy },
});
