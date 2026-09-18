/**
 * Coach Change Requests (admin) — New PRD.md §4.C. Reject immediate;
 * Approve -> two-step (optionally pick a new coach directly, or leave
 * blank for client self-serve).
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DestructiveButton, PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
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
    <ScreenScaffold title="Coach Change Requests">
      <SegmentedControl
        options={[
          { key: 'pending', label: 'Pending' },
          { key: 'resolved', label: 'Resolved' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (requests?.length ?? 0) === 0 && <EmptyState message={`No ${tab} requests.`} icon="swap-horizontal-outline" />}
      {!loading &&
        !error &&
        requests?.map((r) => <RequestCard key={r.id} request={r} coachOptions={coachOptions ?? []} onResolved={reload} />)}
    </ScreenScaffold>
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
    <GlassCard style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.identity}>
          <Avatar photoUrl={request.clientPhotoUrl} name={request.clientName} size={36} />
          <Text style={styles.name}>{request.clientName}</Text>
        </View>
        <Badge label={request.status} tone={request.status === 'pending' ? 'yellow' : request.status === 'approved' ? 'green' : 'red'} />
      </View>
      {request.currentCoachName && <Text style={styles.meta}>Current coach: {request.currentCoachName}</Text>}
      <Text style={styles.reason}>{request.reason}</Text>
      <Text style={styles.date}>{formatDate(request.created_at)}</Text>

      {request.status === 'pending' && (
        <>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <View style={styles.actionRow}>
            <DestructiveButton loading={busy === 'reject'} disabled={busy !== null} onPress={() => run(() => rejectCoachChangeRequest(request.id), 'reject')}>
              Reject
            </DestructiveButton>
            <PrimaryButton
              loading={busy === 'approve' && !showCoachPicker}
              disabled={busy !== null}
              onPress={() => run(() => approveCoachChangeRequestBlank(request.id), 'approve')}>
              Approve
            </PrimaryButton>
          </View>
          <SecondaryButton onPress={() => setShowCoachPicker((v) => !v)}>{showCoachPicker ? 'Cancel' : 'Approve & Pick New Coach'}</SecondaryButton>
          {showCoachPicker && (
            <View style={styles.panel}>
              <ChipGrid>
                {coachOptions
                  .filter((c) => c.id !== request.currentCoachId)
                  .map((c) => (
                    <Chip key={c.id} label={c.full_name} selected={selectedCoach === c.id} onPress={() => setSelectedCoach(c.id)} />
                  ))}
              </ChipGrid>
              <PrimaryButton
                loading={busy === 'approve'}
                disabled={!selectedCoach}
                onPress={() => selectedCoach && run(() => approveCoachChangeRequestWithCoach(request.id, request.clientId, selectedCoach), 'approve')}>
                Confirm New Coach
              </PrimaryButton>
            </View>
          )}
        </>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#FFFFFF' },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' },
  reason: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: '#FFFFFF', marginTop: 2 },
  date: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: 'rgba(255,255,255,0.45)' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  panel: { gap: 8, marginTop: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: Brand.alertRed },
});
