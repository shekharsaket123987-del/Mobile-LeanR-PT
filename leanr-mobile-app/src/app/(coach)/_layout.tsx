/**
 * Coach tab bar — LEANR_PT_NEXTGEN_APP_PRD.md §6 coach nav, §7 "kept
 * dense/functional per Design Principle #5 (coach app ≠ motivation
 * surface)" — lighter design investment than the client app, same
 * underlying pattern (JS Tabs, role gate in the layout).
 */
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { ColorValue, useColorScheme } from 'react-native';

import { FloatingTabBar } from '@/components/ui/floating-tab-bar';
import { Brand, Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { getHomeRouteForRole } from '@/lib/auth/role-routing';
import { registerPushToken } from '@/lib/notifications/register-push-token';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  return <Ionicons name={name} size={22} color={color as string} />;
}

export default function CoachLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (!session) return;
    registerPushToken().then(({ error }) => {
      if (error) console.log('[push] not registered:', error);
    });
  }, [session]);

  if (loading) return null;
  if (!session) return <Redirect href="/welcome" />;
  if (profile && profile.role !== 'coach') return <Redirect href={getHomeRouteForRole(profile.role)} />;

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Brand.black,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.backgroundElement },
        tabBarActiveBackgroundColor: colors.background,
        tabBarLabelStyle: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} color={focused ? Brand.yellow : color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'calendar' : 'calendar-outline'} color={focused ? Brand.yellow : color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'people' : 'people-outline'} color={focused ? Brand.yellow : color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'menu' : 'menu-outline'} color={focused ? Brand.yellow : color} />
          ),
        }}
      />
      <Tabs.Screen name="session/[id]" options={{ href: null }} />
      <Tabs.Screen name="availability" options={{ href: null, title: 'Availability' }} />
      <Tabs.Screen name="escalations" options={{ href: null, title: 'Escalations' }} />
      <Tabs.Screen name="renewals" options={{ href: null, title: 'Renewals' }} />
      <Tabs.Screen name="performance" options={{ href: null, title: 'Performance' }} />
      <Tabs.Screen name="notifications" options={{ href: null, title: 'Notifications' }} />
      <Tabs.Screen name="profile" options={{ href: null, title: 'Profile' }} />
      <Tabs.Screen name="chats" options={{ href: null, title: 'Chats' }} />
      <Tabs.Screen name="chat/[id]" options={{ href: null, title: 'Chat' }} />
      <Tabs.Screen name="search" options={{ href: null, title: 'Search' }} />
    </Tabs>
  );
}
