/**
 * LightTabBar — plain white bottom bar (not floating/blurred, unlike
 * `ui/floating-tab-bar.tsx`) — matches the mockup's flat nav chrome.
 * Same `tabBar` render-prop signature so it drops into `<Tabs tabBar={...}>`
 * exactly like the dark one.
 */
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';

import { LightBrand } from '@/constants/light-theme';

type TabBarProps = NonNullable<ComponentProps<typeof Tabs>['tabBar']> extends (props: infer P) => unknown ? P : never;

export function LightTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 8, height: 60 + insets.bottom }]}>
      {state.routes.map((route, index) => {
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
              {options.tabBarIcon?.({ focused, color: focused ? LightBrand.teal : LightBrand.textMuted, size: 22 })}
              {badge != null && badge !== '' && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {String(badge)}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: LightBrand.border,
    paddingTop: 8,
  },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  iconWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'Manrope_600SemiBold', fontSize: 10.5, color: LightBrand.textMuted },
  labelActive: { color: LightBrand.teal, fontFamily: 'Manrope_700Bold' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: LightBrand.alertRed,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 9, color: '#FFFFFF' },
});
