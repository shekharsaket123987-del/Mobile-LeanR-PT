/**
 * Signup — client-only self-serve registration (LEANR_PT_MOBILE_PRD.md §3:
 * "this is the only role the public can self-register as"). Coach/admin
 * accounts are ops-provisioned only and have no mobile signup surface.
 */
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AuthShell } from '@/components/ui/auth-shell';
import { PrimaryButton } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function SignupScreen() {
  const { signUpWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    const { error: signUpError } = await signUpWithPassword(email.trim(), password);
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    // No manual navigation here — (auth)/_layout.tsx redirects reactively
    // once session + role resolve. New signups are always role='client'
    // (set in signUpWithPassword), so this lands on the client home; see
    // README open items re: original PRD's "straight into plan selection"
    // destination, not yet distinguished from the plain home route.
  };

  return (
    <AuthShell title="Create your account" subtitle="Get matched with your coach in minutes.">
      <TextField
        icon="mail-outline"
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        icon="lock-closed-outline"
        placeholder="Password (min. 8 characters)"
        isPassword
        autoComplete="password-new"
        value={password}
        onChangeText={setPassword}
      />

      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <PrimaryButton onPress={onSubmit} loading={submitting} size="lg">
        Create account
      </PrimaryButton>

      <Link href="/login" style={styles.link}>
        <Text style={styles.linkText}>Already have an account? Log in</Text>
      </Link>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { color: Brand.alertRed, fontFamily: 'Manrope_500Medium', fontSize: 13 },
  link: { alignSelf: 'center', marginTop: 8 },
  linkText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: Brand.yellow },
});
