/**
 * GlassCard / GlassPanel — the LEANR mobile glass surface, reproducing the
 * web app's `.glass` / `.glass-strong` / `.glass-yellow` utilities
 * (LEANR_PT_MOBILE_PRD.md §23) with `expo-blur` + `expo-linear-gradient`
 * instead of CSS `backdrop-filter` (cross-platform; `expo-glass-effect` is
 * iOS-26-only and would look inconsistent on Android/older iOS).
 *
 * Used for: cards, hero surfaces, section containers. Not every surface —
 * plain `View`s with a flat `Brand.bgElevated` fill are still correct for
 * dense list rows (coach/admin screens) where glass would just be noise.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { Brand, Glass, Radius, Shadow } from '@/constants/theme';

type Variant = 'default' | 'yellow' | 'strong';

type Props = PropsWithChildren<{
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  /** Disable the outer drop shadow — useful when nesting a GlassCard inside another one. */
  noShadow?: boolean;
  radius?: number;
}>;

export function GlassCard({ children, variant = 'default', style, noShadow, radius = Radius.md }: Props) {
  const isYellow = variant === 'yellow';
  const gradientColors = isYellow ? Glass.gradientYellow : Glass.gradient;
  const borderColor = isYellow ? Glass.borderYellow : Glass.border;
  const intensity = variant === 'strong' ? Glass.blurIntensityStrong : Glass.blurIntensity;

  return (
    <View style={[styles.wrap, { borderRadius: radius }, !noShadow && Shadow.card, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.border, { borderRadius: radius, borderColor }]} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

/** Heavier-blur variant for modals/bottom sheets/prominent panels (web's `.glass-strong`). */
export function GlassPanel({ children, style, radius = Radius.lg }: Omit<Props, 'variant' | 'noShadow'>) {
  return (
    <GlassCard variant="strong" style={style} radius={radius} noShadow>
      {children}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: Brand.bgElevated,
  },
  border: {
    ...StyleSheet.absoluteFill,
    borderWidth: StyleSheet.hairlineWidth * 1.5,
  },
  content: {
    padding: 16,
    gap: 6,
  },
});
