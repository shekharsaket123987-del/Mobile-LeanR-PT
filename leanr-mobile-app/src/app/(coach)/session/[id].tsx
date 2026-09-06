/**
 * Coach Session Workflow — New PRD.md §4.B "Session Detail — the core
 * operational workflow": Join -> Present/Late/Absent -> Notes -> Complete.
 * Relit; the underlying gating (`attendanceEligible`, present/late/
 * absent, notes-required-before-complete) is unchanged from the
 * pre-existing implementation — this is the one screen prompt3.md calls
 * out as "CRITICAL" to preserve bit-for-bit.
 *
 * Two real additions this pass, both previously missing:
 * - The screen used to always start at local `stage: 'pre'` regardless
 *   of the booking's actual persisted attendance — reopening a session
 *   where Present/Late was already marked (but notes not yet submitted)
 *   incorrectly showed the Join/Attendance buttons again instead of the
 *   Notes form. Stage is now derived directly from `booking.status` +
 *   the real attendance row on every load, not local-only state.
 * - "View Previous Notes" (PRD: "up to 3 previous session notes") is now
 *   shown — the data was never being fetched at all before.
 * - "End Session" (mockup) has no corresponding backend action anywhere
 *   in the PRD — `sessionEnded` is a computed clock check, "not a
 *   ticking countdown... a coach sitting on this page as the clock
 *   crosses the boundary must refresh" (PRD, quoted). So it's
 *   implemented here as exactly that: a manual re-check/refresh, not a
 *   new mutation.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightStatCard } from '@/components/light/light-stat-card';
import { LightTextField } from '@/components/light/light-text-field';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import {
  attendanceEligible,
  getAttendanceMap,
  getBookingById,
  getPreviousSessionNotes,
  markAttendance,
  markJoined,
  submitSessionNotes,
} from '@/lib/data/coach-portal';
import { getErrorMessage } from '@/lib/data/errors';
import { useAsync } from '@/lib/data/use-async';
import { openZoomLink } from '@/lib/data/zoom';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const ATTENDANCE_OPTIONS: { key: 'present' | 'late' | 'absent'; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'present', label: 'Present', icon: 'checkmark-circle-outline', color: LightBrand.successEmerald },
  { key: 'late', label: 'Late', icon: 'time-outline', color: LightBrand.amber },
  { key: 'absent', label: 'Absent', icon: 'close-circle-outline', color: LightBrand.alertRed },
];

export default function SessionWorkflow() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync(async () => {
    const booking = await getBookingById(id);
    const attendanceMap = await getAttendanceMap([id]);
    const previousNotes = await getPreviousSessionNotes(booking.client_id, id);
    return { booking, attendanceStatus: attendanceMap[id] ?? null, previousNotes };
  }, [id]);
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [marking, setMarking] = useState(false);

  const onJoin = async () => {
    if (!data) return;
    setJoining(true);
    try {
      await markJoined(id);
      await openZoomLink(data.booking);
      reload();
    } catch (err) {
      Alert.alert('Could not mark joined', getErrorMessage(err));
    } finally {
      setJoining(false);
    }
  };

  const onMarkAttendance = async (status: 'present' | 'late' | 'absent') => {
    if (!data) return;
    setMarking(true);
    try {
      await markAttendance(data.booking, status);
      reload();
    } catch (err) {
      Alert.alert('Could not mark attendance', getErrorMessage(err));
    } finally {
      setMarking(false);
    }
  };

  const onSubmitNotes = async () => {
    if (!data) return;
    if (!summary.trim()) {
      Alert.alert('Add a session summary first.');
      return;
    }
    setSubmitting(true);
    try {
      await submitSessionNotes(data.booking, { notes: summary });
      reload();
    } catch (err) {
      Alert.alert('Could not save notes', getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <LightScreenScaffold title="Session">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }
  if (error || !data) {
    return (
      <LightScreenScaffold title="Session">
        <LightErrorState message={error ?? 'Session not found.'} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  const { booking, attendanceStatus, previousNotes } = data;
  const eligible = attendanceEligible(booking);

  // Derived directly from persisted data on every load — not local-only
  // state — so reopening this screen always reflects reality (see header).
  const stage: 'pre' | 'notes' | 'absent-closed' | 'completed' =
    booking.status === 'missed'
      ? 'absent-closed'
      : booking.status === 'completed'
        ? 'completed'
        : attendanceStatus === 'present' || attendanceStatus === 'late'
          ? 'notes'
          : 'pre';

  return (
    <LightScreenScaffold title={formatSessionTime(booking.scheduled_start)}>
      {stage === 'completed' && <LightStatCard emphasize value="Completed" label="SESSION" />}

      {stage === 'absent-closed' && (
        <LightCard>
          <Text style={styles.bigStatus}>Client absent</Text>
          <Text style={styles.metaLabel}>This session is closed. No notes required.</Text>
        </LightCard>
      )}

      {stage === 'notes' && (
        <>
          <LightCard>
            <View style={styles.headerRow}>
              <LightBadge label={attendanceStatus === 'present' ? 'Present' : 'Late'} tone="teal" />
            </View>
          </LightCard>
          <LightCard>
            <LightSectionHeader title="Session summary" />
            <LightTextField
              placeholder="What did you cover this session?"
              multiline
              style={styles.notesInput}
              value={summary}
              onChangeText={setSummary}
            />
          </LightCard>
          <LightPrimaryButton size="lg" onPress={onSubmitNotes} loading={submitting}>
            Mark completed
          </LightPrimaryButton>
        </>
      )}

      {stage === 'pre' && (
        <>
          <LightCard variant={booking.coach_joined_at ? 'default' : 'teal'}>
            <LightSectionHeader title="Join session" />
            <Pressable
              onPress={onJoin}
              disabled={joining}
              accessibilityRole="button"
              accessibilityLabel={booking.coach_joined_at ? 'Joined — tap to reopen Zoom' : 'Mark joined and open Zoom'}
              style={styles.joinRow}>
              <Ionicons
                name={booking.coach_joined_at ? 'checkmark-circle' : 'videocam-outline'}
                size={18}
                color={booking.coach_joined_at ? LightBrand.successEmerald : LightBrand.teal}
              />
              <Text style={[styles.joinLabel, { color: booking.coach_joined_at ? LightBrand.successEmerald : LightBrand.teal }]}>
                {booking.coach_joined_at ? 'Joined — reopen Zoom' : 'Join Zoom Meeting'}
              </Text>
            </Pressable>
          </LightCard>

          <LightCard>
            <LightSectionHeader
              title="Mark attendance"
              actionLabel="End Session"
              onAction={reload}
            />
            {!eligible && (
              <Text style={styles.metaLabel}>
                Available once the session&apos;s scheduled time has passed — tap &quot;End Session&quot; to recheck.
              </Text>
            )}
            <View style={styles.attendanceRow}>
              {ATTENDANCE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  disabled={!eligible || marking}
                  onPress={() => onMarkAttendance(opt.key)}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ disabled: !eligible || marking }}
                  style={[styles.attendanceBtn, { borderColor: opt.color + '55' }, (!eligible || marking) && styles.attendanceBtnDisabled]}>
                  <Ionicons name={opt.icon} size={20} color={eligible ? opt.color : LightBrand.textMuted} />
                  <Text style={[styles.attendanceLabel, { color: eligible ? opt.color : LightBrand.textMuted }]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          </LightCard>
        </>
      )}

      {previousNotes.length > 0 && (
        <>
          <LightSectionHeader title="Previous Notes" />
          {previousNotes.map((n, i) => (
            <LightCard key={i} style={styles.prevNoteCard}>
              <Text style={styles.prevNoteDate}>{new Date(n.scheduledStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
              <Text style={styles.prevNoteBody}>{n.notes}</Text>
            </LightCard>
          ))}
        </>
      )}
      {previousNotes.length === 0 && stage === 'pre' && <LightEmptyState message="No previous session notes yet." icon="document-text-outline" />}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row' },
  bigStatus: { fontFamily: 'Manrope_800ExtraBold', fontSize: 22, color: LightBrand.navy },
  metaLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textMuted, marginTop: 4 },
  notesInput: { minHeight: 100, textAlignVertical: 'top', paddingTop: 14 },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  joinLabel: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  attendanceRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  attendanceBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    minHeight: 44,
    justifyContent: 'center',
  },
  attendanceBtnDisabled: { opacity: 0.5 },
  attendanceLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
  prevNoteCard: { gap: 2 },
  prevNoteDate: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: LightBrand.textMuted },
  prevNoteBody: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textPrimary },
});
