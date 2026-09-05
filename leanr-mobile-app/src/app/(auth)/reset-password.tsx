/**
 * Set a new password after tapping a recovery email link.
 *
 * By the time this screen renders, `auth-context.tsx` has already parsed
 * the incoming deep link, established the recovery session via
 * `supabase.auth.setSession`/`exchangeCodeForSession`, set
 * `recoveryInProgress`, and pushed here — the (auth) layout keeps that
 * session from redirecting straight home while `recoveryInProgress` is
 * true (see (auth)/_layout.tsx). If this screen is reached any other way
 * (a stale bookmark, a link with expired/invalid tokens the parser
 * rejected), `recoveryInProgress` is false and there is nothing to submit
 * against — show that as an explicit dead-end back to forgot-password
 * rather than a broken form.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AuthShell } from '@/components/ui/auth-shell';
import { GhostButton, PrimaryButton } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function ResetPasswordScreen() {
  const { recoveryInProgress, updatePassword, completePasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!recoveryInProgress) {
    return (
      <AuthShell
        compact
        title="Link expired"
        subtitle="This password reset link is invalid or has already been used. Request a new one to continue.">
        <PrimaryButton onPress={() => router.replace('/forgot-password')} size="lg">
          Request a new link
        </PrimaryButton>
        <GhostButton size="sm" onPress={() => router.replace('/login')} style={styles.centerBtn}>
          Back to login
        </GhostButton>
      </AuthShell>
    );
  }

  const onSubmit = async () => {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    // Clears the recovery gate — (auth)/_layout.tsx's normal
    // "session exists -> redirect home by role" now takes over.
    completePasswordRecovery();
  };

  return (
    <AuthShell compact title="Set a new password" subtitle="Choose a new password for your account.">
      <TextField
        icon="lock-closed-outline"
        placeholder="New password"
        isPassword
        autoComplete="password-new"
        value={password}
        onChangeText={setPassword}
      />
      <TextField
        icon="lock-closed-outline"
        placeholder="Confirm new password"
        isPassword
        autoComplete="password-new"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <PrimaryButton onPress={onSubmit} loading={submitting} size="lg">
        Save new password
      </PrimaryButton>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { color: Brand.alertRed, fontFamily: 'Manrope_500Medium', fontSize: 13 },
  centerBtn: { alignSelf: 'center', marginTop: 4 },
});
