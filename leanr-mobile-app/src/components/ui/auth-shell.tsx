/**
 * AuthShell — shared premium wrapper for the centered-form auth screens
 * (login/signup/otp/forgot-password/reset-password). Full wordmark +
 * radial glow belongs on auth screens per LEANR_PT_MOBILE_PRD.md §23/§4.4
 * ("full wordmark on auth/marketing screens only... in-app elsewhere a
 * simplified icon-only mark"). Keeps each screen's own state/handlers
 * untouched — this only supplies the shell.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, DisplayFont } from '@/constants/theme';

type Props = PropsWithChildren<{ title: string; subtitle?: string; compact?: boolean }>;

export function AuthShell({ title, subtitle, compact, children }: Props) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['rgba(245,217,10,0.07)', 'rgba(245,217,10,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.glow}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[styles.content, compact && styles.contentCompact]}
            keyboardShouldPersistTaps="handled">
            {!compact && (
              <View style={styles.brand}>
                <Text style={styles.wordmark}>LEANR</Text>
                <Text style={styles.subLockup}>By Fitelo</Text>
              </View>
            )}

            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

            <View style={styles.form}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Brand.bg },
  flex: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  contentCompact: { justifyContent: 'flex-start', paddingTop: 80 },
  brand: { marginBottom: 28 },
  wordmark: {
    fontFamily: DisplayFont,
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 42,
    color: Brand.yellow,
    letterSpacing: -0.5,
  },
  subLockup: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  title: {
    fontFamily: DisplayFont,
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 26,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  subtitle: { fontFamily: 'Manrope_500Medium', fontSize: 14.5, color: 'rgba(255,255,255,0.55)', marginTop: 6 },
  form: { marginTop: 24, gap: 14 },
});
