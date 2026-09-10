/**
 * LightTabBar — plain white bottom bar (not floating/blurred, unlike
 * `ui/floating-tab-bar.tsx`) — matches the mockup's flat nav chrome.
 * Same `tabBar` render-prop signature so it drops into `<Tabs tabBar={...}>`
 * exactly like the dark one.
 *
 * Explicitly filters out any route registered with `options.href === null`
 * (the `(client)/_layout.tsx` convention for "reachable by push, not a tab
 * button") — confirmed via web preview that `state.routes` includes every
 * registered screen regardless of `href` on web (unlike native, where
 * expo-router's own default tab bar excludes them), so a custom `tabBar`
 * render prop must filter itself rather than assume the navigator already did.
 */
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';

import { LightBrand } from '@/constants/light-theme';

type TabBarProps = NonNullable<ComponentProps<typeof Tabs>['tabBar']> extends (props: infer P) => unknown ? P : never;

type Props = TabBarProps & {
  /** Route name (e.g. `"more"`, `"coach-more"`, `"admin-more"`) whose tab press should open a sheet instead of navigating. */
  moreRouteName?: string;
  /** Called instead of navigating when `moreRouteName`'s tab is pressed. */
  onMorePress?: () => void;
};

export function LightTabBar({ state, descriptors, navigation, moreRouteName, onMorePress }: Props) {
  const insets = useSafeAreaInsets();

  const visibleRoutes = state.routes.filter((route) => (descriptors[route.key].options as { href?: unknown }).href !== null);

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 8, height: 60 + insets.bottom }]}>
      {visibleRoutes.map((route) => {
        const index = state.routes.indexOf(route);
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label = (options.title ?? route.name) as string;
        const badge = options.tabBarBadge;

        const onPress = () => {
          if (route.name === moreRouteName && onMorePress) {
            onMorePress();
            return;
          }
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            style={styles.tabButton}
          >
            <View style={styles.iconWrap}>
              {options.tabBarIcon?.({
                focused,
                color: focused ? LightBrand.teal : LightBrand.textSecondary,
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
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: LightBrand.border,
    paddingTop: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11.5,
    color: LightBrand.textSecondary,
  },
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
