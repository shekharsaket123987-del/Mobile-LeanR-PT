/**
 * Leave Requests (admin) — LEANR_PT_MOBILE_PRD.md §10 "Screen: Leave
 * Requests (admin)". Approve/Reject a coach's pending leave request.
 */
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton, TextLink } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import { getPendingLeaveRequests, resolveLeaveRequest, type AdminLeaveRequest } from '@/lib/data/admin-leave';
import { useAsync } from '@/lib/data/use-async';

export default function AdminLeaveScreen() {
  const { data: requests, loading, error, reload } = useAsync(getPendingLeaveRequests, []);

  return (
    <ScreenScaffold title="Leave Requests">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (requests?.length ?? 0) === 0 && <EmptyState message="No pending leave requests." />}
      {!loading && !error && requests?.map((r) => <LeaveRow key={r.id} request={r} onResolved={reload} />)}
    </ScreenScaffold>
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Text style={shared.bigStat}>{request.coachName}</Text>
      <Text style={shared.cardLabel}>
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
      <CtaButton onPress={() => onResolve('approved')} loading={busy === 'approve'} style={styles.approveButton}>
        Approve
      </CtaButton>
      <TextLink onPress={() => onResolve('rejected')} style={styles.rejectLink}>
        Reject
      </TextLink>
    </Card>
  );
}

const styles = StyleSheet.create({
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, marginTop: 2 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed, marginTop: 4 },
  approveButton: { marginTop: 8 },
  rejectLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.alertRed, marginTop: 8, alignSelf: 'flex-start' },
});
