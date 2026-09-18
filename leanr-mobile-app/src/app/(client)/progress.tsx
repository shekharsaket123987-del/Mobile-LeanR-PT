/**
 * Progress — LEANR_PT_NEXTGEN_APP_PRD.md §9.3 / New PRD.md §4.A
 * `/client/progress`, wired to real `progress_logs` data. Relit for the
 * post-purchase light theme (mockup frame 13): a real weight-trend chart
 * (`MeasurementChart`, new — no charting library existed anywhere in
 * this app before this pass) plus metric/range filter chips.
 *
 * The mockup's Measurements/Photos segmented control is reproduced, but
 * "Photos" is shown disabled: `progress-photos` is a real Storage bucket
 * in the schema, but "schema-only, never referenced by any application
 * code" per New PRD.md §15 — no photo-progress feature exists even on
 * web, so wiring an upload here would be inventing functionality that
 * doesn't exist in the web app.
 *
 * NOT purchase-gated, on purpose (fixed 2026-09-14, see
 * app-gap-fix-plan.md GAP-01 / COM-001): the web app's own client-portal
 * spec (ClientPortal.md §5.5, §8 BR-15) requires progress logging to work
 * for ANY authenticated client, pre- or post-purchase — it is the explicit
 * prerequisite for clearing the measurement-staleness gate that blocks
 * free demo booking. A previous pass here mirrored `book-session.tsx`'s
 * purchase gate onto this screen too, which was backwards: it left a
 * brand-new prospect able to buy a paid plan outright but never able to
 * log the measurement needed to book a free demo. Do not re-add a
 * subscription check here.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/button';
import { MeasurementChart, type ChartPoint } from '@/components/ui/measurement-chart';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TextField } from '@/components/ui/text-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand, DisplayFont } from '@/constants/theme';
import { getProgressLogs, logProgress } from '@/lib/data/progress';
import type { ProgressLog } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short' });
}

function toNumber(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

type Metric = 'weight' | 'body_fat_pct' | 'muscle_pct' | 'waist';
const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'weight', label: 'Weight', unit: 'kg' },
  { key: 'body_fat_pct', label: 'Body Fat', unit: '%' },
  { key: 'muscle_pct', label: 'Muscle', unit: '%' },
  { key: 'waist', label: 'Waist', unit: 'in' },
];

type RangeKey = '3m' | '6m' | 'all';
const RANGES: { key: RangeKey; label: string; months: number | null }[] = [
  { key: '3m', label: 'Last 3 Months', months: 3 },
  { key: '6m', label: 'Last 6 Months', months: 6 },
  { key: 'all', label: 'All', months: null },
];

export default function ProgressScreen() {
  const { data: logs, loading, error, reload } = useAsync(getProgressLogs, []);
  const [tab, setTab] = useState<'measurements' | 'photos'>('measurements');
  const [metric, setMetric] = useState<Metric>('weight');
  const [range, setRange] = useState<RangeKey>('3m');

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

  const latest = logs?.[0] ?? null;
  const previous = logs?.[1] ?? null;
  const delta =
    latest && previous && latest[metric] != null && previous[metric] != null ? (latest[metric] as number) - (previous[metric] as number) : null;

  const chartPoints: ChartPoint[] = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    const rangeMonths = RANGES.find((r) => r.key === range)?.months ?? null;
    // Anchored to the latest log's own timestamp rather than Date.now() —
    // keeps this computation a pure function of `logs`/`range` alone.
    const anchor = new Date(logs[0].logged_at).getTime();
    const cutoff = rangeMonths ? anchor - rangeMonths * 30 * 24 * 60 * 60 * 1000 : null;
    const chronological = [...logs].reverse().filter((l: ProgressLog) => (cutoff ? new Date(l.logged_at).getTime() >= cutoff : true));
    return chronological
      .filter((l) => l[metric] != null)
      .map((l) => ({ label: formatMonth(l.logged_at), value: l[metric] as number }));
  }, [logs, metric, range]);

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
      setSubmitError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const unit = METRICS.find((m) => m.key === metric)?.unit ?? '';

  return (
    <ScreenScaffold title="Progress">
      <SegmentedControl
        options={[
          { key: 'measurements', label: 'Measurements' },
          { key: 'photos', label: 'Photos (soon)' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && tab === 'photos' && (
        <GlassCard>
          <EmptyState message="Progress photos aren't available yet — coming soon." icon="camera-outline" />
        </GlassCard>
      )}

      {!loading && !error && tab === 'measurements' && (
        <>
          <ChipGrid>
            {METRICS.map((m) => (
              <Chip key={m.key} label={m.label} selected={metric === m.key} onPress={() => setMetric(m.key)} />
            ))}
          </ChipGrid>
          <ChipGrid>
            {RANGES.map((r) => (
              <Chip key={r.key} label={r.label} selected={range === r.key} onPress={() => setRange(r.key)} />
            ))}
          </ChipGrid>

          {latest ? (
            <GlassCard>
              {delta != null && (
                <Text style={[styles.deltaValue, delta < 0 ? styles.deltaDown : styles.deltaUp]}>
                  {delta > 0 ? '+' : ''}
                  {delta.toFixed(1)} {unit}
                </Text>
              )}
              {chartPoints.length >= 2 ? (
                <MeasurementChart points={chartPoints} />
              ) : (
                <EmptyState message="Log a couple more weeks to see your trend." icon="trending-up-outline" />
              )}
              <View style={styles.latestRow}>
                <Text style={styles.latestLabel}>Latest Measurement</Text>
                <Text style={styles.latestValue}>
                  {formatDate(latest.logged_at)} · {latest[metric] ?? '—'} {unit}
                </Text>
              </View>
            </GlassCard>
          ) : (
            <EmptyState message="No progress logged yet." icon="trending-up-outline" />
          )}

          <GlassCard>
            <SectionHeader eyebrow="Weekly check-in" title="Log this week" />
            <TextField placeholder="Weight (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} />
            <TextField placeholder="Body fat %" keyboardType="numeric" value={bodyFat} onChangeText={setBodyFat} />
            <TextField placeholder="Muscle %" keyboardType="numeric" value={muscle} onChangeText={setMuscle} />
            {/* AUTH-006 fix: web spec has these as inches, not cm (BR-8 / ClientPortal.md §7.2). */}
            <TextField placeholder="Waist (in)" keyboardType="numeric" value={waist} onChangeText={setWaist} />
            <TextField placeholder="Chest (in)" keyboardType="numeric" value={chest} onChangeText={setChest} />
            <TextField placeholder="Hip (in)" keyboardType="numeric" value={hip} onChangeText={setHip} />
            <TextField placeholder="Arms (in)" keyboardType="numeric" value={arms} onChangeText={setArms} />
            <TextField placeholder="Thigh (in)" keyboardType="numeric" value={thigh} onChangeText={setThigh} />
          </GlassCard>

          {submitError && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {submitError}
            </Text>
          )}

          <PrimaryButton size="lg" onPress={onSubmit} loading={submitting}>
            Log New Measurement
          </PrimaryButton>
        </>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  deltaValue: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 30, letterSpacing: -0.5 },
  deltaDown: { color: Brand.yellow },
  deltaUp: { color: Brand.yellow },
  latestRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  latestLabel: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.45)' },
  latestValue: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#FFFFFF' },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
