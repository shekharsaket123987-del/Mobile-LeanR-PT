/**
 * Progress tab — LEANR_PT_NEXTGEN_APP_PRD.md §9.3, wired to real
 * progress_logs data plus the real ProgressRing (§8/§14). Columns
 * confirmed against the real schema (weight/notes, no sessions_used
 * column — see src/lib/data/progress.ts and subscription.ts).
 */
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import { ProgressRing } from '@/components/progress-ring';
import { CtaButton } from '@/components/tappable';
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
            <View style={{ alignItems: 'center', marginBottom: 4 }}>
              <ProgressRing progress={ringProgress} valueText={`${sessionsUsed}/${total}`} label="sessions this plan" />
            </View>
          )}

          {latest ? (
            <Card>
              <Text style={shared.cardLabel}>LATEST — {formatDate(latest.logged_at)}</Text>
              <Text style={shared.bigStat}>{latest.weight ?? '—'} kg</Text>
            </Card>
          ) : (
            <EmptyState message="No progress logged yet." />
          )}

          <Card>
            <Text style={shared.cardLabel}>LOG THIS WEEK</Text>
            <TextInput
              style={{
                fontFamily: 'Manrope_500Medium',
                fontSize: 16,
                paddingVertical: 8,
                color: Brand.charcoal2,
              }}
              placeholder="Weight (kg)"
              keyboardType="numeric"
              value={weight}
              onChangeText={setWeight}
            />
          </Card>

          <CtaButton onPress={onSubmit} loading={submitting}>
            Log this week&apos;s update
          </CtaButton>
        </>
      )}
    </ScreenScaffold>
  );
}
