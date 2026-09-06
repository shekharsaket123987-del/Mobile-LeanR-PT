/**
 * Admin tab bar — LEANR_PT_MOBILE_PRD.md §28 Phase 12: "either full
 * admin parity or a deliberately reduced 'on-call ops' subset... flag
 * this scope decision to the user before starting, since admin is
 * inherently desk-bound work." Flagged, and the reduced subset was
 * chosen: Escalations, Leave Requests, Shadow Coverage — the
 * time-sensitive ones a person might genuinely need to act on from a
 * phone, not full admin parity (18 screens: coach/client CRUD, sales,
 * reports, settings, etc. — explicitly out of scope for mobile per
 * §25/§26's own recommendation).
 *
 * Same JS-`Tabs` role-gate pattern as (client)/(coach) — no session ->
 * /login; session but role isn't admin -> that role's own home.
 */
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { ColorValue, useColorScheme } from 'react-native';

import { FloatingTabBar } from '@/components/ui/floating-tab-bar';
import { Brand, Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { getHomeRouteForRole } from '@/lib/auth/role-routing';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  return <Ionicons name={name} size={22} color={color as string} />;
}

export default function AdminLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  const { session, profile, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/welcome" />;
  if (profile && profile.role !== 'admin') return <Redirect href={getHomeRouteForRole(profile.role)} />;

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
          title: 'Escalations',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'alert-circle' : 'alert-circle-outline'} color={focused ? Brand.yellow : color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: 'Leave',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'calendar' : 'calendar-outline'} color={focused ? Brand.yellow : color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shadow"
        options={{
          title: 'Coverage',
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
      <Tabs.Screen name="escalation/[id]" options={{ href: null }} />
    </Tabs>
  );
}
