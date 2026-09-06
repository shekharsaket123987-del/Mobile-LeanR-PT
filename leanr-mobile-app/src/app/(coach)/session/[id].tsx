/**
 * Coach Session Workflow — LEANR_PT_MOBILE_PRD.md §7g/§8b/§8c/§8d:
 * Join -> Present/Late/Absent -> Notes -> Complete, one linear flow.
 * The best-grounded write path in the coach app — attendance and
 * workout_notes have exact documented column names, unlike most other
 * writes in this project (see src/lib/data/coach-portal.ts header).
 *
 * Attendance/notes controls are real buttons (not text links) at 44pt+
 * touch targets per LEANR_PT_NEXTGEN_APP_PRD.md §7's coach-workflow note.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { PrimaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { Brand, Radius } from '@/constants/theme';
import { attendanceEligible, getBookingById, markAttendance, markJoined, submitSessionNotes } from '@/lib/data/coach-portal';
import { useAsync } from '@/lib/data/use-async';
import { openZoomLink } from '@/lib/data/zoom';
import { getErrorMessage } from '@/lib/data/errors';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type Stage = 'pre' | 'notes' | 'absent-closed' | 'completed';

const ATTENDANCE_OPTIONS: { key: 'present' | 'late' | 'absent'; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'present', label: 'Present', icon: 'checkmark-circle', color: Brand.successEmerald },
  { key: 'late', label: 'Late', icon: 'time', color: Brand.streakEmberStart },
  { key: 'absent', label: 'Absent', icon: 'close-circle', color: Brand.alertRed },
];

export default function SessionWorkflow() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: booking, loading, error, reload } = useAsync(() => getBookingById(id), [id]);
  const [stage, setStage] = useState<Stage>('pre');
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onJoin = async () => {
    try {
      await markJoined(id);
      // Original PRD §7g: "Join" -> Zoom opens + coach_joined_at set.
      // openZoomLink now creates the meeting on first tap if one doesn't
      // exist yet (zoom-meeting Edge Function, §13 rule 20's "lazily
      // created"); the timestamp write above is what actually gates
      // Present/Late eligibility below (attendanceEligible).
      if (booking) await openZoomLink(booking);
      reload();
    } catch (err) {
      Alert.alert('Could not mark joined', getErrorMessage(err));
    }
  };

  const onMarkAttendance = async (status: 'present' | 'late' | 'absent') => {
    if (!booking) return;
    try {
      await markAttendance(booking, status);
      setStage(status === 'absent' ? 'absent-closed' : 'notes');
    } catch (err) {
      Alert.alert('Could not mark attendance', getErrorMessage(err));
    }
  };

  const onSubmitNotes = async () => {
    if (!booking) return;
    if (!summary.trim()) {
      Alert.alert('Add a session summary first.');
      return;
    }
    setSubmitting(true);
    try {
      await submitSessionNotes(booking, { notes: summary });
      setStage('completed');
    } catch (err) {
      Alert.alert('Could not save notes', getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <ScreenScaffold title="Session"><LoadingState /></ScreenScaffold>;
  if (error) return <ScreenScaffold title="Session"><ErrorState message={error} onRetry={reload} /></ScreenScaffold>;
  if (!booking) return <ScreenScaffold title="Session"><EmptyState message="Session not found." /></ScreenScaffold>;

  const eligible = attendanceEligible(booking);

  return (
    <ScreenScaffold title={formatSessionTime(booking.scheduled_start)}>
      {stage === 'completed' && (
        <StatCard emphasize value="Completed" label="SESSION" />
      )}

      {stage === 'absent-closed' && (
        <GlassCard>
          <Text style={styles.bigStatus}>Client absent</Text>
          <Text style={styles.metaLabel}>This session is closed. No notes required.</Text>
        </GlassCard>
      )}

      {stage === 'notes' && (
        <>
          <GlassCard>
            <SectionHeader title="Session summary" />
            <TextInput
              style={styles.notesInput}
              placeholder="What did you cover this session?"
              placeholderTextColor="rgba(255,255,255,0.35)"
              multiline
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
              accessibilityRole="button"
              accessibilityLabel={booking.coach_joined_at ? 'Joined — tap to reopen Zoom' : 'Mark joined and open Zoom'}
              style={styles.joinRow}>
              <Ionicons
                name={booking.coach_joined_at ? 'checkmark-circle' : 'videocam'}
                size={18}
                color={booking.coach_joined_at ? Brand.successEmerald : Brand.yellow}
              />
              <Text style={[styles.joinLabel, { color: booking.coach_joined_at ? Brand.successEmerald : Brand.yellow }]}>
                {booking.coach_joined_at ? 'Joined — reopen Zoom' : 'Mark joined & open Zoom'}
              </Text>
            </Pressable>
          </GlassCard>

          <GlassCard>
            <SectionHeader title="Mark attendance" />
            {!eligible && <Text style={styles.metaLabel}>Available once the session&apos;s scheduled time has passed.</Text>}
            <View style={styles.attendanceRow}>
              {ATTENDANCE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  disabled={!eligible}
                  onPress={() => onMarkAttendance(opt.key)}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ disabled: !eligible }}
                  style={[styles.attendanceBtn, { borderColor: opt.color + '55' }, !eligible && styles.attendanceBtnDisabled]}>
                  <Ionicons name={opt.icon} size={20} color={eligible ? opt.color : 'rgba(255,255,255,0.3)'} />
                  <Text style={[styles.attendanceLabel, { color: eligible ? opt.color : 'rgba(255,255,255,0.3)' }]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          </GlassCard>
        </>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  bigStatus: { fontFamily: 'Manrope_800ExtraBold', fontSize: 22, color: '#FFFFFF' },
  metaLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.55)', marginTop: 4 },
  notesInput: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    padding: 14,
    color: '#FFFFFF',
    minHeight: 100,
    backgroundColor: Brand.charcoal2,
    borderRadius: Radius.md,
    textAlignVertical: 'top',
  },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  joinLabel: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  attendanceRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  attendanceBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    minHeight: 44,
  },
  attendanceBtnDisabled: { opacity: 0.5 },
  attendanceLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
});
