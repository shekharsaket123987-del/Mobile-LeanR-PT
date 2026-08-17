/**
 * Unified login — LEANR_PT_NEXTGEN_APP_PRD.md §25: a single email/password
 * screen for any role; role-based routing happens after sign-in via the
 * (client)/(auth) layout redirects, not via separate /login/{role} routes
 * (those are a web-only artifact of the Next.js middleware pattern).
 *
 * "Continue with Google" is present but disabled — native Google OAuth
 * needs a Google Cloud OAuth client ID this project doesn't have yet
 * (see leanr-mobile-app/README.md "Open items").
 */
import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CtaButton } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function LoginScreen() {
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

          <CtaButton onPress={onSubmit} loading={submitting} style={styles.ctaSpacing}>
            Log in
          </CtaButton>

          <View
            style={[styles.secondaryButton, styles.disabled]}
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}>
            <Text style={styles.secondaryButtonText}>Continue with Google (coming soon)</Text>
          </View>

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
    fontFamily: 'Oswald_700Bold',
    fontStyle: 'italic',
    fontSize: 40,
    color: Brand.yellow,
    letterSpacing: -0.5,
  },
  subLockup: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#FFFFFF', marginBottom: 24 },
  title: {
    fontFamily: 'Oswald_600SemiBold',
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
  ctaSpacing: { marginTop: 8 },
  secondaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  disabled: { opacity: 0.4 },
  secondaryButtonText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  link: { marginTop: 20, alignSelf: 'center' },
  linkText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.yellow },
});
