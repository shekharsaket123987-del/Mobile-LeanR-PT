/**
 * Progress tab — LEANR_PT_NEXTGEN_APP_PRD.md §9.3, wired to real
 * progress_logs data. Measurement column names are VERIFY (see
 * src/lib/data/progress.ts) — confirm against the real schema before
 * this write path goes live for actual clients.
 */
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import { getProgressLogs, logProgress } from '@/lib/data/progress';
import { useAsync } from '@/lib/data/use-async';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ProgressScreen() {
  const { data: logs, loading, error, reload } = useAsync(getProgressLogs, []);
  const [weight, setWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const latest = logs?.[0] ?? null;

  const onSubmit = async () => {
    const weightKg = weight ? Number(weight) : undefined;
    if (weight && Number.isNaN(weightKg)) {
      Alert.alert('Enter a valid number');
      return;
    }
    setSubmitting(true);
    try {
      await logProgress({ weightKg });
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
          {latest ? (
            <Card>
              <Text style={shared.cardLabel}>LATEST — {formatDate(latest.logged_at)}</Text>
              <Text style={shared.bigStat}>{latest.weight_kg ?? '—'} kg</Text>
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

          <View style={[shared.ctaButton, submitting && { opacity: 0.7 }]}>
            <Text style={shared.ctaButtonText} onPress={submitting ? undefined : onSubmit}>
              {submitting ? 'Saving…' : "Log this week's update"}
            </Text>
          </View>
        </>
      )}
    </ScreenScaffold>
  );
}
