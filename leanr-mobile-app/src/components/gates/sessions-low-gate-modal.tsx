/**
 * SessionsLowGateModal — New PRD.md §4.A: reappears every login while
 * `sessionsRemaining <= 5` (no persisted dismissal — this component's own
 * `dismissed` state lives only for the current app session, in
 * global-gates.tsx). "Renew Now" -> /plans.
 */
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { LightBottomSheet } from '@/components/light/light-bottom-sheet';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightTextLink } from '@/components/light/light-tappable';
import { LightBrand } from '@/constants/light-theme';

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
    <LightBottomSheet visible={visible} onClose={onDismiss} title="Running low on sessions">
      <Text style={styles.body}>
        You have {sessionsRemaining} session{sessionsRemaining === 1 ? '' : 's'} left on your current plan. Renew now to keep
        training without a gap.
      </Text>
      <LightPrimaryButton
        size="lg"
        onPress={() => {
          onDismiss();
          router.push('/plans');
        }}
        style={styles.button}>
        Renew Now
      </LightPrimaryButton>
      <LightTextLink onPress={onDismiss} style={styles.skipLink}>
        Not now
      </LightTextLink>
    </LightBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: 'Manrope_500Medium', fontSize: 14.5, color: LightBrand.textSecondary, lineHeight: 21 },
  button: { marginTop: 12 },
  skipLink: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    color: LightBrand.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
});
