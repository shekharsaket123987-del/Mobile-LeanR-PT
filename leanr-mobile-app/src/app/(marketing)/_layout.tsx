/**
 * Marketing tab bar — unauthenticated browsing shell (New PRD.md §4.D
 * public landing + the mockup's "Home/Plans/Reviews/More" pre-auth nav).
 * If a session already exists (user backed into `/welcome` while logged
 * in), redirect to their role's home — same pattern as `(auth)/_layout.tsx`.
 */
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { ColorValue } from 'react-native';

import { LightTabBar } from '@/components/light/light-tab-bar';
import { useAuth } from '@/lib/auth/auth-context';
import { getHomeRouteForRole } from '@/lib/auth/role-routing';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  return <Ionicons name={name} size={22} color={color as string} />;
}

export default function MarketingLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return null;
  if (session && profile) return <Redirect href={getHomeRouteForRole(profile.role)} />;

  return (
    <Tabs tabBar={(props) => <LightTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'home' : 'home-outline'} color={color} /> }}
      />
      <Tabs.Screen
        name="plans"
        options={{ title: 'Plans', tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'pricetag' : 'pricetag-outline'} color={color} /> }}
      />
      <Tabs.Screen
        name="reviews"
        options={{ title: 'Reviews', tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'star' : 'star-outline'} color={color} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'menu' : 'menu-outline'} color={color} /> }}
      />
    </Tabs>
  );
}
