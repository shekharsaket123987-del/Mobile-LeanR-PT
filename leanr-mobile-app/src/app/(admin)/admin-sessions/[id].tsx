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
import {
  getAdminSessionAttendance,
  getAdminSessionDetail,
  getAdminSessionEscalation,
  getAdminSessionNotes,
  getAdminSessionProgressSnapshot,
} from '@/lib/data/admin-sessions';
import { useAsync } from '@/lib/data/use-async';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AdminSessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync(async () => {
    const session = await getAdminSessionDetail(id);
    const [attendance, notes, progressSnapshot, escalation] = await Promise.all([
      getAdminSessionAttendance(id),
      getAdminSessionNotes(id),
      session ? getAdminSessionProgressSnapshot(session.client_id, session.scheduled_start) : Promise.resolve(null),
      session?.escalation_id ? getAdminSessionEscalation(session.escalation_id) : Promise.resolve(null),
    ]);
    return { session, attendance, notes, progressSnapshot, escalation };
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

  const { session, attendance, notes, progressSnapshot, escalation } = data;

  return (
    <LightScreenScaffold title="Session Details" subtitle={formatDateTime(session.scheduled_start)}>
      <LightCard style={styles.card}>
        <LightSectionHeader title="Basic Information" />
        <Row label="Client" value={session.client_name ?? '—'} />
        <Row label="Coach" value={session.coach_name ?? '—'} />
        <Row label="Coach Employee Code" value={session.coach_employee_code ?? '—'} />
        <Row label="Type" value={session.session_type} />
        <Row label="Duration" value={`${session.duration_minutes} min`} />
        <View style={styles.statusRow}>
          <Text style={styles.rowLabel}>Status</Text>
          <LightStatusBadge status={session.status} />
        </View>
        <Row label="Manually Added" value={session.recurring_slot_id ? 'No' : 'Yes'} />
      </LightCard>

      {(session.status === 'cancelled' || session.status === 'missed' || session.was_rescheduled || session.technical_issue || session.coach_on_leave) && (
        <LightCard style={styles.card}>
          <LightSectionHeader title="Outcome Detail" />
          {session.cancel_reason && <Row label="Cancel Reason" value={session.cancel_reason} />}
          {session.cancelled_by && <Row label="Cancelled By" value={session.cancelled_by} />}
          {session.no_show_party && <Row label="No-Show Party" value={session.no_show_party} />}
          {session.technical_issue && <Row label="Technical Issue" value="Yes" />}
          {session.coach_on_leave && <Row label="Coach on Leave" value="Yes" />}
          {session.was_rescheduled && session.original_scheduled_start && <Row label="Originally" value={formatDateTime(session.original_scheduled_start)} />}
        </LightCard>
      )}

      {attendance && (
        <LightCard style={styles.card}>
          <LightSectionHeader title="Attendance" />
          <Row label="Status" value={attendance.status} />
          {attendance.client_joined_at && <Row label="Client Joined" value={formatDateTime(attendance.client_joined_at)} />}
          {attendance.client_left_at && <Row label="Client Left" value={formatDateTime(attendance.client_left_at)} />}
          {attendance.coach_joined_at && <Row label="Coach Joined" value={formatDateTime(attendance.coach_joined_at)} />}
          {attendance.coach_left_at && <Row label="Coach Left" value={formatDateTime(attendance.coach_left_at)} />}
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

      <LightCard style={styles.card}>
        <LightSectionHeader title="Weekly Progress Snapshot" />
        {progressSnapshot ? (
          <>
            <Text style={styles.snapshotAsOf}>As of {formatDateTime(progressSnapshot.logged_at)}</Text>
            <Row label="Weight" value={progressSnapshot.weight != null ? String(progressSnapshot.weight) : '—'} />
            <Row label="Body Fat %" value={progressSnapshot.body_fat_pct != null ? String(progressSnapshot.body_fat_pct) : '—'} />
            <Row label="Muscle %" value={progressSnapshot.muscle_pct != null ? String(progressSnapshot.muscle_pct) : '—'} />
            <Row label="Waist" value={progressSnapshot.waist != null ? String(progressSnapshot.waist) : '—'} />
            <Row label="Chest" value={progressSnapshot.chest != null ? String(progressSnapshot.chest) : '—'} />
            <Row label="Hip" value={progressSnapshot.hip != null ? String(progressSnapshot.hip) : '—'} />
            <Row label="Arms" value={progressSnapshot.arms != null ? String(progressSnapshot.arms) : '—'} />
            <Row label="Thigh" value={progressSnapshot.thigh != null ? String(progressSnapshot.thigh) : '—'} />
          </>
        ) : (
          <Text style={styles.rowLabel}>No measurements recorded before this session.</Text>
        )}
      </LightCard>

      {escalation && (
        <LightCard style={[styles.card, styles.escalationCard]}>
          <LightSectionHeader title="Linked Escalation" />
          <Text style={styles.bodyText}>{escalation.reason}</Text>
          <LightStatusBadge status={escalation.status} />
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
  snapshotAsOf: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: LightBrand.textMuted, marginBottom: 4 },
  escalationCard: { borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
});
