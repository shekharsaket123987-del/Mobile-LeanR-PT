/**
 * Shadow Coverage (admin) — LEANR_PT_MOBILE_PRD.md §10 "Assign Shadow
 * Coach" flow. See src/lib/data/admin-shadow.ts header for how
 * "uncovered leave-affected sessions" is computed and for the confirmed
 * `assign_shadow_coach` RPC behavior (reassigns the affected bookings
 * directly, not just a record).
 */
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { PrimaryButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Brand } from '@/constants/theme';
import { assignShadowCoach, getActiveCoachOptions, getShadowCoverageGaps, type ShadowGap } from '@/lib/data/admin-shadow';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

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
      {!loading && !error && gaps.length === 0 && <EmptyState message="No coverage gaps right now." icon="shield-checkmark-outline" />}
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
      setError(getErrorMessage(err));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <GlassCard>
      <Text style={styles.name}>{gap.clientName}</Text>
      <Text style={styles.meta}>
        {gap.affectedSessions} session{gap.affectedSessions === 1 ? '' : 's'} with {gap.primaryCoachName}, {gap.startsOn}
        {gap.endsOn !== gap.startsOn ? ` – ${gap.endsOn}` : ''}
      </Text>

      <SectionHeader title="Assign shadow coach" />
      <ChipGrid>
        {candidates.map((c) => (
          <Chip key={c.id} label={c.full_name} selected={selectedCoach === c.id} onPress={() => setSelectedCoach(c.id)} />
        ))}
      </ChipGrid>

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <PrimaryButton onPress={onAssign} loading={assigning} disabled={!selectedCoach}>
        Assign coverage
      </PrimaryButton>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: '#FFFFFF' },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed, marginTop: 4 },
});
