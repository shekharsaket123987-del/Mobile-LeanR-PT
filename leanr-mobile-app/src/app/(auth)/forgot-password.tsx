/**
 * Forgot password — LEANR_PT_MOBILE_PRD.md §21/§28 flags this as
 * net-new-for-mobile (the web app's "Forgot password?" link has no
 * handler at all). Sends a Supabase recovery email whose link deep-links
 * back into this app at /reset-password (see auth-context.tsx for the
 * link-parsing + session handoff).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CtaButton, TextLink } from '@/components/tappable';
import { Brand, DisplayFont } from '@/constants/theme';
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
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.title}>{sent ? 'Check your email' : 'Reset your password'}</Text>
          <Text style={styles.subtitle}>
            {sent
              ? `We've sent a password reset link to ${email.trim()}. Open it on this device to continue.`
              : "Enter your account email and we'll send you a link to set a new password."}
          </Text>

          {!sent && (
            <>
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

              {error && <Text style={styles.error}>{error}</Text>}

              <CtaButton onPress={onSubmit} loading={submitting} style={styles.ctaSpacing}>
                Send reset link
              </CtaButton>
            </>
          )}

          <TextLink onPress={() => router.replace('/login')} style={styles.link}>
            {sent ? 'Back to login' : 'Cancel'}
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
