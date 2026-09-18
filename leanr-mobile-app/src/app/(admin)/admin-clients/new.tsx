/**
 * Add Client (migration wizard) — New PRD.md §4.C "Screen: Add Client".
 * "Create an existing client's account directly — for migrating a
 * roster tracked outside LEANR mid-plan." Adapted to a single scrolling
 * form (3 cards) rather than a multi-step wizard — same fields/
 * validation as web (§16.D), just a mobile-appropriate layout.
 * Account creation needs the service-role key, so this calls the
 * `admin-provisioning` Edge Function rather than a direct table insert
 * (see admin-provisioning.ts header).
 *
 * Plan list: `listAllPackages` (unfiltered `package_tiers`), NOT the
 * public/marketing `getMarketingPlans` (is_active-only) — web's
 * `listPackageOptionsAction` deliberately includes archived plans too,
 * since a migrated client may be mid-plan on a since-retired package
 * (see admin-clients.actions.ts:321-324 on web). Availability check:
 * `checkSlotAvailability` ports web's `checkAdminSlotAssignment` 1:1 —
 * web gates Create Client on a confirmed-available schedule before
 * submit (AddClientForm.tsx `canSubmit`/`scheduleConfirmed`); this was
 * previously missing here entirely (no check existed anywhere in the
 * mobile app), so an admin could double-book a coach with no warning.
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
import { checkSlotAvailability, listAdminCoachOptions, type AdminSlotCheckResult } from '@/lib/data/admin-clients';
import { createMigratedClient } from '@/lib/data/admin-provisioning';
import { listAllPackages } from '@/lib/data/admin-settings';
import { getErrorMessage } from '@/lib/data/errors';
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

// Matches web's AddClientForm.tsx HOUR_GRID exactly — hardcoded 5am-9pm
// picker, independent of the live system_settings booking window (which
// only feeds the "alternative times" suggestions after a failed check).
const HOUR_GRID = Array.from({ length: 17 }, (_, i) => i + 5);

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period}`;
}

function slotSignature(coachId: string | null, days: number[], timeOfDay: string): string {
  return `${coachId ?? ''}|${[...days].sort().join(',')}|${timeOfDay}`;
}

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AdminAddClientScreen() {
  const { data: plans } = useAsync(listAllPackages, []);
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
  const [durationMinutes] = useState(60);

  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<AdminSlotCheckResult | null>(null);
  const [checkedSignature, setCheckedSignature] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ clientId: string } | null>(null);

  const selectedPlan = plans?.find((p) => p.id === packageId);
  const timeOfDay = `${hour.padStart(2, '0')}:00`;
  const wantsSchedule = days.length > 0;
  const currentSignature = slotSignature(coachId, days, timeOfDay);
  const scheduleConfirmed = !wantsSchedule || (checkedSignature === currentSignature && checkResult?.available === true);
  const canSubmit =
    fullName.trim() && email.trim() && password.trim() && packageId && Number(sessionsRemaining) > 0 && scheduleConfirmed && !submitting;

  const onPackageSelect = (id: string, defaultSessions: number) => {
    setPackageId(id);
    setSessionsRemaining(String(defaultSessions));
  };

  const resetCheck = () => {
    setCheckResult(null);
    setCheckedSignature(null);
  };

  const toggleDay = (d: number) => {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
    resetCheck();
  };
  const onCoachSelect = (id: string) => {
    setCoachId(coachId === id ? null : id);
    resetCheck();
  };
  const onHourChange = (h: string) => {
    setHour(h);
    resetCheck();
  };

  const checkAvailability = async () => {
    if (!coachId || days.length === 0) return;
    setChecking(true);
    setError(null);
    try {
      const res = await checkSlotAvailability({ coachId, days, timeOfDay });
      setCheckResult(res);
      setCheckedSignature(slotSignature(coachId, days, timeOfDay));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setChecking(false);
    }
  };

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
        pauseDaysAllowed: pauseDaysAllowed ? Number(pauseDaysAllowed) : selectedPlan?.default_pause_days ?? 0,
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
      <ScreenScaffold title="Client Created">
        <GlassCard variant="yellow" style={styles.card}>
          <Text style={styles.successTitle}>Account created</Text>
          <Text style={styles.successBody}>Share these one-time credentials with the client:</Text>
          <Text style={styles.credential}>Email: {email}</Text>
          <Text style={styles.credential}>Temporary Password: {password}</Text>
        </GlassCard>
        <PrimaryButton onPress={() => router.replace({ pathname: '/admin-clients/[id]', params: { id: result.clientId } })}>View Client</PrimaryButton>
        <GhostButton onPress={() => router.replace('/admin-clients/new')}>Add Another Client</GhostButton>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Add Client" subtitle="Migrate an existing client's account directly">
      <GlassCard style={styles.card}>
        <SectionHeader title="Identity" />
        <TextField placeholder="Full Name" value={fullName} onChangeText={setFullName} accessibilityLabel="Full name" />
        <TextField placeholder="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel="Phone" />
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
        <SectionHeader title="Plan" />
        <ChipGrid>
          {plans?.map((p) => (
            <Chip key={p.id} label={p.name} selected={packageId === p.id} onPress={() => onPackageSelect(p.id, p.sessions_count)} />
          ))}
        </ChipGrid>
        <TextField
          keyboardType="number-pad"
          placeholder="Sessions Remaining"
          value={sessionsRemaining}
          onChangeText={setSessionsRemaining}
          accessibilityLabel="Sessions remaining"
        />
        <TextField
          keyboardType="number-pad"
          placeholder="Original Plan Size (optional)"
          value={originalPlanSize}
          onChangeText={setOriginalPlanSize}
          accessibilityLabel="Original plan size"
        />
        <TextField
          keyboardType="number-pad"
          placeholder="Pause Days Allowed"
          value={pauseDaysAllowed}
          onChangeText={setPauseDaysAllowed}
          accessibilityLabel="Pause days allowed"
        />
      </GlassCard>

      <GlassCard style={styles.card}>
        <SectionHeader title="Coach & Weekly Schedule" eyebrow="OPTIONAL" />
        <Text style={styles.hint}>Leave no days selected to create the client without a schedule yet. Pick days and a time, then confirm the coach is free before creating.</Text>
        <ChipGrid>
          {coaches?.map((c) => (
            <Chip key={c.id} label={c.full_name} selected={coachId === c.id} onPress={() => onCoachSelect(c.id)} />
          ))}
        </ChipGrid>
        <ChipGrid>
          {HOUR_GRID.map((h) => (
            <Chip key={h} label={formatHour(h)} selected={hour === String(h)} onPress={() => onHourChange(String(h))} />
          ))}
        </ChipGrid>
        <ChipGrid>
          {DAYS.map((d) => (
            <Chip key={d.key} label={d.label} selected={days.includes(d.key)} onPress={() => toggleDay(d.key)} />
          ))}
        </ChipGrid>

        {wantsSchedule && (
          <View style={styles.availabilityBlock}>
            <SecondaryButton size="sm" loading={checking} disabled={!coachId} onPress={checkAvailability}>
              Check Availability
            </SecondaryButton>

            {checkedSignature === currentSignature && checkResult && (
              <View style={[styles.resultBox, checkResult.available ? styles.resultOk : styles.resultBad]}>
                {checkResult.available ? (
                  <Text style={styles.resultOkText}>This coach is free for every selected day at this time.</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    <Text style={styles.resultBadText}>That coach isn&apos;t free for all selected days at this time.</Text>
                    {checkResult.alternativeTimesForSameCoach.length > 0 && (
                      <View>
                        <Text style={styles.altLabel}>Other times with this coach</Text>
                        <ChipGrid>
                          {checkResult.alternativeTimesForSameCoach.map((t) => (
                            <Chip key={t} label={formatHour(Number(t.slice(0, 2)))} selected={false} onPress={() => onHourChange(String(Number(t.slice(0, 2))))} />
                          ))}
                        </ChipGrid>
                      </View>
                    )}
                    {checkResult.alternativeCoaches.length > 0 && (
                      <View>
                        <Text style={styles.altLabel}>Other coaches free at this same day/time</Text>
                        <ChipGrid>
                          {checkResult.alternativeCoaches.map((c) => (
                            <Chip key={c.coachId} label={c.name} selected={false} onPress={() => onCoachSelect(c.coachId)} />
                          ))}
                        </ChipGrid>
                      </View>
                    )}
                    {checkResult.alternativeTimesForSameCoach.length === 0 && checkResult.alternativeCoaches.length === 0 && (
                      <Text style={styles.altLabel}>No open alternative found for this day pattern — try a different day.</Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </GlassCard>

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <PrimaryButton size="lg" loading={submitting} disabled={!canSubmit} onPress={onSubmit}>
        Create Client
      </PrimaryButton>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordField: { flex: 1 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: Brand.alertRed },
  successTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: Brand.yellow },
  successBody: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
  credential: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#FFFFFF' },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' },
  availabilityBlock: { gap: 8, marginTop: 4 },
  resultBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  resultOk: { borderColor: Brand.successEmerald, backgroundColor: 'rgba(16,185,129,0.06)' },
  resultBad: { borderColor: Brand.alertRed, backgroundColor: 'rgba(239,68,68,0.05)' },
  resultOkText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: Brand.yellow },
  resultBadText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: Brand.alertRed },
  altLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 6 },
});
