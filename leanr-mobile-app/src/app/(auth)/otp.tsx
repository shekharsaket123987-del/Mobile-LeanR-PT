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
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CtaButton, TextLink } from '@/components/tappable';
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
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.wordmark}>LEANR</Text>
          <Text style={styles.subLockup}>By Fitelo</Text>

          <Text style={styles.title}>{stage === 'email' ? 'Sign in with a code' : 'Enter your code'}</Text>
          <Text style={styles.subtitle}>
            {stage === 'email'
              ? "We'll email you a one-time code — no password needed."
              : `Check ${email.trim()} for a 6-digit code.`}
          </Text>

          {stage === 'email' ? (
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#9A9A9A"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          ) : (
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor="#9A9A9A"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <CtaButton onPress={stage === 'email' ? onSendCode : onVerify} loading={submitting} style={styles.ctaSpacing}>
            {stage === 'email' ? 'Send code' : 'Verify & continue'}
          </CtaButton>

          {stage === 'code' && (
            <TextLink onPress={() => setStage('email')} style={styles.link}>
              Use a different email
            </TextLink>
          )}

          <TextLink onPress={() => router.replace('/login')} style={styles.skipLink}>
            Skip for now — use email & password instead
          </TextLink>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Brand.black },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  wordmark: { fontFamily: 'Oswald_700Bold', fontStyle: 'italic', fontSize: 40, color: Brand.yellow, letterSpacing: -0.5 },
  subLockup: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#FFFFFF', marginBottom: 24 },
  title: { fontFamily: 'Oswald_600SemiBold', fontStyle: 'italic', fontSize: 24, color: '#FFFFFF' },
  subtitle: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#CCCCCC', marginBottom: 8 },
  input: {
    backgroundColor: Brand.charcoal2,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
  },
  error: { color: Brand.alertRed, fontFamily: 'Manrope_500Medium', fontSize: 13 },
  ctaSpacing: { marginTop: 8 },
  link: { alignSelf: 'center', marginTop: 4 },
  skipLink: { alignSelf: 'center', marginTop: 24, color: '#888888' },
});
