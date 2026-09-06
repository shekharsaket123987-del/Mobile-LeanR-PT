/**
 * LightCard — flat white card with a soft ambient shadow, the mockup's
 * one surface treatment (no glass/blur, unlike `ui/glass-card.tsx`).
 */
import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { LightBrand, LightRadius, LightShadow } from '@/constants/light-theme';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'teal';
  noShadow?: boolean;
  radius?: number;
}>;

export function LightCard({ children, style, variant = 'default', noShadow, radius = LightRadius.md }: Props) {
  return (
    <View
      style={[
        styles.base,
        { borderRadius: radius },
        variant === 'teal' ? styles.teal : styles.white,
        !noShadow && LightShadow.card,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { padding: 16, gap: 6 },
  white: { backgroundColor: LightBrand.card, borderWidth: 1, borderColor: LightBrand.border },
  teal: { backgroundColor: LightBrand.tealSoft, borderWidth: 1, borderColor: 'rgba(18,165,148,0.25)' },
});
