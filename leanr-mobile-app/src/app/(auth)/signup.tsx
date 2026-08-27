/**
 * Signup — client-only self-serve registration (LEANR_PT_MOBILE_PRD.md §3:
 * "this is the only role the public can self-register as"). Coach/admin
 * accounts are ops-provisioned only and have no mobile signup surface.
 */
import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CtaButton } from '@/components/tappable';
import { Brand, DisplayFont } from '@/constants/theme';
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
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Get matched with your coach in minutes.</Text>

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
            placeholder="Password (min. 8 characters)"
            placeholderTextColor="#9A9A9A"
            secureTextEntry
            autoComplete="password-new"
            value={password}
            onChangeText={setPassword}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <CtaButton onPress={onSubmit} loading={submitting} style={styles.ctaSpacing}>
            Create account
          </CtaButton>

          <Link href="/login" style={styles.link}>
            <Text style={styles.linkText}>Already have an account? Log in</Text>
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
  title: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 28, color: Brand.yellow },
  subtitle: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#CCCCCC', marginBottom: 20 },
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
  link: { marginTop: 20, alignSelf: 'center' },
  linkText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.yellow },
});
