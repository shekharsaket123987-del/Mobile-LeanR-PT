/**
 * Client tab bar — LEANR_PT_NEXTGEN_APP_PRD.md §6.
 * Uses the JS `Tabs` (not NativeTabs) so we fully control brand styling
 * (yellow active state, black bar) instead of platform-default chrome —
 * matches Design Principle #5 (one disciplined, reused visual language).
 *
 * This layout is also the route-group's auth/role gate — the mobile
 * equivalent of the web app's middleware (LEANR_PT_MOBILE_PRD.md §4):
 * no session -> /login; session but role isn't "client" -> that role's
 * own home via getHomeRouteForRole (coach -> (coach) app, admin -> the
 * role-not-supported screen, per LEANR_PT_NEXTGEN_APP_PRD.md §16).
 */
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { ColorValue, useColorScheme } from 'react-native';

import { Brand, Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { getHomeRouteForRole } from '@/lib/auth/role-routing';
import { registerPushToken } from '@/lib/notifications/register-push-token';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  return <Ionicons name={name} size={24} color={color as string} />;
}

export default function ClientLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (!session) return;
    // Fire-and-forget: registration failure (no device, permission denied,
    // missing push_tokens table) should never block the client app from
    // being usable — see src/lib/notifications/register-push-token.ts for
    // exactly what this does and doesn't do.
    registerPushToken().then(({ error }) => {
      if (error) console.log('[push] not registered:', error);
    });
  }, [session]);

  if (loading) return null; // launch animation overlay (root _layout) is still covering the screen
  if (!session) return <Redirect href="/login" />;
  if (profile && profile.role !== 'client') return <Redirect href={getHomeRouteForRole(profile.role)} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Brand.black,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.backgroundElement,
        },
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
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'calendar' : 'calendar-outline'} color={focused ? Brand.yellow : color} />
          ),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
              color={focused ? Brand.yellow : color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'stats-chart' : 'stats-chart-outline'} color={focused ? Brand.yellow : color} />
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
      {/* Book a Session / Reschedule — reachable via router.push, not tabs
          themselves (Design Principle #5: don't add extra tabs for
          occasional actions). `href: null` is expo-router's documented
          way to keep a route in this group without a tab bar entry. */}
      <Tabs.Screen name="book-session" options={{ href: null, title: 'Book a Session' }} />
      <Tabs.Screen name="reschedule/[id]" options={{ href: null, title: 'Reschedule' }} />
      <Tabs.Screen name="concerns" options={{ href: null, title: 'My Concerns' }} />
      <Tabs.Screen name="my-schedule" options={{ href: null, title: 'My Schedule' }} />
    </Tabs>
  );
}
