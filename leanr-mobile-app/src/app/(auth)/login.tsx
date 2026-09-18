/**
 * Unified login — single email/password screen for any role, role-based
 * routing after sign-in, Google OAuth, email-OTP alternative.
 */
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthShell } from '@/components/ui/auth-shell';
import { GhostButton, PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function LoginScreen() {
  const { signInWithPassword, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setSubmitting(true);
    const { error: signInError } = await signInWithPassword(email.trim(), password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    // No manual navigation — (auth)/_layout.tsx redirects reactively once the session + role resolve.
  };

  const onGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);
    const { error: googleError } = await signInWithGoogle();
    setGoogleSubmitting(false);
    if (googleError) setError(googleError);
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue your training.">
      <TextField
        icon="mail-outline"
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextField icon="lock-closed-outline" placeholder="Password" isPassword autoComplete="password" value={password} onChangeText={setPassword} />

      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Link href="/forgot-password" style={styles.forgotLink}>
        <Text style={styles.forgotLinkText}>Forgot password?</Text>
      </Link>

      <PrimaryButton onPress={onSubmit} loading={submitting} size="lg">
        Log in
      </PrimaryButton>

      <SecondaryButton onPress={onGoogleSignIn} loading={googleSubmitting} size="lg">
        Continue with Google
      </SecondaryButton>

      <GhostButton size="lg" onPress={() => router.push('/otp')}>
        Sign in with a code instead
      </GhostButton>

      <View style={styles.footer}>
        <Link href="/signup" style={styles.link}>
          <Text style={styles.linkText}>New to LEANR? Create an account</Text>
        </Link>
        <Link href="/book-free-demo" style={styles.link}>
          <Text style={styles.linkTextMuted}>Just want to try it? Book a free demo — no account needed</Text>
        </Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { color: Brand.alertRed, fontFamily: 'Manrope_500Medium', fontSize: 13 },
  forgotLink: { alignSelf: 'flex-end', marginTop: -6 },
  forgotLinkText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: Brand.yellow },
  footer: { marginTop: 8, gap: 14, alignItems: 'center' },
  link: { alignSelf: 'center' },
  linkText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: Brand.yellow, textAlign: 'center' },
  linkTextMuted: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
});
