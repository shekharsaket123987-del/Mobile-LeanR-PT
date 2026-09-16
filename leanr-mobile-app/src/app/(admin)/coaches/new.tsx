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
import { COACH_LANGUAGES, COACH_SKILLS } from '@/lib/constants/coach-tags';
import { createCoach, type CreateCoachInput } from '@/lib/data/admin-provisioning';
import { getErrorMessage } from '@/lib/data/errors';

const DAYS = [
  { key: 1, label: 'Mon' },
  { key: 2, label: 'Tue' },
  { key: 3, label: 'Wed' },
  { key: 4, label: 'Thu' },
  { key: 5, label: 'Fri' },
  { key: 6, label: 'Sat' },
  { key: 0, label: 'Sun' },
];
// 5am-9pm, matches web's admin/coaches/new/page.tsx HOUR_GRID and the
// booking_window_* settings the resulting slots must fall inside.
const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => i + 5);

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period}`;
}

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

type SlotRow = { days: number[]; hour: number };

export default function AdminAddCoachScreen() {
  const [fullName, setFullName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(randomPassword());
  const [specialization, setSpecialization] = useState<string>(COACH_SKILLS[0]);
  const [additionalSkills, setAdditionalSkills] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([{ days: [], hour: HOUR_OPTIONS[0] }]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ coachId: string } | null>(null);

  const toggleAdditionalSkill = (skill: string) => setAdditionalSkills((cur) => (cur.includes(skill) ? cur.filter((s) => s !== skill) : [...cur, skill]));
  const toggleLanguage = (lang: string) => setLanguages((cur) => (cur.includes(lang) ? cur.filter((l) => l !== lang) : [...cur, lang]));
  const toggleSlotDay = (i: number, d: number) =>
    setSlots((cur) => cur.map((s, idx) => (idx === i ? { ...s, days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d] } : s)));

  const hasValidSlot = slots.some((s) => s.days.length > 0);
  const canSubmit = fullName.trim() && employeeCode.trim() && email.trim() && password.trim() && specialization.trim() && languages.length > 0 && hasValidSlot;

  const resetForm = () => {
    setFullName('');
    setEmployeeCode('');
    setEmail('');
    setPassword(randomPassword());
    setSpecialization(COACH_SKILLS[0]);
    setAdditionalSkills([]);
    setLanguages([]);
    setSlots([{ days: [], hour: HOUR_OPTIONS[0] }]);
    setError(null);
    setResult(null);
  };

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
        slots: slots.filter((s) => s.days.length > 0).map((s) => ({ days: s.days, hour: s.hour, durationMinutes: 60 })),
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
        <LightGhostButton onPress={resetForm}>Add Another Coach</LightGhostButton>
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
        <Text style={styles.fieldLabel}>Primary Specialization</Text>
        <LightChipGrid>
          {COACH_SKILLS.map((s) => (
            <LightChip key={s} label={s} selected={specialization === s} onPress={() => setSpecialization(s)} />
          ))}
        </LightChipGrid>
        <Text style={styles.fieldLabel}>Additional Skills</Text>
        <LightChipGrid>
          {COACH_SKILLS.filter((s) => s !== specialization).map((s) => (
            <LightChip key={s} label={s} selected={additionalSkills.includes(s)} onPress={() => toggleAdditionalSkill(s)} />
          ))}
        </LightChipGrid>
      </LightCard>

      <LightCard style={styles.card}>
        <LightSectionHeader title="Languages" eyebrow="REQUIRED · AT LEAST ONE" />
        <LightChipGrid>
          {COACH_LANGUAGES.map((lang) => (
            <LightChip key={lang} label={lang} selected={languages.includes(lang)} onPress={() => toggleLanguage(lang)} />
          ))}
        </LightChipGrid>
      </LightCard>

      <LightCard style={styles.card}>
        <LightSectionHeader title="Weekly Slot Openings" eyebrow="REQUIRED · AT LEAST ONE" />
        {slots.map((s, i) => (
          <View key={i} style={styles.slotRow}>
            <LightChipGrid>
              {HOUR_OPTIONS.map((h) => (
                <LightChip
                  key={h}
                  label={formatHour(h)}
                  selected={s.hour === h}
                  onPress={() => setSlots((cur) => cur.map((x, idx) => (idx === i ? { ...x, hour: h } : x)))}
                />
              ))}
            </LightChipGrid>
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
        <LightSecondaryButton onPress={() => setSlots((cur) => [...cur, { days: [], hour: HOUR_OPTIONS[0] }])}>Add Slot</LightSecondaryButton>
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
  fieldLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: LightBrand.textMuted, marginTop: 4 },
  slotRow: { gap: 8, marginBottom: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.alertRed },
  successTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: LightBrand.tealDark },
  successBody: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textSecondary },
  credential: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.navy },
});
