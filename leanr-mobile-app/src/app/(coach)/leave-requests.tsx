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

import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightTextField } from '@/components/light/light-text-field';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
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

const LEAVE_STATUS_TONE: Record<LeaveStatus, 'teal' | 'green' | 'red'> = {
  pending: 'teal',
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
    <LightScreenScaffold title="Leave Requests">
      <LightPrimaryButton size="lg" onPress={() => setShowForm((v) => !v)}>
        {showForm ? 'Cancel' : 'Apply for Leave'}
      </LightPrimaryButton>

      {showForm && (
        <LightCard>
          <LightSectionHeader title="Leave type" />
          <LightChipGrid>
            <LightChip label="Full day" selected={leaveType === 'full_day'} onPress={() => setLeaveType('full_day')} />
            <LightChip label="Partial day" selected={leaveType === 'partial'} onPress={() => setLeaveType('partial')} />
          </LightChipGrid>

          <Text style={styles.label}>STARTS</Text>
          <LightChipGrid>
            {Array.from({ length: 14 }, (_, i) => addIstDays(todayIst(), i + 1)).map((d) => {
              const key = istDateKey(d);
              const isSelected = key === istDateKey(startDate);
              return <LightChip key={key} label={formatIstDateLabel(d)} selected={isSelected} onPress={() => setStartDate(d)} />;
            })}
          </LightChipGrid>

          {leaveType === 'full_day' && (
            <>
              <Text style={styles.label}>HOW MANY DAYS</Text>
              <LightChipGrid>
                {[1, 2, 3, 5, 7, 14].map((n) => (
                  <LightChip key={n} label={`${n}`} selected={days === n} onPress={() => setDays(n)} />
                ))}
              </LightChipGrid>
            </>
          )}

          {leaveType === 'partial' && (
            <>
              <Text style={styles.label}>FROM</Text>
              <LightChipGrid>
                {HOURS.map((h) => (
                  <LightChip key={h} label={`${h}:00`} selected={partialStartHour === h} onPress={() => setPartialStartHour(h)} />
                ))}
              </LightChipGrid>
              <Text style={styles.label}>TO</Text>
              <LightChipGrid>
                {HOURS.map((h) => (
                  <LightChip key={h} label={`${h}:00`} selected={partialEndHour === h} onPress={() => setPartialEndHour(h)} />
                ))}
              </LightChipGrid>
            </>
          )}

          <LightTextField placeholder="Reason (optional)" value={reason} onChangeText={setReason} multiline style={styles.reasonInput} />

          {formError && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {formError}
            </Text>
          )}
          <LightPrimaryButton onPress={onSubmit} loading={submitting}>
            Submit request
          </LightPrimaryButton>
        </LightCard>
      )}

      <LightSectionHeader title="My Requests" />
      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (leaveRequests?.length ?? 0) === 0 && <LightEmptyState message="No leave requests yet." icon="airplane-outline" />}
      {!loading && !error && leaveRequests?.map((r) => <LeaveRow key={r.id} request={r} />)}
    </LightScreenScaffold>
  );
}

function LeaveRow({ request }: { request: LeaveRequest }) {
  return (
    <LightCard style={styles.leaveRow}>
      <Text style={styles.bodyText}>
        {request.starts_on}
        {request.ends_on !== request.starts_on ? ` – ${request.ends_on}` : ''}
        {request.leave_type === 'partial' ? ` (${request.partial_start_time?.slice(0, 5)}–${request.partial_end_time?.slice(0, 5)})` : ''}
      </Text>
      <LightBadge label={request.status} tone={LEAVE_STATUS_TONE[request.status]} />
    </LightCard>
  );
}

const styles = StyleSheet.create({
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textPrimary },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: LightBrand.textMuted, marginTop: 6 },
  reasonInput: { minHeight: 60, textAlignVertical: 'top', paddingTop: 14, marginTop: 6, marginBottom: 10 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
  leaveRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
