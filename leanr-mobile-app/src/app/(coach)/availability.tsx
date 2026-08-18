/**
 * Coach Availability — LEANR_PT_MOBILE_PRD.md §5, §16: view-only weekly
 * hours (admin-set, coaches cannot edit — migration 0045) plus a
 * "Request Leave" form. See src/lib/data/coach-availability.ts header
 * for the confirmed RLS/constraint detail.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton } from '@/components/tappable';
import { Brand, Colors } from '@/constants/theme';
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

const LEAVE_STATUS_COLOR: Record<LeaveStatus, string> = {
  pending: Brand.streakEmberStart,
  approved: Brand.successEmerald,
  rejected: Brand.alertRed,
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
          <Card>
            <Text style={shared.cardLabel}>YOUR WEEKLY HOURS</Text>
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
          </Card>

          <CtaButton onPress={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'Request Leave'}</CtaButton>

          {showForm && (
            <Card>
              <Text style={shared.cardLabel}>LEAVE TYPE</Text>
              <View style={styles.chipRow}>
                <Chip label="Full day" selected={leaveType === 'full_day'} onPress={() => setLeaveType('full_day')} />
                <Chip label="Partial day" selected={leaveType === 'partial'} onPress={() => setLeaveType('partial')} />
              </View>

              <Text style={shared.cardLabel}>STARTS</Text>
              <View style={styles.chipRow}>
                {Array.from({ length: 14 }, (_, i) => addIstDays(todayIst(), i + 1)).map((d) => {
                  const key = istDateKey(d);
                  const isSelected = key === istDateKey(startDate);
                  return <Chip key={key} label={formatIstDateLabel(d)} selected={isSelected} onPress={() => setStartDate(d)} />;
                })}
              </View>

              {leaveType === 'full_day' && (
                <>
                  <Text style={shared.cardLabel}>HOW MANY DAYS</Text>
                  <View style={styles.chipRow}>
                    {[1, 2, 3, 5, 7, 14].map((n) => (
                      <Chip key={n} label={`${n}`} selected={days === n} onPress={() => setDays(n)} />
                    ))}
                  </View>
                </>
              )}

              {leaveType === 'partial' && (
                <>
                  <Text style={shared.cardLabel}>FROM</Text>
                  <View style={styles.chipRow}>
                    {HOURS.map((h) => (
                      <Chip key={h} label={`${h}:00`} selected={partialStartHour === h} onPress={() => setPartialStartHour(h)} />
                    ))}
                  </View>
                  <Text style={shared.cardLabel}>TO</Text>
                  <View style={styles.chipRow}>
                    {HOURS.map((h) => (
                      <Chip key={h} label={`${h}:00`} selected={partialEndHour === h} onPress={() => setPartialEndHour(h)} />
                    ))}
                  </View>
                </>
              )}

              <Text style={shared.cardLabel}>REASON (OPTIONAL)</Text>
              <TextInput
                style={styles.reasonInput}
                placeholder="Why are you requesting leave?"
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
              <CtaButton onPress={onSubmit} loading={submitting}>
                Submit request
              </CtaButton>
            </Card>
          )}

          <Card>
            <Text style={shared.cardLabel}>MY LEAVE REQUESTS</Text>
            {leaveRequests.length === 0 && <EmptyState message="No leave requests yet." />}
            {leaveRequests.map((r) => (
              <LeaveRow key={r.id} request={r} />
            ))}
          </Card>
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
      <Text style={[styles.leaveStatus, { color: LEAVE_STATUS_COLOR[request.status] }]}>{request.status}</Text>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.chip, { backgroundColor: selected ? Brand.yellow : colors.backgroundElement }]}>
      <Text style={[styles.chipLabel, { color: selected ? Brand.black : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 8 },
  chip: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  chipLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  reasonInput: { fontFamily: 'Manrope_500Medium', fontSize: 15, paddingVertical: 8, color: Brand.charcoal2, minHeight: 44 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  leaveRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  leaveStatus: { fontFamily: 'Manrope_700Bold', fontSize: 12, textTransform: 'capitalize' },
});
