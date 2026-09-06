/**
 * Leave Requests (admin) — New PRD.md §4.C "Screen: Leave Requests".
 * Approve/Reject a coach's pending leave request. Relit from the
 * previous dark-theme version — same data layer (admin-leave.ts),
 * untouched. Note (documented in the build plan): this simplified
 * approve/reject does not run the web app's automatic shadow-coverage
 * cascade (that scoring algorithm lives only in the web repo's
 * scheduling.service.ts) — any gap it leaves is closed via the
 * Shadow Coverage screen's manual "Assign shadow coach" tool, the same
 * fallback the web app itself provides for cases its own cascade misses.
 */
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { LightCard } from '@/components/light/light-card';
import { LightDestructiveButton, LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getPendingLeaveRequests, resolveLeaveRequest, type AdminLeaveRequest } from '@/lib/data/admin-leave';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

export default function AdminLeaveScreen() {
  const { data: requests, loading, error, reload } = useAsync(getPendingLeaveRequests, []);

  return (
    <LightScreenScaffold title="Leave Requests">
      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (requests?.length ?? 0) === 0 && <LightEmptyState message="No pending leave requests." icon="checkmark-circle-outline" />}
      {!loading && !error && requests?.map((r) => <LeaveRow key={r.id} request={r} onResolved={reload} />)}
    </LightScreenScaffold>
  );
}

function LeaveRow({ request, onResolved }: { request: AdminLeaveRequest; onResolved: () => void }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onResolve = async (status: 'approved' | 'rejected') => {
    setBusy(status === 'approved' ? 'approve' : 'reject');
    setError(null);
    try {
      await resolveLeaveRequest(request.id, status);
      onResolved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <LightCard style={styles.card}>
      <Text style={styles.name}>{request.coachName}</Text>
      <Text style={styles.dates}>
        {request.starts_on}
        {request.ends_on !== request.starts_on ? ` – ${request.ends_on}` : ''}
        {request.leave_type === 'partial' ? ` (${request.partial_start_time?.slice(0, 5)}–${request.partial_end_time?.slice(0, 5)})` : ' (full day)'}
      </Text>
      {request.reason && <Text style={styles.bodyText}>{request.reason}</Text>}
      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <LightPrimaryButton onPress={() => onResolve('approved')} loading={busy === 'approve'} disabled={busy !== null} style={styles.approveButton}>
        Approve
      </LightPrimaryButton>
      <LightDestructiveButton onPress={() => onResolve('rejected')} loading={busy === 'reject'} disabled={busy !== null} style={styles.rejectButton}>
        Reject
      </LightDestructiveButton>
    </LightCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 2 },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: LightBrand.navy },
  dates: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: LightBrand.textSecondary, marginTop: 2 },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textPrimary, marginTop: 4 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.alertRed, marginTop: 4 },
  approveButton: { marginTop: 10 },
  rejectButton: { marginTop: 8 },
});
