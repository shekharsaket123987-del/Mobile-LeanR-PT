/**
 * Coach Availability — LEANR_PT_MOBILE_PRD.md §5, §16: view-only weekly
 * hours (admin-set, coaches cannot edit — migration 0045) plus a
 * "Request Leave" form. See src/lib/data/coach-availability.ts header
 * for the confirmed RLS/constraint detail.
 */
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { Badge } from '@/components/ui/badge';
import { PrimaryButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Brand, Radius } from '@/constants/theme';
import { addIstDays, formatIstDateLabel, istDateKey, todayIst, type IstDate } from '@/lib/data/booking-wizard';
import {
  dayName,
  getMyLeaveRequests,
  getMyWeeklyAvailability,
  requestLeave,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from '@/lib/data/coach-availability';
import { useAsync } from '@/lib/data/use-async';

function formatTimeRange(start: string, end: string) {
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
}

const LEAVE_STATUS_TONE: Record<LeaveStatus, 'yellow' | 'green' | 'red'> = {
  pending: 'yellow',
  approved: 'green',
  rejected: 'red',
};

const HOURS = Array.from({ length: 17 }, (_, i) => i + 5); // 5–21, matches the booking window default

export default function CoachAvailabilityScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [weekly, leaveRequests] = await Promise.all([getMyWeeklyAvailability(), getMyLeaveRequests()]);
    return { weekly, leaveRequests };
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>('full_day');
  const [startDate, setStartDate] = useState<IstDate>(() => addIstDays(todayIst(), 1));
  const [days, setDays] = useState(1);
  const [partialStartHour, setPartialStartHour] = useState<number | null>(null);
  const [partialEndHour, setPartialEndHour] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const weekly = data?.weekly ?? [];
  const leaveRequests = data?.leaveRequests ?? [];
  const byDay = new Map<number, typeof weekly>();
  for (const row of weekly) {
    const existing = byDay.get(row.day_of_week);
    if (existing) {
      existing.push(row);
    } else {
      byDay.set(row.day_of_week, [row]);
    }
  }

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
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenScaffold title="Availability">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <GlassCard>
            <SectionHeader title="Your weekly hours" />
            {weekly.length === 0 && <Text style={styles.bodyText}>No working hours set by admin yet.</Text>}
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
              const rows = byDay.get(dow);
              if (!rows || rows.length === 0) return null;
              return (
                <Text key={dow} style={styles.bodyText}>
                  {dayName(dow)}: {rows.map((r) => formatTimeRange(r.start_time, r.end_time)).join(', ')}
                </Text>
              );
            })}
          </GlassCard>

          <PrimaryButton size="lg" onPress={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Request leave'}
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

              <TextInput
                style={styles.reasonInput}
                placeholder="Reason (optional)"
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={reason}
                onChangeText={setReason}
                multiline
                accessibilityLabel="Reason for leave"
              />

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

          <GlassCard>
            <SectionHeader title="My leave requests" />
            {leaveRequests.length === 0 && <EmptyState message="No leave requests yet." icon="airplane-outline" />}
            {leaveRequests.map((r) => (
              <LeaveRow key={r.id} request={r} />
            ))}
          </GlassCard>
        </>
      )}
    </ScreenScaffold>
  );
}

function LeaveRow({ request }: { request: LeaveRequest }) {
  return (
    <View style={styles.leaveRow}>
      <Text style={styles.bodyText}>
        {request.starts_on}
        {request.ends_on !== request.starts_on ? ` – ${request.ends_on}` : ''}
        {request.leave_type === 'partial' ? ` (${request.partial_start_time?.slice(0, 5)}–${request.partial_end_time?.slice(0, 5)})` : ''}
      </Text>
      <Badge label={request.status} tone={LEAVE_STATUS_TONE[request.status]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: 'rgba(255,255,255,0.5)', marginTop: 6 },
  reasonInput: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    padding: 14,
    color: '#FFFFFF',
    minHeight: 60,
    backgroundColor: Brand.charcoal2,
    borderRadius: Radius.md,
    textAlignVertical: 'top',
    marginTop: 6,
    marginBottom: 10,
  },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  leaveRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
});
