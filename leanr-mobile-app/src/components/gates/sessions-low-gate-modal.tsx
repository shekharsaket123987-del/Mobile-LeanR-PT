/**
 * SessionsLowGateModal — New PRD.md §4.A: reappears every login while
 * `sessionsRemaining <= 5` (no persisted dismissal — this component's own
 * `dismissed` state lives only for the current app session, in
 * global-gates.tsx). "Renew Now" -> /plans.
 */
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PrimaryButton } from '@/components/ui/button';
import { TextLink } from '@/components/tappable';

export function SessionsLowGateModal({
  visible,
  sessionsRemaining,
  onDismiss,
}: {
  visible: boolean;
  sessionsRemaining: number;
  onDismiss: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onDismiss} title="Running low on sessions">
      <Text style={styles.body}>
        You have {sessionsRemaining} session{sessionsRemaining === 1 ? '' : 's'} left on your current plan. Renew now to keep
        training without a gap.
      </Text>
      <PrimaryButton
        size="lg"
        onPress={() => {
          onDismiss();
          router.push('/plans');
        }}
        style={styles.button}>
        Renew Now
      </PrimaryButton>
      <TextLink onPress={onDismiss} style={styles.skipLink}>
        Not now
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
