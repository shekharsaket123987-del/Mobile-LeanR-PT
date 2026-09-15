/**
 * Leave Requests (admin) — New PRD.md §4.C "Screen: Leave Requests".
 * Approve/Reject a coach's pending leave request. Approving a full-day
 * leave now runs the automatic shadow-coverage cascade (New PRD.md §3.15)
 * via `resolveLeaveRequest` — see admin-leave.ts / admin-shadow.ts. Any
 * occurrence the cascade can't cover is surfaced here and remains
 * reachable via the Shadow Coverage screen's manual "Assign shadow coach"
 * tool, the same fallback the web app itself provides for cases its own
 * cascade misses.
 */
import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { LightCard } from '@/components/light/light-card';
import { LightDestructiveButton, LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getPendingLeaveRequests, resolveLeaveRequest, type AdminLeaveRequest } from '@/lib/data/admin-leave';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

// Web's admin/leave-requests LeaveRequestsClient.tsx: past this many days, a
// leave has likely stopped being a temporary gap and started being a real
// change in the client's routine — purely an admin-facing nudge, never an
// automatic conversion. Shadow coverage still applies automatically either way.
const LONG_LEAVE_THRESHOLD_DAYS = 14;

function leaveDurationDays(startsOn: string, endsOn: string): number {
  const start = new Date(`${startsOn}T00:00:00Z`);
  const end = new Date(`${endsOn}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

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
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLongLeave = request.leave_type === 'full_day' && leaveDurationDays(request.starts_on, request.ends_on) >= LONG_LEAVE_THRESHOLD_DAYS;

  const onResolve = async (status: 'approved' | 'rejected') => {
    setBusy(status === 'approved' ? 'approve' : 'reject');
    setError(null);
    try {
      const outcome = await resolveLeaveRequest(request.id, status);
      if (outcome) {
        const lines: string[] = [`Leave approved for ${request.coachName} (${formatDate(request.starts_on)} – ${formatDate(request.ends_on)})`, ''];
        if (outcome.autoAssigned.length > 0) {
          lines.push(
            'Shadow coverage auto-assigned:',
            ...outcome.autoAssigned.map(
              (a) => `• ${a.clientName} → ${a.shadowCoachName} (${formatDate(a.startsOn)}${a.endsOn !== a.startsOn ? ` – ${formatDate(a.endsOn)}` : ''})`
            )
          );
        }
        if (outcome.needsManual.length > 0) {
          if (outcome.autoAssigned.length > 0) lines.push('');
          lines.push(
            'Needs manual assignment (no shadow coach available):',
            ...outcome.needsManual.map((n) => `• ${n.clientName}${n.uncoveredDates.length > 0 ? ` — ${n.uncoveredDates.join(', ')}` : ''}`)
          );
        }
        if (outcome.autoAssigned.length === 0 && outcome.needsManual.length === 0) {
          lines.push('This coach has no active clients affected during the leave window.');
        }
        if (isLongLeave) {
          lines.push(
            '',
            `This leave is ${leaveDurationDays(request.starts_on, request.ends_on)} days — long enough that a permanent coach change may serve affected clients better than ongoing shadow coverage. Shadow coverage has still been applied automatically above.`
          );
        }
        if (outcome.needsManual.length > 0) {
          Alert.alert('Shadow coverage', lines.join('\n'), [
            { text: 'Review clients', onPress: () => router.push({ pathname: '/coaches/[id]', params: { id: request.coachId } }) },
            { text: 'OK', style: 'cancel' },
          ]);
        } else {
          Alert.alert('Shadow coverage', lines.join('\n'));
        }
      }
      onResolved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <LightCard style={styles.card}>
      <Text style={styles.name}>
        {request.coachName}
        {isLongLeave ? ` · ${leaveDurationDays(request.starts_on, request.ends_on)}+ days` : ''}
      </Text>
      <Text style={styles.dates}>
        {request.starts_on}
        {request.ends_on !== request.starts_on ? ` – ${request.ends_on}` : ''}
        {request.leave_type === 'partial' ? ` (${request.partial_start_time?.slice(0, 5)}–${request.partial_end_time?.slice(0, 5)})` : ' (full day)'}
      </Text>
      <Text style={styles.submitted}>Submitted {formatDate(request.created_at)}</Text>
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
  submitted: { fontFamily: 'Manrope_500Medium', fontSize: 11, color: LightBrand.textSecondary, opacity: 0.7, marginTop: 4 },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textPrimary, marginTop: 4 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.alertRed, marginTop: 4 },
  approveButton: { marginTop: 10 },
  rejectButton: { marginTop: 8 },
});
