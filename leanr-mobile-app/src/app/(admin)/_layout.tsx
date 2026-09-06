/**
 * Admin tab bar — New PRD.md §4.C / mobile-app-reference/prompt4.md:
 * STRICT 1:1 functional parity with the web Admin Portal (17 screens),
 * reversing the earlier reduced-scope decision (see git history —
 * previously Escalations/Leave/Shadow only). Relit to match the approved
 * "Admin Portal – Complete Features & Workflow" reference image's 5-tab
 * bar (Home/Clients/Coaches/Reports/More), same `LightTabBar` shell the
 * Coach portal already uses.
 *
 * Every other admin screen (Search, Sessions, Availability Check, Coach
 * Change Requests, Leave Requests, Shadow Coverage, Escalations,
 * Renewals, Sales, Scheduling, Reports detail, Activity Log,
 * Notifications, Settings, Profile) stays reachable by push
 * (`href: null`), same convention as `(coach)/_layout.tsx` — nothing is
 * hidden, per prompt4.md rule 19.
 *
 * `more`/`profile`/`notifications` are registered under prefixed file
 * names (`admin-more`/`admin-profile`/`admin-notifications`) to avoid
 * the same flat-URL-space collision with `(client)`/`(coach)`'s
 * same-named routes documented in `(coach)/_layout.tsx`'s header.
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

export default function AdminLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/welcome" />;
  if (profile && profile.role !== 'admin') return <Redirect href={getHomeRouteForRole(profile.role)} />;

  return (
    <Tabs tabBar={(props) => <LightTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'home' : 'home-outline'} color={color} /> }}
      />
      <Tabs.Screen
        name="admin-clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'people' : 'people-outline'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="coaches"
        options={{
          title: 'Coaches',
          tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'barbell' : 'barbell-outline'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'bar-chart' : 'bar-chart-outline'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin-more"
        options={{ title: 'More', tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'menu' : 'menu-outline'} color={color} /> }}
      />
      {/* Reachable by push only — kept out of the tab bar via href:null.
          Names prefixed `admin-` where the bare name would otherwise
          collide with an identically-named route already registered in
          (client)/(coach) — same flat-URL-space hazard documented in
          (coach)/_layout.tsx's header (clients, search, renewals,
          escalations, sessions all clash with existing coach/client
          screens). */}
      <Tabs.Screen name="admin-search" options={{ href: null, title: 'Search' }} />
      <Tabs.Screen name="admin-clients/[id]" options={{ href: null, title: 'Client Details' }} />
      <Tabs.Screen name="admin-clients/new" options={{ href: null, title: 'Add Client' }} />
      <Tabs.Screen name="coaches/[id]" options={{ href: null, title: 'Coach Details' }} />
      <Tabs.Screen name="coaches/new" options={{ href: null, title: 'Add Coach' }} />
      <Tabs.Screen name="admin-sessions" options={{ href: null, title: 'Sessions' }} />
      <Tabs.Screen name="admin-sessions/[id]" options={{ href: null, title: 'Session Details' }} />
      <Tabs.Screen name="availability-check" options={{ href: null, title: 'Availability Check' }} />
      <Tabs.Screen name="coach-change-requests" options={{ href: null, title: 'Coach Change Requests' }} />
      <Tabs.Screen name="leave" options={{ href: null, title: 'Leave Requests' }} />
      <Tabs.Screen name="shadow" options={{ href: null, title: 'Shadow Coverage' }} />
      <Tabs.Screen name="admin-escalations" options={{ href: null, title: 'Escalations' }} />
      <Tabs.Screen name="escalation/[id]" options={{ href: null, title: 'Escalation' }} />
      <Tabs.Screen name="admin-renewals" options={{ href: null, title: 'Renewal Opportunities' }} />
      <Tabs.Screen name="sales" options={{ href: null, title: 'Sales' }} />
      <Tabs.Screen name="scheduling" options={{ href: null, title: 'Scheduling' }} />
      <Tabs.Screen name="activity-log" options={{ href: null, title: 'Activity Log' }} />
      <Tabs.Screen name="admin-notifications" options={{ href: null, title: 'Notifications' }} />
      <Tabs.Screen name="settings" options={{ href: null, title: 'Settings' }} />
      <Tabs.Screen name="admin-profile" options={{ href: null, title: 'Profile' }} />
    </Tabs>
  );
}
