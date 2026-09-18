/**
 * CoachTaskRow — the shared "Task Row" from New PRD.md §4.B, used by the
 * Dashboard's Today's Tasks widget, the standalone Pending Tasks screen,
 * and Schedule's Day view. Row buttons are conditional on attendance
 * state (quoted from the PRD):
 * - Not yet marked: "Join" (idempotent) + Present/Late/Absent (disabled
 *   until `canMarkAttendance = isPast && joined`, mirrored here via
 *   `attendanceEligible`).
 * - Present/Late + notes not submitted: "Add Notes" -> session detail.
 * - Absent: badge only ("Absent — logged").
 * - Notes submitted: badge only ("Notes submitted").
 *
 * `bookings.status` alone can't distinguish "not yet marked" from
 * "present/late marked, notes still owed" (both stay 'upcoming' until
 * `submitSessionNotes` flips it to 'completed') — the caller must fetch
 * per-booking attendance via `getAttendanceMap` and pass it in.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { Brand } from '@/constants/theme';
import { attendanceEligible, markAttendance, markJoined } from '@/lib/data/coach-portal';
import { getErrorMessage } from '@/lib/data/errors';
import type { Booking } from '@/lib/data/types';
import { getJoinState, openZoomLink } from '@/lib/data/zoom';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Client's request: same countdown + 5-minute pulsing Join treatment as the client dashboard's demo card, mirrored here for the coach's own Join button. */
const JOIN_BLINK_WINDOW_MS = 5 * 60_000;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h : ${String(m).padStart(2, '0')}m : ${String(s).padStart(2, '0')}s`;
}

const ATTENDANCE_OPTIONS: { key: 'present' | 'late' | 'absent'; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'present', label: 'Present', icon: 'checkmark-circle-outline', color: Brand.successEmerald },
  { key: 'late', label: 'Late', icon: 'time-outline', color: Brand.yellow },
  { key: 'absent', label: 'Absent', icon: 'close-circle-outline', color: Brand.alertRed },
];

export function CoachTaskRow({
  booking,
  attendanceStatus,
  onChanged,
}: {
  booking: Booking;
  attendanceStatus: 'present' | 'late' | 'absent' | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Ticks regardless of which branch below ultimately renders — hooks can't be called
  // conditionally, so this (and the blink effect after it) must live above every early return.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const joinState = getJoinState(booking);
  const msToStart = new Date(booking.scheduled_start).getTime() - now;
  const blinking = joinState === 'joinable' && msToStart <= JOIN_BLINK_WINDOW_MS;

  const joinOpacity = useSharedValue(1);
  useEffect(() => {
    if (blinking) {
      joinOpacity.value = withRepeat(withSequence(withTiming(0.35, { duration: 600 }), withTiming(1, { duration: 600 })), -1, true);
    } else {
      joinOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [blinking, joinOpacity]);
  const joinBlinkStyle = useAnimatedStyle(() => ({ opacity: joinOpacity.value }));

  const openDetail = () => router.push({ pathname: '/session/[id]', params: { id: booking.id } });

  const onJoin = async () => {
    setBusy(true);
    try {
      await markJoined(booking.id);
      await openZoomLink(booking);
      onChanged();
    } catch (err) {
      Alert.alert('Could not join', getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onMark = async (status: 'present' | 'late' | 'absent') => {
    setBusy(true);
    try {
      await markAttendance(booking, status);
      onChanged();
    } catch (err) {
      Alert.alert('Could not mark attendance', getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (booking.status === 'missed') {
    return (
      <GlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.time}>{formatTime(booking.scheduled_start)}</Text>
          <Badge label="Absent — logged" tone="red" />
        </View>
      </GlassCard>
    );
  }

  if (booking.status === 'completed') {
    return (
      <GlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.time}>{formatTime(booking.scheduled_start)}</Text>
          <Badge label="Notes submitted" tone="green" />
        </View>
      </GlassCard>
    );
  }

  if (attendanceStatus === 'present' || attendanceStatus === 'late') {
    return (
      <GlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.time}>{formatTime(booking.scheduled_start)}</Text>
          <Badge label={attendanceStatus === 'present' ? 'Present' : 'Late'} tone="yellow" />
        </View>
        <Pressable onPress={openDetail} accessibilityRole="button" style={styles.addNotesBtn}>
          <Ionicons name="document-text-outline" size={16} color={Brand.yellow} />
          <Text style={styles.addNotesText}>Add Notes</Text>
        </Pressable>
      </GlassCard>
    );
  }

  const eligible = attendanceEligible(booking);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.time}>{formatTime(booking.scheduled_start)}</Text>
      </View>
      {!booking.coach_joined_at && joinState !== 'ended' && (
        <Text style={styles.countdownText}>{msToStart > 0 ? formatCountdown(msToStart) : 'Starting now'}</Text>
      )}
      <Animated.View style={joinBlinkStyle}>
        <Pressable onPress={onJoin} disabled={busy} accessibilityRole="button" style={styles.joinRow}>
          <Ionicons name={booking.coach_joined_at ? 'checkmark-circle' : 'videocam-outline'} size={17} color={Brand.yellow} />
          <Text style={styles.joinText}>{booking.coach_joined_at ? 'Joined — reopen Zoom' : 'Join'}</Text>
        </Pressable>
      </Animated.View>
      <View style={styles.attendanceRow}>
        {ATTENDANCE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            disabled={!eligible || busy}
            onPress={() => onMark(opt.key)}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            accessibilityState={{ disabled: !eligible || busy }}
            style={[styles.attendanceBtn, { borderColor: opt.color + '55' }, (!eligible || busy) && styles.attendanceBtnDisabled]}>
            <Ionicons name={opt.icon} size={17} color={eligible ? opt.color : 'rgba(255,255,255,0.45)'} />
            <Text style={[styles.attendanceLabel, { color: eligible ? opt.color : 'rgba(255,255,255,0.45)' }]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
      {!eligible && <Text style={styles.hint}>Available once the session&apos;s scheduled time has passed.</Text>}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: '#FFFFFF' },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  joinText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: Brand.yellow },
  countdownText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#FFFFFF' },
  attendanceRow: { flexDirection: 'row', gap: 8 },
  attendanceBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    minHeight: 44,
    justifyContent: 'center',
  },
  attendanceBtnDisabled: { opacity: 0.5 },
  attendanceLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11.5 },
  addNotesBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  addNotesText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: Brand.yellow },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: 'rgba(255,255,255,0.45)' },
});
