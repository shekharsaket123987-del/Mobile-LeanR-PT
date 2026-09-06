/**
 * Coach Change Requests (admin) — New PRD.md §4.C. Reject immediate;
 * Approve -> two-step (optionally pick a new coach directly, or leave
 * blank for client self-serve).
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LightBadge } from '@/components/light/light-badge';
import { LightDestructiveButton, LightPrimaryButton, LightSecondaryButton } from '@/components/light/light-button';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { listAdminCoachOptions } from '@/lib/data/admin-clients';
import {
  approveCoachChangeRequestBlank,
  approveCoachChangeRequestWithCoach,
  listCoachChangeRequests,
  rejectCoachChangeRequest,
  type AdminCoachChangeRequest,
} from '@/lib/data/admin-coach-change';
import { getErrorMessage } from '@/lib/data/errors';
import { useAsync } from '@/lib/data/use-async';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminCoachChangeRequestsScreen() {
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');
  const { data: requests, loading, error, reload } = useAsync(() => listCoachChangeRequests(tab), [tab]);
  const { data: coachOptions } = useAsync(listAdminCoachOptions, []);

  return (
    <LightScreenScaffold title="Coach Change Requests">
      <LightSegmentedControl
        options={[
          { key: 'pending', label: 'Pending' },
          { key: 'resolved', label: 'Resolved' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (requests?.length ?? 0) === 0 && <LightEmptyState message={`No ${tab} requests.`} icon="swap-horizontal-outline" />}
      {!loading &&
        !error &&
        requests?.map((r) => <RequestCard key={r.id} request={r} coachOptions={coachOptions ?? []} onResolved={reload} />)}
    </LightScreenScaffold>
  );
}

function RequestCard({
  request,
  coachOptions,
  onResolved,
}: {
  request: AdminCoachChangeRequest;
  coachOptions: { id: string; full_name: string }[];
  onResolved: () => void;
}) {
  const [showCoachPicker, setShowCoachPicker] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>, which: 'approve' | 'reject') => {
    setBusy(which);
    setError(null);
    try {
      await fn();
      onResolved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <LightCard style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.name}>{request.clientName}</Text>
        <LightBadge label={request.status} tone={request.status === 'pending' ? 'teal' : request.status === 'approved' ? 'green' : 'red'} />
      </View>
      {request.currentCoachName && <Text style={styles.meta}>Current coach: {request.currentCoachName}</Text>}
      <Text style={styles.reason}>{request.reason}</Text>
      <Text style={styles.date}>{formatDate(request.created_at)}</Text>

      {request.status === 'pending' && (
        <>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <View style={styles.actionRow}>
            <LightDestructiveButton loading={busy === 'reject'} disabled={busy !== null} onPress={() => run(() => rejectCoachChangeRequest(request.id), 'reject')}>
              Reject
            </LightDestructiveButton>
            <LightPrimaryButton
              loading={busy === 'approve' && !showCoachPicker}
              disabled={busy !== null}
              onPress={() => run(() => approveCoachChangeRequestBlank(request.id), 'approve')}>
              Approve
            </LightPrimaryButton>
          </View>
          <LightSecondaryButton onPress={() => setShowCoachPicker((v) => !v)}>{showCoachPicker ? 'Cancel' : 'Approve & Pick New Coach'}</LightSecondaryButton>
          {showCoachPicker && (
            <View style={styles.panel}>
              <LightChipGrid>
                {coachOptions
                  .filter((c) => c.id !== request.currentCoachId)
                  .map((c) => (
                    <LightChip key={c.id} label={c.full_name} selected={selectedCoach === c.id} onPress={() => setSelectedCoach(c.id)} />
                  ))}
              </LightChipGrid>
              <LightPrimaryButton
                loading={busy === 'approve'}
                disabled={!selectedCoach}
                onPress={() => selectedCoach && run(() => approveCoachChangeRequestWithCoach(request.id, request.clientId, selectedCoach), 'approve')}>
                Confirm New Coach
              </LightPrimaryButton>
            </View>
          )}
        </>
      )}
    </LightCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: LightBrand.navy },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.textSecondary },
  reason: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textPrimary, marginTop: 2 },
  date: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: LightBrand.textMuted },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  panel: { gap: 8, marginTop: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.alertRed },
});
