/**
 * Shared loading / empty / error states — LEANR_PT_MOBILE_PRD.md §26 /
 * transformation-plan §25: every screen must have an intentional state
 * here, not a bare spinner or framework default. Loading uses a skeleton
 * shimmer (a looping pulse is the one motion exception to "no idle
 * animation" — it communicates an in-flight operation and stops the
 * moment data arrives).
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Brand, Radius } from '@/constants/theme';
import { GhostButton } from './button';

export function Skeleton({ height = 16, width = '100%', radius = Radius.sm }: { height?: number; width?: number | `${number}%`; radius?: number }) {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.7, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: Brand.charcoal2 }, style]} />;
}

/** A generic card-shaped skeleton — matches the footprint of most GlassCard content. */
export function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <Skeleton height={12} width="40%" />
      <Skeleton height={28} width="65%" />
      <Skeleton height={12} width="55%" />
    </View>
  );
}

export function LoadingState({ rows = 2 }: { rows?: number }) {
  return (
    <View style={styles.gap} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.centered} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={28} color={Brand.alertRed} />
      <Text style={styles.errorText}>{message}</Text>
      <GhostButton size="sm" onPress={onRetry}>
        Try again
      </GhostButton>
    </View>
  );
}

export function EmptyState({
  message,
  icon = 'sparkles-outline',
  actionLabel,
  onAction,
}: {
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={26} color="rgba(255,255,255,0.4)" />
      </View>
      <Text style={styles.emptyText}>{message}</Text>
      {actionLabel && onAction && (
        <GhostButton size="sm" onPress={onAction}>
          {actionLabel}
        </GhostButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  skeletonCard: {
    borderRadius: Radius.md,
    backgroundColor: Brand.bgElevated,
    padding: 16,
    gap: 10,
  },
  centered: { paddingVertical: 36, alignItems: 'center', gap: 10 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#FFFFFF', textAlign: 'center', maxWidth: 260 },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', maxWidth: 260 },
});
