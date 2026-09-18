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

import { PrimaryButton, GhostButton, SecondaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { Brand } from '@/constants/theme';
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
      <ScreenScaffold title="Coach Created">
        <GlassCard variant="yellow" style={styles.card}>
          <Text style={styles.successTitle}>Account created</Text>
          <Text style={styles.successBody}>Share these one-time credentials with the coach:</Text>
          <Text style={styles.credential}>Email: {email}</Text>
          <Text style={styles.credential}>Temporary Password: {password}</Text>
        </GlassCard>
        <PrimaryButton onPress={() => router.replace({ pathname: '/coaches/[id]', params: { id: result.coachId } })}>Back to Coaches</PrimaryButton>
        <GhostButton onPress={resetForm}>Add Another Coach</GhostButton>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Add Coach">
      <GlassCard style={styles.card}>
        <SectionHeader title="Identity" />
        <TextField placeholder="Full Name" value={fullName} onChangeText={setFullName} accessibilityLabel="Full name" />
        <TextField placeholder="Employee Code" value={employeeCode} onChangeText={setEmployeeCode} accessibilityLabel="Employee code" />
        <TextField placeholder="Login Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Login email" />
        <View style={styles.passwordRow}>
          <View style={styles.passwordField}>
            <TextField placeholder="Temporary Password" value={password} onChangeText={setPassword} accessibilityLabel="Temporary password" />
          </View>
          <GhostButton size="sm" onPress={() => setPassword(randomPassword())}>
            Shuffle
          </GhostButton>
        </View>
      </GlassCard>

      <GlassCard style={styles.card}>
        <SectionHeader title="Skills" />
        <Text style={styles.fieldLabel}>Primary Specialization</Text>
        <ChipGrid>
          {COACH_SKILLS.map((s) => (
            <Chip key={s} label={s} selected={specialization === s} onPress={() => setSpecialization(s)} />
          ))}
        </ChipGrid>
        <Text style={styles.fieldLabel}>Additional Skills</Text>
        <ChipGrid>
          {COACH_SKILLS.filter((s) => s !== specialization).map((s) => (
            <Chip key={s} label={s} selected={additionalSkills.includes(s)} onPress={() => toggleAdditionalSkill(s)} />
          ))}
        </ChipGrid>
      </GlassCard>

      <GlassCard style={styles.card}>
        <SectionHeader title="Languages" eyebrow="REQUIRED · AT LEAST ONE" />
        <ChipGrid>
          {COACH_LANGUAGES.map((lang) => (
            <Chip key={lang} label={lang} selected={languages.includes(lang)} onPress={() => toggleLanguage(lang)} />
          ))}
        </ChipGrid>
      </GlassCard>

      <GlassCard style={styles.card}>
        <SectionHeader title="Weekly Slot Openings" eyebrow="REQUIRED · AT LEAST ONE" />
        {slots.map((s, i) => (
          <View key={i} style={styles.slotRow}>
            <ChipGrid>
              {HOUR_OPTIONS.map((h) => (
                <Chip
                  key={h}
                  label={formatHour(h)}
                  selected={s.hour === h}
                  onPress={() => setSlots((cur) => cur.map((x, idx) => (idx === i ? { ...x, hour: h } : x)))}
                />
              ))}
            </ChipGrid>
            <ChipGrid>
              {DAYS.map((d) => (
                <Chip key={d.key} label={d.label} selected={s.days.includes(d.key)} onPress={() => toggleSlotDay(i, d.key)} />
              ))}
            </ChipGrid>
            {slots.length > 1 && (
              <GhostButton size="sm" onPress={() => setSlots((cur) => cur.filter((_, idx) => idx !== i))}>
                Remove Slot
              </GhostButton>
            )}
          </View>
        ))}
        <SecondaryButton onPress={() => setSlots((cur) => [...cur, { days: [], hour: HOUR_OPTIONS[0] }])}>Add Slot</SecondaryButton>
      </GlassCard>

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <PrimaryButton size="lg" loading={submitting} disabled={!canSubmit} onPress={onSubmit}>
        Create Coach
      </PrimaryButton>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordField: { flex: 1 },
  fieldLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  slotRow: { gap: 8, marginBottom: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: Brand.alertRed },
  successTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: Brand.yellow },
  successBody: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
  credential: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#FFFFFF' },
});
