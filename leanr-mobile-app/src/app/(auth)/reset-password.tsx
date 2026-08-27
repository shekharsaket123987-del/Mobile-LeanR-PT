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
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CtaButton, TextLink } from '@/components/tappable';
import { Brand, DisplayFont } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function ResetPasswordScreen() {
  const { recoveryInProgress, updatePassword, completePasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!recoveryInProgress) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.content}>
          <Text style={styles.title}>Link expired</Text>
          <Text style={styles.subtitle}>
            This password reset link is invalid or has already been used. Request a new one to continue.
          </Text>
          <CtaButton onPress={() => router.replace('/forgot-password')} style={styles.ctaSpacing}>
            Request a new link
          </CtaButton>
          <TextLink onPress={() => router.replace('/login')} style={styles.link}>
            Back to login
          </TextLink>
        </View>
      </SafeAreaView>
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
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.title}>Set a new password</Text>
          <Text style={styles.subtitle}>Choose a new password for your account.</Text>

          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor="#9A9A9A"
            secureTextEntry
            autoComplete="password-new"
            value={password}
            onChangeText={setPassword}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor="#9A9A9A"
            secureTextEntry
            autoComplete="password-new"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <CtaButton onPress={onSubmit} loading={submitting} style={styles.ctaSpacing}>
            Save new password
          </CtaButton>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Brand.black },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  title: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 24, color: '#FFFFFF' },
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
  link: { alignSelf: 'center', marginTop: 24, color: Brand.yellow, fontFamily: 'Manrope_500Medium', fontSize: 14 },
});
