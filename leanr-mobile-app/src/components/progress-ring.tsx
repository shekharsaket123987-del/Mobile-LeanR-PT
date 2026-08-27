/**
 * ProgressRing — LEANR_PT_NEXTGEN_APP_PRD.md §9.3/§14 component inventory
 * ("SVG circular stat", carried forward from the web app's existing
 * ProgressRing per original PRD §23). Animates its fill on mount/update
 * rather than snapping (§4.3 motion principle: "progress rings fill
 * rather than snap").
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Brand, DisplayFont } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  /** 0–1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  valueText?: string;
};

export function ProgressRing({ progress, size = 160, strokeWidth = 14, label, valueText }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(Math.min(Math.max(progress, 0), 1), {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, animatedProgress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  // Collapse the SVG + two text nodes into one screen-reader-focusable
  // element that announces the actual number, not "ring" or two
  // disconnected text reads (LEANR_PT_NEXTGEN_APP_PRD.md §12).
  const accessibilityLabel = [valueText, label].filter(Boolean).join(' ');

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel || undefined}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(Math.max(progress, 0), 1) * 100) }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={Brand.charcoal2}
          strokeWidth={strokeWidth}
          fill="none"
          opacity={0.25}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={Brand.yellow}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          // Start from the top (12 o'clock) rather than SVG's default 3 o'clock.
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.center}>
        {valueText && <Text style={styles.value}>{valueText}</Text>}
        {label && <Text style={styles.label}>{label}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center' },
  value: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 28, color: Brand.yellow },
  label: { fontFamily: 'Manrope_500Medium', fontSize: 12, opacity: 0.7 },
});
