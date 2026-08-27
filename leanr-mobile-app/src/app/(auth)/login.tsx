/**
 * Unified login — LEANR_PT_NEXTGEN_APP_PRD.md §25: a single email/password
 * screen for any role; role-based routing happens after sign-in via the
 * (client)/(auth) layout redirects, not via separate /login/{role} routes
 * (those are a web-only artifact of the Next.js middleware pattern).
 *
 * "Continue with Google" uses Supabase's web-based OAuth pattern for
 * Expo/RN (see auth-context.tsx::signInWithGoogle) — this app never holds
 * a Google client ID itself; it just needs the Google provider turned on
 * in the Supabase dashboard (Authentication -> Providers -> Google) with
 * a Google Cloud OAuth client configured server-side. Until that's done,
 * tapping it will fail with Supabase's "provider is not enabled" error,
 * surfaced as a normal inline error the same as a bad password would be
 * — not a broken/disabled control. "Sign in with a code instead" links
 * to the email-OTP flow (otp.tsx) — a real, no-dashboard-config-required
 * alternative added alongside this screen, not a replacement for it.
 */
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CtaButton } from '@/components/tappable';
import { Brand, DisplayFont } from '@/constants/theme';
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
    setSubmitting(true);
    const { error: signInError } = await signInWithPassword(email.trim(), password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    // No manual navigation here — (auth)/_layout.tsx redirects reactively
    // once the session + role resolve, routing by role (role-routing.ts)
    // instead of always assuming client.
  };

  const onGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);
    const { error: googleError } = await signInWithGoogle();
    setGoogleSubmitting(false);
    if (googleError) setError(googleError);
    // Cancelled-by-user returns {error: null} — nothing to show, nothing
    // to navigate; a real success is picked up by the same reactive
    // session redirect as password login.
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.wordmark}>LEANR</Text>
          <Text style={styles.subLockup}>By Fitelo</Text>

          <Text style={styles.title}>Welcome back</Text>

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
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9A9A9A"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Link href="/forgot-password" style={styles.forgotLink}>
            <Text style={styles.forgotLinkText}>Forgot password?</Text>
          </Link>

          <CtaButton onPress={onSubmit} loading={submitting} style={styles.ctaSpacing}>
            Log in
          </CtaButton>

          <Pressable
            onPress={googleSubmitting ? undefined : onGoogleSignIn}
            disabled={googleSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            accessibilityState={{ disabled: googleSubmitting, busy: googleSubmitting }}
            style={({ pressed }) => [
              styles.secondaryButton,
              googleSubmitting && styles.disabled,
              pressed && !googleSubmitting && styles.secondaryButtonPressed,
            ]}>
            {googleSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.secondaryButtonText}>Continue with Google</Text>
            )}
          </Pressable>

          <Link href="/otp" style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Sign in with a code instead</Text>
          </Link>

          <Link href="/signup" style={styles.link}>
            <Text style={styles.linkText}>New to LEANR? Create an account</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Brand.black },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  wordmark: {
    fontFamily: DisplayFont,
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 40,
    color: Brand.yellow,
    letterSpacing: -0.5,
  },
  subLockup: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#FFFFFF', marginBottom: 24 },
  title: {
    fontFamily: DisplayFont,
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 24,
    color: '#FFFFFF',
    marginBottom: 8,
  },
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
  forgotLink: { alignSelf: 'flex-end' },
  forgotLinkText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: Brand.yellow },
  ctaSpacing: { marginTop: 8 },
  secondaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  disabled: { opacity: 0.4 },
  secondaryButtonPressed: { opacity: 0.7 },
  secondaryButtonText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  link: { marginTop: 20, alignSelf: 'center' },
  linkText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.yellow },
});
