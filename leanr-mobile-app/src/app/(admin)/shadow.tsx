/**
 * Shadow Coverage (admin) — New PRD.md §4.C "Shadow Coach Required (gap
 * queue)" + "Assign Shadow Coach" flow. See src/lib/data/admin-shadow.ts
 * header for how "uncovered leave-affected sessions" is computed and for
 * the confirmed `assign_shadow_coach` RPC behavior (reassigns the
 * affected bookings directly, not just a record). Leave approval now
 * auto-assigns shadow coverage (New PRD.md §3.15); this screen remains the
 * manual fallback for whatever the auto-cascade couldn't cover, plus
 * emergency/undocumented absences that never went through Leave Requests.
 */
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton, LightSecondaryButton } from '@/components/light/light-button';
import { LightTextField } from '@/components/light/light-text-field';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { assignShadowCoach, getShadowCoverageGaps, previewShadowAssignmentPlan, type ShadowAssignmentPlan, type ShadowGap } from '@/lib/data/admin-shadow';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

export default function AdminShadowScreen() {
  const { data: gaps, loading, error, reload } = useAsync(() => getShadowCoverageGaps(), []);

  return (
    <LightScreenScaffold title="Shadow Coverage" subtitle="Clients with sessions during approved leave, not yet covered">
      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (gaps ?? []).length === 0 && <LightEmptyState message="No coverage gaps right now." icon="shield-checkmark-outline" />}
      {!loading && !error && (gaps ?? []).map((gap) => <GapCard key={`${gap.leaveId}-${gap.clientId}`} gap={gap} onAssigned={reload} />)}
    </LightScreenScaffold>
  );
}

/**
 * Finds the best-matching free coach per occurrence in the gap's date range
 * (different sessions can land on different coaches, mirroring web's
 * ShadowCoachAssignModal preview-then-confirm flow), instead of a blind
 * pick-any-active-coach list unaware of availability/specialization/rating.
 */
function GapCard({ gap, onAssigned }: { gap: ShadowGap; onAssigned: () => void }) {
  const [reason, setReason] = useState('');
  const [plan, setPlan] = useState<ShadowAssignmentPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findCoverage = async () => {
    setLoadingPlan(true);
    setError(null);
    setPlan(null);
    try {
      setPlan(await previewShadowAssignmentPlan(gap.clientId, gap.primaryCoachId, gap.startsOn, gap.endsOn));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingPlan(false);
    }
  };

  const confirm = async () => {
    if (!plan || plan.assignments.length === 0) return;
    setAssigning(true);
    setError(null);
    try {
      for (const item of plan.assignments) {
        await assignShadowCoach({
          clientId: gap.clientId,
          clientName: gap.clientName,
          primaryCoachId: gap.primaryCoachId,
          primaryCoachName: gap.primaryCoachName,
          shadowCoachId: item.shadowCoachId,
          shadowCoachName: item.shadowCoachName,
          startsOn: item.startsOn,
          endsOn: item.endsOn,
          reason: reason || null,
        });
      }
      onAssigned();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <LightCard style={styles.card}>
      <Text style={styles.name}>{gap.clientName}</Text>
      <Text style={styles.meta}>
        {gap.affectedSessions} session{gap.affectedSessions === 1 ? '' : 's'} with {gap.primaryCoachName}, {gap.startsOn}
        {gap.endsOn !== gap.startsOn ? ` – ${gap.endsOn}` : ''}
      </Text>

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}

      {plan === null ? (
        <LightPrimaryButton onPress={findCoverage} loading={loadingPlan} style={styles.assignButton}>
          Find coverage
        </LightPrimaryButton>
      ) : (
        <>
          {plan.assignments.length === 0 && plan.uncoveredDates.length === 0 && (
            <Text style={styles.meta}>This client has no upcoming sessions with {gap.primaryCoachName} in that range.</Text>
          )}
          {plan.assignments.map((a, i) => (
            <Text key={i} style={styles.assignmentRow}>
              <Text style={styles.assignmentName}>{a.shadowCoachName}</Text>
              <Text style={styles.meta}>
                {' '}
                — {a.startsOn}
                {a.endsOn !== a.startsOn ? ` – ${a.endsOn}` : ''}
              </Text>
            </Text>
          ))}
          {plan.uncoveredDates.length > 0 && (
            <Text style={styles.uncoveredText}>No coach free on: {plan.uncoveredDates.join(', ')}</Text>
          )}
          <LightTextField placeholder="Reason (optional)" value={reason} onChangeText={setReason} />
          <LightSecondaryButton onPress={findCoverage} loading={loadingPlan} style={styles.assignButton}>
            Re-check availability
          </LightSecondaryButton>
          {plan.assignments.length > 0 && (
            <LightPrimaryButton onPress={confirm} loading={assigning} style={styles.assignButton}>
              Confirm assignment{plan.assignments.length > 1 ? 's' : ''}
            </LightPrimaryButton>
          )}
        </>
      )}
    </LightCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: LightBrand.navy },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textSecondary },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.alertRed, marginTop: 4 },
  assignmentRow: { marginTop: 6 },
  assignmentName: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.navy },
  uncoveredText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.alertRed, marginTop: 6 },
  assignButton: { marginTop: 8 },
});
