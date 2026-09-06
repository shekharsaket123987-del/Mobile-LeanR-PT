/** LightLoadingState / LightErrorState / LightEmptyState — same API as ui/states.tsx, light palette. */
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { LightBrand, LightRadius } from '@/constants/light-theme';
import { LightGhostButton } from './light-button';

function LightSkeleton({ height = 16, width = '100%', radius = LightRadius.sm }: { height?: number; width?: number | `${number}%`; radius?: number }) {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.7, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: LightBrand.border }, style]} />;
}

function LightSkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <LightSkeleton height={12} width="40%" />
      <LightSkeleton height={28} width="65%" />
      <LightSkeleton height={12} width="55%" />
    </View>
  );
}

export function LightLoadingState({ rows = 2 }: { rows?: number }) {
  return (
    <View style={styles.gap} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <LightSkeletonCard key={i} />
      ))}
    </View>
  );
}

export function LightErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.centered} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={28} color={LightBrand.alertRed} />
      <Text style={styles.errorText}>{message}</Text>
      <LightGhostButton size="sm" onPress={onRetry}>
        Try again
      </LightGhostButton>
    </View>
  );
}

export function LightEmptyState({
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
        <Ionicons name={icon} size={26} color={LightBrand.textMuted} />
      </View>
      <Text style={styles.emptyText}>{message}</Text>
      {actionLabel && onAction && (
        <LightGhostButton size="sm" onPress={onAction}>
          {actionLabel}
        </LightGhostButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  skeletonCard: { borderRadius: LightRadius.md, backgroundColor: '#FFFFFF', padding: 16, gap: 10 },
  centered: { paddingVertical: 36, alignItems: 'center', gap: 10 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textPrimary, textAlign: 'center', maxWidth: 260 },
  emptyIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: LightBrand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textSecondary, textAlign: 'center', maxWidth: 260 },
});
