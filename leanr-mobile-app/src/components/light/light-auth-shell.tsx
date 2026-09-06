/** LightAuthShell — same API as ui/auth-shell.tsx, light palette (white bg, teal wordmark, navy title). */
import { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LightBrand } from '@/constants/light-theme';
import { DisplayFont } from '@/constants/theme';

type Props = PropsWithChildren<{ title: string; subtitle?: string; compact?: boolean }>;

export function LightAuthShell({ title, subtitle, compact, children }: Props) {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.content, compact && styles.contentCompact]} keyboardShouldPersistTaps="handled">
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
  root: { flex: 1, backgroundColor: LightBrand.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  contentCompact: { justifyContent: 'flex-start', paddingTop: 80 },
  brand: { marginBottom: 28 },
  wordmark: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 42, color: LightBrand.teal, letterSpacing: -0.5 },
  subLockup: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textSecondary, marginTop: 2 },
  title: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 26, color: LightBrand.navy, letterSpacing: -0.3 },
  subtitle: { fontFamily: 'Manrope_500Medium', fontSize: 14.5, color: LightBrand.textSecondary, marginTop: 6 },
  form: { marginTop: 24, gap: 14 },
});
