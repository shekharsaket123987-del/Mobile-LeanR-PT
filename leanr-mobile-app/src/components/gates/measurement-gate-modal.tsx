/**
 * MeasurementGateModal — New PRD.md §4.A: forced when the last progress
 * log is >=7 days old or never logged. "Skip for now" only dismisses this
 * modal — the underlying gate stays active at every booking/join entry
 * point (measurement-status.ts::assertMeasurementsFresh), matching the web
 * app's own "Skip for now only dismisses the modal" behavior exactly.
 */
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PrimaryButton } from '@/components/ui/button';
import { TextLink } from '@/components/tappable';

export function MeasurementGateModal({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onDismiss} title="Update your measurements">
      <Text style={styles.body}>
        It&apos;s been a week (or more) since your last check-in. Log this week&apos;s measurements to keep booking and joining sessions.
      </Text>
      <PrimaryButton
        size="lg"
        onPress={() => {
          onDismiss();
          router.push('/progress');
        }}
        style={styles.button}>
        Update now
      </PrimaryButton>
      <TextLink onPress={onDismiss} style={styles.skipLink}>
        Skip for now
      </TextLink>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: 'Manrope_500Medium', fontSize: 14.5, color: 'rgba(255,255,255,0.75)', lineHeight: 21 },
  button: { marginTop: 12 },
  skipLink: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: 12,
  },
});
