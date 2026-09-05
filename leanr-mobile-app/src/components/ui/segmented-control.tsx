/**
 * SegmentedControl — pill tab row with a sliding active indicator, used for
 * Sessions (Upcoming/Completed/Cancelled/Missed) and similar filter rows
 * (LEANR_PT_NEXTGEN_APP_PRD.md §7: "Segmented control, swipe-between-tabs").
 */
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Brand, Motion, Radius } from '@/constants/theme';

type SegmentOption<T extends string> = { key: T; label: string };

type Props<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
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
      {segmentWidth > 0 && (
        <Animated.View style={[styles.indicator, { width: segmentWidth }, indicatorStyle]} />
      )}
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
  wrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.pill,
    padding: 4,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    backgroundColor: Brand.yellow,
    borderRadius: Radius.pill,
  },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: 'rgba(255,255,255,0.55)' },
  labelActive: { color: Brand.black },
});
