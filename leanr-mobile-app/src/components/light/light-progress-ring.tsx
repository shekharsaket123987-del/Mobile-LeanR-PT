/**
 * LightProgressRing — light-palette port of `components/progress-ring.tsx`
 * (post-purchase relight, mockup frame 9/13). Same SVG/reanimated core;
 * only the track/stroke/value colors change (teal on navy, not yellow).
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { DisplayFont } from '@/constants/theme';
import { LightBrand } from '@/constants/light-theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  /** 0–1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  valueText?: string;
};

export function LightProgressRing({ progress, size = 160, strokeWidth = 14, label, valueText }: Props) {
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

  const accessibilityLabel = [valueText, label].filter(Boolean).join(' ');

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel || undefined}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(Math.max(progress, 0), 1) * 100) }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={LightBrand.border} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={LightBrand.teal}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
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
  value: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 28, color: LightBrand.navy },
  label: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: LightBrand.textSecondary },
});
