/**
 * Shared shell for Phase-0 placeholder screens: brand background, safe
 * area, scroll container, and a title in the Anton bold-italic display
 * style (LEANR_PT_NEXTGEN_APP_PRD.md §4.2). Screens in later phases
 * (§9 Key Screen Specs) replace the body content, not this shell.
 */
import { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, Colors, DisplayFont } from '@/constants/theme';

type Props = PropsWithChildren<{ title: string; subtitle?: string }>;

export function ScreenScaffold({ title, subtitle, children }: Props) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export function Card({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  return <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>{children}</View>;
}

/** Shared inline states for the useAsync-backed screens (§9). */
export function LoadingState() {
  return (
    <View style={styles.centeredState}>
      <ActivityIndicator color={Brand.yellow} />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <Text style={styles.cardLabel} accessibilityRole="alert">
        SOMETHING WENT WRONG
      </Text>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable
        onPress={onRetry}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={styles.retryLinkWrap}>
        <Text style={styles.retryLink}>Try again</Text>
      </Pressable>
    </Card>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.centeredState}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 48 },
  title: {
    fontFamily: DisplayFont,
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 28,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    marginTop: -8,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    gap: 6,
  },
  cardLabel: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    opacity: 0.7,
  },
  bigStat: {
    fontFamily: DisplayFont,
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 40,
    color: Brand.yellow,
  },
  ctaButton: {
    backgroundColor: Brand.yellow,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: Brand.black,
  },
  centeredState: { paddingVertical: 32, alignItems: 'center' },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  retryLinkWrap: { alignSelf: 'flex-start', marginTop: 4 },
  retryLink: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: Brand.yellow },
  emptyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, opacity: 0.6 },
});
