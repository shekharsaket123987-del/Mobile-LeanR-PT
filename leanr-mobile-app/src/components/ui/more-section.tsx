/**
 * MoreSection — a labelled group of `MenuRow`s inside a "More" sheet/screen
 * (client/coach/admin). Splitting a long flat row list into headed groups
 * keeps the admin portal's ~13-item list scannable instead of one
 * undifferentiated wall of rows. Dark counterpart of light-more-section.tsx.
 */
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from './glass-card';

export function MoreSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{title}</Text>
      <GlassCard style={styles.card}>{children}</GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  heading: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 6,
    marginLeft: 4,
  },
  card: { paddingVertical: 4 },
});
