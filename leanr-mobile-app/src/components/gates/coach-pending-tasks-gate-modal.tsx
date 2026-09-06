/**
 * CoachPendingTasksGateModal — New PRD.md §4.B "Global Modal: Pending
 * Tasks Gate": soft nudge (not a hard block), opens if pending tasks
 * exist (no persisted dismissal — reappears every page load while the
 * backlog exists, mirrored here as component-local state reset on
 * remount, same as the client portal's GlobalGates). Lists up to 5 past
 * sessions missing attendance/notes, each with "Resolve" -> session
 * detail. "Skip for now" dismisses locally only; "Review Now" -> Schedule.
 */
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { TextLink } from '@/components/tappable';
import type { Booking } from '@/lib/data/types';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function CoachPendingTasksGateModal({
  visible,
  tasks,
  onDismiss,
}: {
  visible: boolean;
  tasks: Booking[];
  onDismiss: () => void;
}) {
  const shown = tasks.slice(0, 5);

  return (
    <BottomSheet visible={visible} onClose={onDismiss} title="Pending tasks">
      <Text style={styles.body}>
        You have {tasks.length} past session{tasks.length === 1 ? '' : 's'} still missing attendance or notes.
      </Text>

      {shown.map((booking) => (
        <View key={booking.id} style={styles.row}>
          <Text style={styles.time}>{formatSessionTime(booking.scheduled_start)}</Text>
          <TextLink
            onPress={() => {
              onDismiss();
              router.push({ pathname: '/session/[id]', params: { id: booking.id } });
            }}>
            Resolve
          </TextLink>
        </View>
      ))}

      <PrimaryButton
        size="lg"
        onPress={() => {
          onDismiss();
          router.push('/schedule');
        }}
        style={styles.button}>
        Review Now
      </PrimaryButton>
      <SecondaryButton size="lg" onPress={onDismiss} style={styles.skipButton}>
        Skip for now
      </SecondaryButton>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: 'Manrope_500Medium', fontSize: 14.5, color: 'rgba(255,255,255,0.75)', lineHeight: 21 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  time: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: '#FFFFFF' },
  button: { marginTop: 14 },
  skipButton: { marginTop: 8 },
});
