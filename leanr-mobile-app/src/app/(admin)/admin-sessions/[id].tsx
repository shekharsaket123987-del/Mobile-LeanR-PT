/**
 * Session Detail (admin) — New PRD.md §4.C "Screen: Session Detail" —
 * fully read-only. Basic Information, Outcome Detail, Attendance,
 * Coaching Notes.
 */
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { LightStatusBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getAdminSessionAttendance, getAdminSessionDetail, getAdminSessionNotes } from '@/lib/data/admin-sessions';
import { useAsync } from '@/lib/data/use-async';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AdminSessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync(async () => {
    const [session, attendance, notes] = await Promise.all([getAdminSessionDetail(id), getAdminSessionAttendance(id), getAdminSessionNotes(id)]);
    return { session, attendance, notes };
  }, [id]);

  if (loading) {
    return (
      <LightScreenScaffold title="Session Details">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }
  if (error || !data?.session) {
    return (
      <LightScreenScaffold title="Session Details">
        <LightErrorState message={error ?? 'Session not found.'} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  const { session, attendance, notes } = data;

  return (
    <LightScreenScaffold title="Session Details" subtitle={formatDateTime(session.scheduled_start)}>
      <LightCard style={styles.card}>
        <LightSectionHeader title="Basic Information" />
        <Row label="Client" value={session.client_name ?? '—'} />
        <Row label="Coach" value={session.coach_name ?? '—'} />
        <Row label="Type" value={session.session_type} />
        <Row label="Duration" value={`${session.duration_minutes} min`} />
        <View style={styles.statusRow}>
          <Text style={styles.rowLabel}>Status</Text>
          <LightStatusBadge status={session.status} />
        </View>
        <Row label="Manually Added" value={session.recurring_slot_id ? 'No' : 'Yes'} />
      </LightCard>

      {(session.status === 'cancelled' || session.status === 'missed' || session.was_rescheduled) && (
        <LightCard style={styles.card}>
          <LightSectionHeader title="Outcome Detail" />
          {session.cancel_reason && <Row label="Cancel Reason" value={session.cancel_reason} />}
          {session.cancelled_by && <Row label="Cancelled By" value={session.cancelled_by} />}
          {session.no_show_party && <Row label="No-Show Party" value={session.no_show_party} />}
          {session.was_rescheduled && session.original_scheduled_start && <Row label="Originally" value={formatDateTime(session.original_scheduled_start)} />}
        </LightCard>
      )}

      {attendance && (
        <LightCard style={styles.card}>
          <LightSectionHeader title="Attendance" />
          <Row label="Status" value={attendance.status} />
          {attendance.client_joined_at && <Row label="Client Joined" value={formatDateTime(attendance.client_joined_at)} />}
          {attendance.coach_joined_at && <Row label="Coach Joined" value={formatDateTime(attendance.coach_joined_at)} />}
        </LightCard>
      )}

      {notes && (
        <LightCard style={styles.card}>
          <LightSectionHeader title="Coaching Notes" />
          {notes.notes && <Text style={styles.bodyText}>{notes.notes}</Text>}
          {notes.exercises_performed && <Row label="Exercises" value={notes.exercises_performed} />}
          {notes.performance_rating && <Row label="Performance" value={notes.performance_rating} />}
          {notes.homework && <Row label="Homework" value={notes.homework} />}
        </LightCard>
      )}
    </LightScreenScaffold>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textMuted },
  rowValue: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: LightBrand.navy, maxWidth: '60%', textAlign: 'right' },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textPrimary },
});
