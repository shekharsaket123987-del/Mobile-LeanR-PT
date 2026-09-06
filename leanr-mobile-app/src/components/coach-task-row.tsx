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
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightBrand } from '@/constants/light-theme';
import { attendanceEligible, markAttendance, markJoined } from '@/lib/data/coach-portal';
import { getErrorMessage } from '@/lib/data/errors';
import type { Booking } from '@/lib/data/types';
import { openZoomLink } from '@/lib/data/zoom';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const ATTENDANCE_OPTIONS: { key: 'present' | 'late' | 'absent'; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'present', label: 'Present', icon: 'checkmark-circle-outline', color: LightBrand.successEmerald },
  { key: 'late', label: 'Late', icon: 'time-outline', color: LightBrand.amber },
  { key: 'absent', label: 'Absent', icon: 'close-circle-outline', color: LightBrand.alertRed },
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
      <LightCard style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.time}>{formatTime(booking.scheduled_start)}</Text>
          <LightBadge label="Absent — logged" tone="red" />
        </View>
      </LightCard>
    );
  }

  if (booking.status === 'completed') {
    return (
      <LightCard style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.time}>{formatTime(booking.scheduled_start)}</Text>
          <LightBadge label="Notes submitted" tone="green" />
        </View>
      </LightCard>
    );
  }

  if (attendanceStatus === 'present' || attendanceStatus === 'late') {
    return (
      <LightCard style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.time}>{formatTime(booking.scheduled_start)}</Text>
          <LightBadge label={attendanceStatus === 'present' ? 'Present' : 'Late'} tone="teal" />
        </View>
        <Pressable onPress={openDetail} accessibilityRole="button" style={styles.addNotesBtn}>
          <Ionicons name="document-text-outline" size={16} color={LightBrand.teal} />
          <Text style={styles.addNotesText}>Add Notes</Text>
        </Pressable>
      </LightCard>
    );
  }

  const eligible = attendanceEligible(booking);

  return (
    <LightCard style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.time}>{formatTime(booking.scheduled_start)}</Text>
      </View>
      <Pressable onPress={onJoin} disabled={busy} accessibilityRole="button" style={styles.joinRow}>
        <Ionicons name={booking.coach_joined_at ? 'checkmark-circle' : 'videocam-outline'} size={17} color={LightBrand.teal} />
        <Text style={styles.joinText}>{booking.coach_joined_at ? 'Joined — reopen Zoom' : 'Join'}</Text>
      </Pressable>
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
            <Ionicons name={opt.icon} size={17} color={eligible ? opt.color : LightBrand.textMuted} />
            <Text style={[styles.attendanceLabel, { color: eligible ? opt.color : LightBrand.textMuted }]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
      {!eligible && <Text style={styles.hint}>Available once the session&apos;s scheduled time has passed.</Text>}
    </LightCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: LightBrand.navy },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  joinText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: LightBrand.teal },
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
  addNotesText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: LightBrand.teal },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: LightBrand.textMuted },
});
