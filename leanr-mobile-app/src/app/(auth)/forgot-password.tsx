/**
 * Forgot password — LEANR_PT_MOBILE_PRD.md §21/§28 flags this as
 * net-new-for-mobile (the web app's "Forgot password?" link has no
 * handler at all). Sends a Supabase recovery email whose link deep-links
 * back into this app at /reset-password (see auth-context.tsx for the
 * link-parsing + session handoff).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { LightAuthShell } from '@/components/light/light-auth-shell';
import { LightGhostButton, LightPrimaryButton } from '@/components/light/light-button';
import { LightTextField } from '@/components/light/light-text-field';
import { LightBrand } from '@/constants/light-theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function ForgotPasswordScreen() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setSubmitting(true);
    const { error: sendError } = await sendPasswordReset(email.trim());
    setSubmitting(false);
    if (sendError) {
      setError(sendError);
      return;
    }
    setSent(true);
  };

  return (
    <LightAuthShell
      compact
      title={sent ? 'Check your email' : 'Reset your password'}
      subtitle={
        sent
          ? `We've sent a password reset link to ${email.trim()}. Open it on this device to continue.`
          : "Enter your account email and we'll send you a link to set a new password."
      }>
      {!sent && (
        <>
          <LightTextField
            icon="mail-outline"
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          {error && (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}

          <LightPrimaryButton onPress={onSubmit} loading={submitting} size="lg">
            Send reset link
          </LightPrimaryButton>
        </>
      )}

      <LightGhostButton size="sm" onPress={() => router.replace('/login')} style={styles.centerBtn}>
        {sent ? 'Back to login' : 'Cancel'}
      </LightGhostButton>
    </LightAuthShell>
  );
}

const styles = StyleSheet.create({
  error: { color: LightBrand.alertRed, fontFamily: 'Manrope_500Medium', fontSize: 13 },
  centerBtn: { alignSelf: 'center', marginTop: 4 },
});
