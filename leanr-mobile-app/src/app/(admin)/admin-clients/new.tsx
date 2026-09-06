/**
 * Add Client (migration wizard) — New PRD.md §4.C "Screen: Add Client".
 * "Create an existing client's account directly — for migrating a
 * roster tracked outside LEANR mid-plan." Adapted to a single scrolling
 * form (3 cards) rather than a multi-step wizard — same fields/
 * validation as web (§16.D), just a mobile-appropriate layout.
 * Account creation needs the service-role key, so this calls the
 * `admin-provisioning` Edge Function rather than a direct table insert
 * (see admin-provisioning.ts header).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LightPrimaryButton, LightGhostButton } from '@/components/light/light-button';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightTextField } from '@/components/light/light-text-field';
import { LightBrand } from '@/constants/light-theme';
import { listAdminCoachOptions } from '@/lib/data/admin-clients';
import { createMigratedClient } from '@/lib/data/admin-provisioning';
import { getErrorMessage } from '@/lib/data/errors';
import { getMarketingPlans } from '@/lib/data/plans';
import { useAsync } from '@/lib/data/use-async';

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

export default function AdminAddClientScreen() {
  const { data: plans } = useAsync(getMarketingPlans, []);
  const { data: coaches } = useAsync(listAdminCoachOptions, []);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(randomPassword());
  const [packageId, setPackageId] = useState<string | null>(null);
  const [sessionsRemaining, setSessionsRemaining] = useState('');
  const [originalPlanSize, setOriginalPlanSize] = useState('');
  const [pauseDaysAllowed, setPauseDaysAllowed] = useState('');
  const [coachId, setCoachId] = useState<string | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [hour, setHour] = useState('6');
  const [durationMinutes] = useState(45);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ clientId: string } | null>(null);

  const selectedPlan = plans?.find((p) => p.id === packageId);
  const canSubmit = fullName.trim() && email.trim() && password.trim() && packageId && Number(sessionsRemaining) > 0;

  const onPackageSelect = (id: string, defaultSessions: number) => {
    setPackageId(id);
    setSessionsRemaining(String(defaultSessions));
  };

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await createMigratedClient({
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        email: email.trim(),
        password,
        packageId: packageId!,
        sessionsRemaining: Number(sessionsRemaining),
        originalPlanSize: originalPlanSize ? Number(originalPlanSize) : null,
        pauseDaysAllowed: pauseDaysAllowed ? Number(pauseDaysAllowed) : (selectedPlan as { default_pause_days?: number } | undefined)?.default_pause_days ?? 0,
        coachId,
        days,
        hour: days.length > 0 ? Number(hour) : null,
        durationMinutes,
      });
      setResult(res);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <LightScreenScaffold title="Client Created">
        <LightCard variant="teal" style={styles.card}>
          <Text style={styles.successTitle}>Account created</Text>
          <Text style={styles.successBody}>Share these one-time credentials with the client:</Text>
          <Text style={styles.credential}>Email: {email}</Text>
          <Text style={styles.credential}>Temporary Password: {password}</Text>
        </LightCard>
        <LightPrimaryButton onPress={() => router.replace({ pathname: '/admin-clients/[id]', params: { id: result.clientId } })}>View Client</LightPrimaryButton>
        <LightGhostButton onPress={() => router.replace('/admin-clients/new')}>Add Another Client</LightGhostButton>
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Add Client" subtitle="Migrate an existing client's account directly">
      <LightCard style={styles.card}>
        <LightSectionHeader title="Identity" />
        <LightTextField placeholder="Full Name" value={fullName} onChangeText={setFullName} accessibilityLabel="Full name" />
        <LightTextField placeholder="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel="Phone" />
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
        <LightSectionHeader title="Plan" />
        <LightChipGrid>
          {plans?.map((p) => (
            <LightChip key={p.id} label={p.name} selected={packageId === p.id} onPress={() => onPackageSelect(p.id, p.sessions_count)} />
          ))}
        </LightChipGrid>
        <LightTextField
          keyboardType="number-pad"
          placeholder="Sessions Remaining"
          value={sessionsRemaining}
          onChangeText={setSessionsRemaining}
          accessibilityLabel="Sessions remaining"
        />
        <LightTextField
          keyboardType="number-pad"
          placeholder="Original Plan Size (optional)"
          value={originalPlanSize}
          onChangeText={setOriginalPlanSize}
          accessibilityLabel="Original plan size"
        />
        <LightTextField
          keyboardType="number-pad"
          placeholder="Pause Days Allowed"
          value={pauseDaysAllowed}
          onChangeText={setPauseDaysAllowed}
          accessibilityLabel="Pause days allowed"
        />
      </LightCard>

      <LightCard style={styles.card}>
        <LightSectionHeader title="Coach & Weekly Schedule" eyebrow="OPTIONAL" />
        <LightChipGrid>
          {coaches?.map((c) => (
            <LightChip key={c.id} label={c.full_name} selected={coachId === c.id} onPress={() => setCoachId(coachId === c.id ? null : c.id)} />
          ))}
        </LightChipGrid>
        <LightTextField keyboardType="number-pad" placeholder="Hour (0-23, IST)" value={hour} onChangeText={setHour} accessibilityLabel="Hour" />
        <LightChipGrid>
          {DAYS.map((d) => (
            <LightChip key={d.key} label={d.label} selected={days.includes(d.key)} onPress={() => toggleDay(d.key)} />
          ))}
        </LightChipGrid>
      </LightCard>

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <LightPrimaryButton size="lg" loading={submitting} disabled={!canSubmit} onPress={onSubmit}>
        Create Client
      </LightPrimaryButton>
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordField: { flex: 1 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.alertRed },
  successTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: LightBrand.tealDark },
  successBody: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textSecondary },
  credential: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.navy },
});
