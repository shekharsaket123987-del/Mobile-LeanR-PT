/**
 * Coach Session Workflow — LEANR_PT_MOBILE_PRD.md §7g/§8b/§8c/§8d:
 * Join -> Present/Late/Absent -> Notes -> Complete, one linear flow.
 * The best-grounded write path in the coach app — attendance and
 * workout_notes have exact documented column names, unlike most other
 * writes in this project (see src/lib/data/coach-portal.ts header).
 */
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton, TextLink } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import {
  attendanceEligible,
  getBookingById,
  markAttendance,
  markJoined,
  submitSessionNotes,
} from '@/lib/data/coach-portal';
import { useAsync } from '@/lib/data/use-async';
import { openZoomLink } from '@/lib/data/zoom';

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

export default function SessionWorkflow() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: booking, loading, error, reload } = useAsync(() => getBookingById(id), [id]);
  const [stage, setStage] = useState<Stage>('pre');
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onJoin = async () => {
    try {
      await markJoined(id);
      // Original PRD §7g: "Join" -> Zoom opens + coach_joined_at set. The
      // deep-link half is real if a zoom_join_url already exists on the
      // booking; the timestamp write above is what actually gates
      // Present/Late eligibility below (attendanceEligible).
      if (booking?.zoom_join_url) await openZoomLink(booking);
      reload();
    } catch (err) {
      Alert.alert('Could not mark joined', err instanceof Error ? err.message : String(err));
    }
  };

  const onMarkAttendance = async (status: 'present' | 'late' | 'absent') => {
    if (!booking) return;
    try {
      await markAttendance(booking, status);
      setStage(status === 'absent' ? 'absent-closed' : 'notes');
    } catch (err) {
      Alert.alert('Could not mark attendance', err instanceof Error ? err.message : String(err));
    }
  };

  const onSubmitNotes = async () => {
    if (!summary.trim()) {
      Alert.alert('Add a session summary first.');
      return;
    }
    setSubmitting(true);
    try {
      await submitSessionNotes(id, { summary });
      setStage('completed');
    } catch (err) {
      Alert.alert('Could not save notes', err instanceof Error ? err.message : String(err));
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
        <Card>
          <Text style={shared.bigStat}>Session Completed</Text>
        </Card>
      )}

      {stage === 'absent-closed' && (
        <Card>
          <Text style={shared.bigStat}>Client Absent</Text>
          <Text style={shared.cardLabel}>This session is closed. No notes required.</Text>
        </Card>
      )}

      {stage === 'notes' && (
        <>
          <Card>
            <Text style={shared.cardLabel}>SESSION SUMMARY</Text>
            <TextInput
              style={{ fontFamily: 'Manrope_500Medium', fontSize: 15, color: Brand.charcoal2, minHeight: 80 }}
              placeholder="What did you cover this session?"
              multiline
              value={summary}
              onChangeText={setSummary}
            />
          </Card>
          <CtaButton onPress={onSubmitNotes} loading={submitting}>
            Mark Completed
          </CtaButton>
        </>
      )}

      {stage === 'pre' && (
        <>
          <Card>
            <Text style={shared.cardLabel}>JOIN</Text>
            <TextLink
              onPress={onJoin}
              accessibilityLabel={booking.coach_joined_at ? 'Joined — tap to reopen Zoom' : 'Mark joined'}
              style={{ fontFamily: 'Manrope_700Bold', fontSize: 15, color: Brand.yellow, marginTop: 4 }}>
              {booking.coach_joined_at ? '✓ Joined' : 'Mark joined →'}
            </TextLink>
          </Card>

          <Card>
            <Text style={shared.cardLabel}>MARK ATTENDANCE</Text>
            {!eligible && (
              <Text style={shared.cardLabel}>Available once the session&apos;s scheduled time has passed.</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TextLink
                disabled={!eligible}
                onPress={() => onMarkAttendance('present')}
                style={{ fontFamily: 'Manrope_700Bold', fontSize: 14, color: eligible ? Brand.successEmerald : '#888' }}>
                Present
              </TextLink>
              <TextLink
                disabled={!eligible}
                onPress={() => onMarkAttendance('late')}
                style={{ fontFamily: 'Manrope_700Bold', fontSize: 14, color: eligible ? Brand.streakEmberStart : '#888' }}>
                Late
              </TextLink>
              <TextLink
                disabled={!eligible}
                onPress={() => onMarkAttendance('absent')}
                style={{ fontFamily: 'Manrope_700Bold', fontSize: 14, color: eligible ? Brand.alertRed : '#888' }}>
                Absent
              </TextLink>
            </View>
          </Card>
        </>
      )}
    </ScreenScaffold>
  );
}
