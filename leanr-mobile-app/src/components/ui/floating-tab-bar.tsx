/**
 * FloatingTabBar — replaces expo-router/React Navigation's default flat
 * tab bar chrome with a floating glass pill (LEANR_PT_MOBILE_PRD.md §24
 * "floating controls... bottom navigation" direction). Pass as the `tabBar`
 * render prop on `<Tabs>` in (client)/_layout.tsx and (coach)/_layout.tsx —
 * it reads the same `state`/`descriptors`/`navigation` the default bar
 * gets, so routing, role gates, and `href: null` hidden screens all keep
 * working unchanged; only the visual chrome changes.
 *
 * A single sliding yellow indicator (measured off the bar's own layout,
 * not per-icon) animates between evenly-spaced tabs — the one deliberate
 * signature motion in the nav layer.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';

import { Brand, Glass, Motion, Radius, Shadow } from '@/constants/theme';

type TabBarProps = NonNullable<ComponentProps<typeof Tabs>['tabBar']> extends (props: infer P) => unknown ? P : never;

export function FloatingTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const routes = state.routes;
  const segmentWidth = routes.length > 0 ? barWidth / routes.length : 0;
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    indicatorX.value = withTiming(state.index * segmentWidth, {
      duration: Motion.base,
      easing: Easing.out(Easing.cubic),
    });
  }, [state.index, segmentWidth, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: indicatorX.value }] }));

  return (
    <View pointerEvents="box-none" style={[styles.floatWrap, { bottom: insets.bottom + 10 }]}>
      <View style={[styles.bar, Shadow.soft]} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
        <BlurView intensity={Glass.blurIntensityStrong} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={Glass.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.border} />

        {segmentWidth > 0 && (
          <Animated.View style={[styles.indicator, { width: segmentWidth }, indicatorStyle]}>
            <View style={styles.indicatorPill} />
          </Animated.View>
        )}

        {routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = (options.title ?? route.name) as string;
          const badge = options.tabBarBadge;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              style={styles.tabButton}>
              <View style={styles.iconWrap}>
                {options.tabBarIcon?.({
                  focused,
                  color: focused ? Brand.black : 'rgba(255,255,255,0.55)',
                  size: 22,
                })}
                {badge != null && badge !== '' && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText} numberOfLines={1}>
                      {String(badge)}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const BAR_HEIGHT = 60;

const styles = StyleSheet.create({
  floatWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  bar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    backgroundColor: Brand.bgElevated,
  },
  border: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 1.5,
    borderColor: Glass.border,
  },
  indicator: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Brand.yellow,
    ...Shadow.glow,
  },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Brand.alertRed,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Brand.bgElevated,
  },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 9, color: '#FFFFFF' },
});
