/**
 * Progress tab — LEANR_PT_NEXTGEN_APP_PRD.md §9.3, wired to real
 * progress_logs data plus the real ProgressRing (§8/§14). Columns
 * confirmed against the real schema (weight/notes, no sessions_used
 * column — see src/lib/data/progress.ts and subscription.ts).
 */
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ProgressRing } from '@/components/progress-ring';
import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { PrimaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { DisplayFont } from '@/constants/theme';
import { getProgressLogs, logProgress } from '@/lib/data/progress';
import { getMySubscription, getSessionsUsedCount } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ProgressScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [logs, subscription] = await Promise.all([getProgressLogs(), getMySubscription()]);
    const sessionsUsed = subscription ? await getSessionsUsedCount(subscription.id) : 0;
    return { logs, subscription, sessionsUsed };
  }, []);
  const [weight, setWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { logs, subscription, sessionsUsed } = data ?? { logs: [], subscription: null, sessionsUsed: 0 };
  const latest = logs?.[0] ?? null;
  const total = subscription?.sessions_total ?? 0;
  const ringProgress = total > 0 ? sessionsUsed / total : 0;

  const onSubmit = async () => {
    const weightNum = weight ? Number(weight) : undefined;
    if (weight && Number.isNaN(weightNum)) {
      Alert.alert('Enter a valid number');
      return;
    }
    setSubmitting(true);
    try {
      await logProgress({ weight: weightNum });
      setWeight('');
      reload();
    } catch (err) {
      Alert.alert('Could not save update', err instanceof Error ? err.message : String(err));
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
            <TextField
              icon="scale-outline"
              placeholder="Weight (kg)"
              keyboardType="numeric"
              value={weight}
              onChangeText={setWeight}
            />
          </GlassCard>

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
});
