/**
 * PhoneGateModal — New PRD.md §4.A: forced when `profiles.phone` is null
 * (Google OAuth signups, or anyone who skipped the phone step at signup).
 * Two-step phone -> OTP, same `phone-otp` edge function signup.tsx uses,
 * plus the same "Skip for now" bypass the web app ships (§19.3 item 16).
 */
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PrimaryButton } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { TextLink } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { isValidMobile, sendPhoneOtp, verifyPhoneOtp } from '@/lib/data/phone-otp';
import { updateMyProfile } from '@/lib/data/profile';

type Stage = 'phone' | 'otp';

export function PhoneGateModal({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const { refreshProfile } = useAuth();
  const [stage, setStage] = useState<Stage>('phone');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStage('phone');
    setMobile('');
    setOtp('');
    setError(null);
  };

  const onSendCode = async () => {
    setError(null);
    if (!isValidMobile(mobile)) {
      setError('Enter a valid mobile number.');
      return;
    }
    setSubmitting(true);
    try {
      await sendPhoneOtp(mobile.trim());
      setStage('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async () => {
    setError(null);
    if (!otp.trim()) {
      setError('Enter the code sent to your phone.');
      return;
    }
    setSubmitting(true);
    try {
      await verifyPhoneOtp(mobile.trim(), otp.trim());
      await updateMyProfile({ phone: mobile.trim() });
      await refreshProfile();
      reset();
      onDismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        reset();
        onDismiss();
      }}
      title="Add your phone number">
      {stage === 'phone' ? (
        <TextField
          icon="call-outline"
          placeholder="Mobile number"
          keyboardType="phone-pad"
          autoComplete="tel"
          value={mobile}
          onChangeText={setMobile}
        />
      ) : (
        <TextField
          icon="keypad-outline"
          placeholder="6-digit code"
          keyboardType="number-pad"
          maxLength={6}
          value={otp}
          onChangeText={setOtp}
        />
      )}

      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <PrimaryButton size="lg" onPress={stage === 'phone' ? onSendCode : onVerify} loading={submitting} style={styles.button}>
        {stage === 'phone' ? 'Send code' : 'Verify'}
      </PrimaryButton>

      <TextLink
        onPress={() => {
          reset();
          onDismiss();
        }}
        style={styles.skipLink}>
        Skip for now (demo — unverified)
      </TextLink>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  error: { color: Brand.alertRed, fontFamily: 'Manrope_500Medium', fontSize: 13, marginTop: 4 },
  button: { marginTop: 12 },
  skipLink: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: 12,
  },
});
