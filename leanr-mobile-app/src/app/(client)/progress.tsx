/**
 * Progress tab — LEANR_PT_NEXTGEN_APP_PRD.md §9.3, wired to real
 * progress_logs data plus the real ProgressRing (§8/§14). Columns
 * confirmed against the real schema (weight/notes, no sessions_used
 * column — see src/lib/data/progress.ts and subscription.ts).
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ProgressRing } from '@/components/progress-ring';
import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { PrimaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { Brand, DisplayFont } from '@/constants/theme';
import { getProgressLogs, logProgress } from '@/lib/data/progress';
import { getMySubscription, getSessionsUsedCount } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toNumber(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export default function ProgressScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [logs, subscription] = await Promise.all([getProgressLogs(), getMySubscription()]);
    const sessionsUsed = subscription ? await getSessionsUsedCount(subscription.id) : 0;
    return { logs, subscription, sessionsUsed };
  }, []);
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

  const { logs, subscription, sessionsUsed } = data ?? { logs: [], subscription: null, sessionsUsed: 0 };
  const latest = logs?.[0] ?? null;
  const total = subscription?.sessions_total ?? 0;
  const ringProgress = total > 0 ? sessionsUsed / total : 0;

  const onSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await logProgress({
        weight: toNumber(weight),
        bodyFatPct: toNumber(bodyFat),
        musclePct: toNumber(muscle),
        waist: toNumber(waist),
        chest: toNumber(chest),
        hip: toNumber(hip),
        arms: toNumber(arms),
        thigh: toNumber(thigh),
      });
      setWeight('');
      setBodyFat('');
      setMuscle('');
      setWaist('');
      setChest('');
      setHip('');
      setArms('');
      setThigh('');
      reload();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenScaffold title="Your Progress">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          {subscription && (
            <View style={styles.ringWrap}>
              <ProgressRing progress={ringProgress} valueText={`${sessionsUsed}/${total}`} label="sessions this plan" size={190} strokeWidth={16} />
            </View>
          )}

          {latest ? (
            <GlassCard variant="yellow">
              <Text style={styles.eyebrow}>LATEST — {formatDate(latest.logged_at)}</Text>
              <Text style={styles.weightValue}>{latest.weight ?? '—'} kg</Text>
            </GlassCard>
          ) : (
            <EmptyState message="No progress logged yet." icon="trending-up-outline" />
          )}

          <GlassCard>
            <SectionHeader eyebrow="Weekly check-in" title="Log this week" />
            <TextField icon="scale-outline" placeholder="Weight (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} />
            <TextField icon="body-outline" placeholder="Body fat %" keyboardType="numeric" value={bodyFat} onChangeText={setBodyFat} />
            <TextField icon="body-outline" placeholder="Muscle %" keyboardType="numeric" value={muscle} onChangeText={setMuscle} />
            <TextField icon="resize-outline" placeholder="Waist (cm)" keyboardType="numeric" value={waist} onChangeText={setWaist} />
            <TextField icon="resize-outline" placeholder="Chest (cm)" keyboardType="numeric" value={chest} onChangeText={setChest} />
            <TextField icon="resize-outline" placeholder="Hip (cm)" keyboardType="numeric" value={hip} onChangeText={setHip} />
            <TextField icon="resize-outline" placeholder="Arms (cm)" keyboardType="numeric" value={arms} onChangeText={setArms} />
            <TextField icon="resize-outline" placeholder="Thigh (cm)" keyboardType="numeric" value={thigh} onChangeText={setThigh} />
          </GlassCard>

          {submitError && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {submitError}
            </Text>
          )}

          <PrimaryButton size="lg" onPress={onSubmit} loading={submitting}>
            Log this week&apos;s update
          </PrimaryButton>
        </>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  ringWrap: { alignItems: 'center', marginBottom: 4, marginTop: 4 },
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: 'rgba(255,255,255,0.55)' },
  weightValue: {
    fontFamily: DisplayFont,
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 40,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
