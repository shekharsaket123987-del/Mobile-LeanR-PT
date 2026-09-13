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

import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightMeasurementChart, type ChartPoint } from '@/components/light/light-measurement-chart';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightTextField } from '@/components/light/light-text-field';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getProgressLogs, logProgress } from '@/lib/data/progress';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

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
      <LightScreenScaffold title="Welcome Back">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }

  if (error) {
    return (
      <LightScreenScaffold title="Welcome Back">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Welcome Back" subtitle="Let's log a fresh baseline for your new plan.">
      <LightCard>
        <LightSectionHeader title="Your history" />
        {chartPoints.length >= 2 ? (
          <LightMeasurementChart points={chartPoints} />
        ) : (
          <LightEmptyState message="Not enough history yet to chart a trend." icon="trending-up-outline" />
        )}
      </LightCard>

      <LightCard>
        <LightSectionHeader eyebrow="New baseline" title="Log today's measurements" />
        <LightTextField placeholder="Weight (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} />
        <LightTextField placeholder="Body fat %" keyboardType="numeric" value={bodyFat} onChangeText={setBodyFat} />
        <LightTextField placeholder="Muscle %" keyboardType="numeric" value={muscle} onChangeText={setMuscle} />
        <LightTextField placeholder="Waist (cm)" keyboardType="numeric" value={waist} onChangeText={setWaist} />
        <LightTextField placeholder="Chest (cm)" keyboardType="numeric" value={chest} onChangeText={setChest} />
        <LightTextField placeholder="Hip (cm)" keyboardType="numeric" value={hip} onChangeText={setHip} />
        <LightTextField placeholder="Arms (cm)" keyboardType="numeric" value={arms} onChangeText={setArms} />
        <LightTextField placeholder="Thigh (cm)" keyboardType="numeric" value={thigh} onChangeText={setThigh} />
      </LightCard>

      {submitError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {submitError}
        </Text>
      )}

      <LightPrimaryButton size="lg" onPress={onSubmit} loading={submitting}>
        Continue
      </LightPrimaryButton>
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
});
