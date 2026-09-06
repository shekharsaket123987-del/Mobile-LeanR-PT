/** LightScreenScaffold — same API as components/screen-scaffold.tsx, light palette, no top glow gradient (flat background, matches the mockup). */
import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LightBrand } from '@/constants/light-theme';
import { DisplayFont } from '@/constants/theme';

type Props = PropsWithChildren<{ title: string; subtitle?: string }>;

export function LightScreenScaffold({ title, subtitle, children }: Props) {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LightBrand.bg },
  safeArea: { flex: 1 },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 28, letterSpacing: -0.3, color: LightBrand.navy },
  subtitle: { fontFamily: 'Manrope_500Medium', fontSize: 15, marginTop: -8, color: LightBrand.textSecondary },
});
