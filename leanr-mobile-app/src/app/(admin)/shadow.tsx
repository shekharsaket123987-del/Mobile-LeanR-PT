/**
 * Shadow Coverage (admin) — LEANR_PT_MOBILE_PRD.md §10 "Assign Shadow
 * Coach" flow. See src/lib/data/admin-shadow.ts header for how
 * "uncovered leave-affected sessions" is computed and for the confirmed
 * `assign_shadow_coach` RPC behavior (reassigns the affected bookings
 * directly, not just a record).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton } from '@/components/tappable';
import { Brand, Colors } from '@/constants/theme';
import { assignShadowCoach, getActiveCoachOptions, getShadowCoverageGaps, type ShadowGap } from '@/lib/data/admin-shadow';
import { useAsync } from '@/lib/data/use-async';

export default function AdminShadowScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [gaps, coaches] = await Promise.all([getShadowCoverageGaps(), getActiveCoachOptions()]);
    return { gaps, coaches };
  }, []);

  const gaps = data?.gaps ?? [];
  const coaches = data?.coaches ?? [];

  return (
    <ScreenScaffold title="Shadow Coverage" subtitle="Clients with sessions during approved leave, not yet covered">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && gaps.length === 0 && <EmptyState message="No coverage gaps right now." />}
      {!loading &&
        !error &&
        gaps.map((gap) => (
          <GapCard key={`${gap.leaveId}-${gap.clientId}`} gap={gap} coaches={coaches} onAssigned={reload} />
        ))}
    </ScreenScaffold>
  );
}

function GapCard({
  gap,
  coaches,
  onAssigned,
}: {
  gap: ShadowGap;
  coaches: { id: string; full_name: string }[];
  onAssigned: () => void;
}) {
  const [selectedCoach, setSelectedCoach] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = coaches.filter((c) => c.id !== gap.primaryCoachId);

  const onAssign = async () => {
    if (!selectedCoach) return;
    setAssigning(true);
    setError(null);
    try {
      await assignShadowCoach({
        clientId: gap.clientId,
        primaryCoachId: gap.primaryCoachId,
        shadowCoachId: selectedCoach,
        startsOn: gap.startsOn,
        endsOn: gap.endsOn,
        reason: `Coverage for ${gap.primaryCoachName}'s leave`,
      });
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Card>
      <Text style={shared.bigStat}>{gap.clientName}</Text>
      <Text style={shared.cardLabel}>
        {gap.affectedSessions} session{gap.affectedSessions === 1 ? '' : 's'} with {gap.primaryCoachName}, {gap.startsOn}
        {gap.endsOn !== gap.startsOn ? ` – ${gap.endsOn}` : ''}
      </Text>

      <Text style={shared.cardLabel}>ASSIGN SHADOW COACH</Text>
      <View style={styles.chipRow}>
        {candidates.map((c) => (
          <Chip key={c.id} label={c.full_name} selected={selectedCoach === c.id} onPress={() => setSelectedCoach(c.id)} />
        ))}
      </View>

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <CtaButton onPress={onAssign} loading={assigning} disabled={!selectedCoach}>
        Assign Coverage
      </CtaButton>
    </Card>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.chip, { backgroundColor: selected ? Brand.yellow : colors.backgroundElement }]}>
      <Text style={[styles.chipLabel, { color: selected ? Brand.black : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 8 },
  chip: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  chipLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed, marginTop: 4 },
});
