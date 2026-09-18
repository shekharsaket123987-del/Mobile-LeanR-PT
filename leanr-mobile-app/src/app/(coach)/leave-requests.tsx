/**
 * Leave Requests — New PRD.md §4.B "Leave Requests card: list +
 * '+ Request Leave' button" (mockup frame 10), split out of the combined
 * Availability screen into its own route to match the mockup's separate
 * nav tile. Only "My Requests" — no "Team" tab: a coach can only ever
 * see/insert their OWN `coach_leave` rows (RLS confirmed in
 * coach-availability.ts), there's no cross-coach leave visibility
 * anywhere in the schema.
 */
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { PrimaryButton } from '@/components/ui/button';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { addIstDays, formatIstDateLabel, istDateKey, todayIst, type IstDate } from '@/lib/data/booking-wizard';
import {
  getMyLeaveRequests,
  requestLeave,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from '@/lib/data/coach-availability';
import { getErrorMessage } from '@/lib/data/errors';
import { useAsync } from '@/lib/data/use-async';

const LEAVE_STATUS_TONE: Record<LeaveStatus, 'yellow' | 'green' | 'red'> = {
  pending: 'yellow',
  approved: 'green',
  rejected: 'red',
};

const HOURS = Array.from({ length: 17 }, (_, i) => i + 5); // 5–21, matches the booking window default

export default function LeaveRequestsScreen() {
  const { data: leaveRequests, loading, error, reload } = useAsync(getMyLeaveRequests, []);

  const [showForm, setShowForm] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>('full_day');
  const [startDate, setStartDate] = useState<IstDate>(() => addIstDays(todayIst(), 1));
  const [days, setDays] = useState(1);
  const [partialStartHour, setPartialStartHour] = useState<number | null>(null);
  const [partialEndHour, setPartialEndHour] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = async () => {
    setFormError(null);
    if (leaveType === 'partial' && (partialStartHour === null || partialEndHour === null || partialEndHour <= partialStartHour)) {
      setFormError('Pick a valid start and end time.');
      return;
    }
    setSubmitting(true);
    try {
      const endDate = leaveType === 'full_day' ? addIstDays(startDate, days - 1) : startDate;
      await requestLeave({
        startsOn: istDateKey(startDate),
        endsOn: istDateKey(endDate),
        leaveType,
        partialStartTime: partialStartHour !== null ? `${String(partialStartHour).padStart(2, '0')}:00:00` : null,
        partialEndTime: partialEndHour !== null ? `${String(partialEndHour).padStart(2, '0')}:00:00` : null,
        reason: reason.trim() || null,
      });
      setShowForm(false);
      setReason('');
      setDays(1);
      setPartialStartHour(null);
      setPartialEndHour(null);
      reload();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenScaffold title="Leave Requests">
      <PrimaryButton size="lg" onPress={() => setShowForm((v) => !v)}>
        {showForm ? 'Cancel' : 'Apply for Leave'}
      </PrimaryButton>

      {showForm && (
        <GlassCard>
          <SectionHeader title="Leave type" />
          <ChipGrid>
            <Chip label="Full day" selected={leaveType === 'full_day'} onPress={() => setLeaveType('full_day')} />
            <Chip label="Partial day" selected={leaveType === 'partial'} onPress={() => setLeaveType('partial')} />
          </ChipGrid>

          <Text style={styles.label}>STARTS</Text>
          <ChipGrid>
            {Array.from({ length: 14 }, (_, i) => addIstDays(todayIst(), i + 1)).map((d) => {
              const key = istDateKey(d);
              const isSelected = key === istDateKey(startDate);
              return <Chip key={key} label={formatIstDateLabel(d)} selected={isSelected} onPress={() => setStartDate(d)} />;
            })}
          </ChipGrid>

          {leaveType === 'full_day' && (
            <>
              <Text style={styles.label}>HOW MANY DAYS</Text>
              <ChipGrid>
                {[1, 2, 3, 5, 7, 14].map((n) => (
                  <Chip key={n} label={`${n}`} selected={days === n} onPress={() => setDays(n)} />
                ))}
              </ChipGrid>
            </>
          )}

          {leaveType === 'partial' && (
            <>
              <Text style={styles.label}>FROM</Text>
              <ChipGrid>
                {HOURS.map((h) => (
                  <Chip key={h} label={`${h}:00`} selected={partialStartHour === h} onPress={() => setPartialStartHour(h)} />
                ))}
              </ChipGrid>
              <Text style={styles.label}>TO</Text>
              <ChipGrid>
                {HOURS.map((h) => (
                  <Chip key={h} label={`${h}:00`} selected={partialEndHour === h} onPress={() => setPartialEndHour(h)} />
                ))}
              </ChipGrid>
            </>
          )}

          <TextField placeholder="Reason (optional)" value={reason} onChangeText={setReason} multiline style={styles.reasonInput} />

          {formError && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {formError}
            </Text>
          )}
          <PrimaryButton onPress={onSubmit} loading={submitting}>
            Submit request
          </PrimaryButton>
        </GlassCard>
      )}

      <SectionHeader title="My Requests" />
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (leaveRequests?.length ?? 0) === 0 && <EmptyState message="No leave requests yet." icon="airplane-outline" />}
      {!loading && !error && leaveRequests?.map((r) => <LeaveRow key={r.id} request={r} />)}
    </ScreenScaffold>
  );
}

function LeaveRow({ request }: { request: LeaveRequest }) {
  return (
    <GlassCard style={styles.leaveRow}>
      <Text style={styles.bodyText}>
        {request.starts_on}
        {request.ends_on !== request.starts_on ? ` – ${request.ends_on}` : ''}
        {request.leave_type === 'partial' ? ` (${request.partial_start_time?.slice(0, 5)}–${request.partial_end_time?.slice(0, 5)})` : ''}
      </Text>
      <Badge label={request.status} tone={LEAVE_STATUS_TONE[request.status]} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#FFFFFF' },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: 'rgba(255,255,255,0.45)', marginTop: 6 },
  reasonInput: { minHeight: 60, textAlignVertical: 'top', paddingTop: 14, marginTop: 6, marginBottom: 10 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  leaveRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
