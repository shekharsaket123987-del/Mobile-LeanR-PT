/**
 * Sign in with a code (email OTP) — an alternative to password login/
 * signup, not a replacement (both still work, see login.tsx/signup.tsx).
 * One flow handles both new and returning users: `signInWithOtp({
 * shouldCreateUser: true })` auto-creates a client-role account on first
 * verify via the same `handle_new_user()` trigger password signup uses,
 * so there's no separate "OTP signup" screen needed.
 *
 * **"Skip for now"** exists because whether Supabase actually emails a
 * 6-digit code (vs. a magic link) depends on this project's email
 * template configuration in the Supabase dashboard — not something this
 * repo controls or can verify from here. If sending/verifying doesn't
 * work yet because that isn't configured, Skip drops back to the
 * already-working password login/signup rather than leaving the user
 * stuck on a screen that can't get further without dashboard changes
 * only the project owner can make.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AuthShell } from '@/components/ui/auth-shell';
import { GhostButton, PrimaryButton } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { TextLink } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

type Stage = 'email' | 'code';

export default function OtpScreen() {
  const { sendOtp, verifyOtp } = useAuth();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSendCode = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setSubmitting(true);
    const { error: sendError } = await sendOtp(email.trim());
    setSubmitting(false);
    if (sendError) {
      setError(sendError);
      return;
    }
    setStage('code');
  };

  const onVerify = async () => {
    setError(null);
    if (!code.trim()) {
      setError('Enter the code from your email.');
      return;
    }
    setSubmitting(true);
    const { error: verifyError } = await verifyOtp(email.trim(), code.trim());
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError);
      return;
    }
    // No manual navigation — (auth)/_layout.tsx redirects reactively once
    // the session + role resolve, same as password login/signup.
  };

  return (
    <AuthShell
      title={stage === 'email' ? 'Sign in with a code' : 'Enter your code'}
      subtitle={
        stage === 'email'
          ? "We'll email you a one-time code — no password needed."
          : `Check ${email.trim()} for a 6-digit code.`
      }>
      {stage === 'email' ? (
        <TextField
          icon="mail-outline"
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      ) : (
        <TextField
          icon="keypad-outline"
          placeholder="6-digit code"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
        />
      )}

      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <PrimaryButton onPress={stage === 'email' ? onSendCode : onVerify} loading={submitting} size="lg">
        {stage === 'email' ? 'Send code' : 'Verify & continue'}
      </PrimaryButton>

      {stage === 'code' && (
        <GhostButton size="sm" onPress={() => setStage('email')} style={styles.centerBtn}>
          Use a different email
        </GhostButton>
      )}

      <TextLink onPress={() => router.replace('/login')} style={styles.skipLink}>
        Skip for now — use email & password instead
      </TextLink>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { color: Brand.alertRed, fontFamily: 'Manrope_500Medium', fontSize: 13 },
  centerBtn: { alignSelf: 'center' },
  skipLink: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: 12,
  },
});
