/**
 * Renewal Check-in — ClientPortal.md §4.0/§9 `renewal_checkin` journey
 * stage: shown once per renewal, only when this is not the client's
 * first-ever subscription AND no `progress_logs` row exists since the new
 * subscription's `activated_at`. Shows the full historical measurement
 * chart untouched plus a fresh-baseline entry form — this specific flow
 * bypasses the normal once-a-week self-log rate limit (`logProgress`'s
 * `skipWeeklyLimit`, already plumbed for exactly this use, previously
 * unused since this screen didn't exist yet).
 *
 * Stage-gated (`href: null`, no nav entry), same convention as
 * activate.tsx/onboarding.tsx — reached only via the journey-gate redirect
 * in index.tsx.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/button';
import { MeasurementChart, type ChartPoint } from '@/components/ui/measurement-chart';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { getProgressLogs, logProgress } from '@/lib/data/progress';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';
import { Brand } from '@/constants/theme';

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short' });
}

function toNumber(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export default function RenewalCheckinScreen() {
  const { data: logs, loading, error, reload } = useAsync(getProgressLogs, []);

  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [muscle, setMuscle] = useState('');
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [hip, setHip] = useState('');
  const [arms, setArms] = useState('');
  const [thigh, setThigh] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const chartPoints: ChartPoint[] = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    return [...logs]
      .reverse()
      .filter((l) => l.weight != null)
      .map((l) => ({ label: formatMonth(l.logged_at), value: l.weight as number }));
  }, [logs]);

  const onSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await logProgress(
        {
          weight: toNumber(weight),
          bodyFatPct: toNumber(bodyFat),
          musclePct: toNumber(muscle),
          waist: toNumber(waist),
          chest: toNumber(chest),
          hip: toNumber(hip),
          arms: toNumber(arms),
          thigh: toNumber(thigh),
        },
        { skipWeeklyLimit: true }
      );
      // Re-evaluate the journey stage from the home screen's own gate rather than guessing
      // whether renewal_scheduling or active comes next.
      router.replace('/(client)');
    } catch (err) {
      setSubmitError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ScreenScaffold title="Welcome Back">
        <LoadingState />
      </ScreenScaffold>
    );
  }

  if (error) {
    return (
      <ScreenScaffold title="Welcome Back">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Welcome Back" subtitle="Let's log a fresh baseline for your new plan.">
      <GlassCard>
        <SectionHeader title="Your history" />
        {chartPoints.length >= 2 ? (
          <MeasurementChart points={chartPoints} />
        ) : (
          <EmptyState message="Not enough history yet to chart a trend." icon="trending-up-outline" />
        )}
      </GlassCard>

      <GlassCard>
        <SectionHeader eyebrow="New baseline" title="Log today's measurements" />
        <TextField placeholder="Weight (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} />
        <TextField placeholder="Body fat %" keyboardType="numeric" value={bodyFat} onChangeText={setBodyFat} />
        <TextField placeholder="Muscle %" keyboardType="numeric" value={muscle} onChangeText={setMuscle} />
        <TextField placeholder="Waist (cm)" keyboardType="numeric" value={waist} onChangeText={setWaist} />
        <TextField placeholder="Chest (cm)" keyboardType="numeric" value={chest} onChangeText={setChest} />
        <TextField placeholder="Hip (cm)" keyboardType="numeric" value={hip} onChangeText={setHip} />
        <TextField placeholder="Arms (cm)" keyboardType="numeric" value={arms} onChangeText={setArms} />
        <TextField placeholder="Thigh (cm)" keyboardType="numeric" value={thigh} onChangeText={setThigh} />
      </GlassCard>

      {submitError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {submitError}
        </Text>
      )}

      <PrimaryButton size="lg" onPress={onSubmit} loading={submitting}>
        Continue
      </PrimaryButton>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
