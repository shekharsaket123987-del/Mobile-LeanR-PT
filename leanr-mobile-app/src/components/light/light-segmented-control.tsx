/** LightSegmentedControl — same API/shape as ui/segmented-control.tsx, light palette. */
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { LightBrand, LightRadius } from '@/constants/light-theme';
import { Motion } from '@/constants/theme';

type SegmentOption<T extends string> = { key: T; label: string };

export function LightSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const segmentWidth = options.length > 0 ? width / options.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withTiming(index * segmentWidth, { duration: Motion.base, easing: Easing.out(Easing.cubic) });
  }, [index, segmentWidth, x]);

  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={styles.wrap} onLayout={onLayout} accessibilityRole="tablist">
      {segmentWidth > 0 && <Animated.View style={[styles.indicator, { width: segmentWidth }, indicatorStyle]} />}
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={styles.segment}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}>
            <Text style={[styles.label, selected && styles.labelActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: LightBrand.bg, borderRadius: LightRadius.pill, padding: 4, position: 'relative' },
  indicator: { position: 'absolute', top: 4, bottom: 4, left: 0, backgroundColor: LightBrand.teal, borderRadius: LightRadius.pill },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: LightBrand.textSecondary },
  labelActive: { color: '#FFFFFF' },
});
