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

import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/button';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { TextField } from '@/components/ui/text-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { sessionTypeLabel } from '@/lib/data/bookings';
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
  { key: 'present', label: 'Present', icon: 'checkmark-circle-outline', color: Brand.successEmerald },
  { key: 'late', label: 'Late', icon: 'time-outline', color: Brand.yellow },
  { key: 'absent', label: 'Absent', icon: 'close-circle-outline', color: Brand.alertRed },
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
      <ScreenScaffold title="Session">
        <LoadingState />
      </ScreenScaffold>
    );
  }
  if (error || !data) {
    return (
      <ScreenScaffold title="Session">
        <ErrorState message={error ?? 'Session not found.'} onRetry={reload} />
      </ScreenScaffold>
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
    <ScreenScaffold title={formatSessionTime(booking.scheduled_start)}>
      <Text style={styles.sessionType}>{sessionTypeLabel(booking.session_type)}</Text>

      {stage === 'completed' && <StatCard emphasize value="Completed" label="SESSION" />}

      {stage === 'absent-closed' && (
        <GlassCard>
          <Text style={styles.bigStatus}>Client absent</Text>
          <Text style={styles.metaLabel}>This session is closed. No notes required.</Text>
        </GlassCard>
      )}

      {stage === 'notes' && (
        <>
          <GlassCard>
            <View style={styles.headerRow}>
              <Badge label={attendanceStatus === 'present' ? 'Present' : 'Late'} tone="yellow" />
            </View>
          </GlassCard>
          <GlassCard>
            <SectionHeader title="Session summary" />
            <TextField
              placeholder="What did you cover this session?"
              multiline
              style={styles.notesInput}
              value={summary}
              onChangeText={setSummary}
            />
          </GlassCard>
          <PrimaryButton size="lg" onPress={onSubmitNotes} loading={submitting}>
            Mark completed
          </PrimaryButton>
        </>
      )}

      {stage === 'pre' && (
        <>
          <GlassCard variant={booking.coach_joined_at ? 'default' : 'yellow'}>
            <SectionHeader title="Join session" />
            <Pressable
              onPress={onJoin}
              disabled={joining}
              accessibilityRole="button"
              accessibilityLabel={booking.coach_joined_at ? 'Joined — tap to reopen Zoom' : 'Mark joined and open Zoom'}
              style={styles.joinRow}>
              <Ionicons
                name={booking.coach_joined_at ? 'checkmark-circle' : 'videocam-outline'}
                size={18}
                color={booking.coach_joined_at ? Brand.successEmerald : Brand.yellow}
              />
              <Text style={[styles.joinLabel, { color: booking.coach_joined_at ? Brand.successEmerald : Brand.yellow }]}>
                {booking.coach_joined_at ? 'Joined — reopen Zoom' : 'Join Zoom Meeting'}
              </Text>
            </Pressable>
          </GlassCard>

          <GlassCard>
            <SectionHeader
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
                  <Ionicons name={opt.icon} size={20} color={eligible ? opt.color : 'rgba(255,255,255,0.45)'} />
                  <Text style={[styles.attendanceLabel, { color: eligible ? opt.color : 'rgba(255,255,255,0.45)' }]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          </GlassCard>
        </>
      )}

      {previousNotes.length > 0 && (
        <>
          <SectionHeader title="Previous Notes" />
          {previousNotes.map((n, i) => (
            <GlassCard key={i} style={styles.prevNoteCard}>
              <Text style={styles.prevNoteDate}>{new Date(n.scheduledStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
              <Text style={styles.prevNoteBody}>{n.notes}</Text>
            </GlassCard>
          ))}
        </>
      )}
      {previousNotes.length === 0 && stage === 'pre' && <EmptyState message="No previous session notes yet." icon="document-text-outline" />}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  sessionType: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.6, color: Brand.yellow, textTransform: 'uppercase' },
  headerRow: { flexDirection: 'row' },
  bigStatus: { fontFamily: 'Manrope_800ExtraBold', fontSize: 22, color: '#FFFFFF' },
  metaLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
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
  prevNoteDate: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  prevNoteBody: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: '#FFFFFF' },
});
