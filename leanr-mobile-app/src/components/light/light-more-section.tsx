/**
 * LightMoreSection — a labelled group of `LightMenuRow`s inside a "More"
 * sheet/screen (client/coach/admin). Splitting a long flat row list into
 * headed groups keeps the admin portal's ~13-item list scannable instead
 * of one undifferentiated wall of rows.
 */
import { StyleSheet, Text, View } from 'react-native';

import { LightBrand } from '@/constants/light-theme';
import { LightCard } from './light-card';

export function LightMoreSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{title}</Text>
      <LightCard style={styles.card}>{children}</LightCard>
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
    color: LightBrand.textMuted,
    marginBottom: 6,
    marginLeft: 4,
  },
  card: { paddingVertical: 4 },
});
