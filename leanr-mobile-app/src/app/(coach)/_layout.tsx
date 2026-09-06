/**
 * Coach tab bar — New PRD.md §4.B coach nav, relit to match the
 * "Coach Portal – Complete Features & Workflow" mockup's 5-tab bar
 * (Home/Clients/Schedule/Chats/More), replacing the dark `FloatingTabBar`
 * with the same `LightTabBar` the client portal uses. "Chats" is
 * promoted from a pushed screen to a real tab per the mockup; every
 * other coach screen stays reachable by push (`href: null`), same
 * convention as `(client)/_layout.tsx`.
 *
 * Also mounts `CoachPendingTasksGateModal` — New PRD.md §4.B "Global
 * Modal: Pending Tasks Gate" — the coach portal's equivalent of the
 * client portal's `GlobalGates`, which had no coach-side counterpart at
 * all before this pass (a real gap, not a stylistic one).
 *
 * `profile`/`notifications`/`more` are registered here under the file
 * names `coach-profile`/`coach-notifications`/`coach-more` (tab labels
 * are unaffected) because expo-router resolves route groups' children
 * against the same flat URL space — a same-named file in `(client)`
 * wins path resolution on a hard reload/deep link, bouncing a coach
 * through the client layout's role redirect before this group ever
 * mounts. Giving these three coach-only names keeps every other
 * `href: null` screen on its natural name since only these three clash
 * with `(client)`.
 */
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { ColorValue } from 'react-native';

import { CoachPendingTasksGateModal } from '@/components/gates/coach-pending-tasks-gate-modal';
import { LightTabBar } from '@/components/light/light-tab-bar';
import { useAuth } from '@/lib/auth/auth-context';
import { getHomeRouteForRole } from '@/lib/auth/role-routing';
import { getCoachPendingTasks } from '@/lib/data/coach-portal';
import type { Booking } from '@/lib/data/types';
import { registerPushToken } from '@/lib/notifications/register-push-token';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  return <Ionicons name={name} size={22} color={color as string} />;
}

function CoachGlobalGates() {
  const [tasks, setTasks] = useState<Booking[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCoachPendingTasks()
      .then((t) => {
        if (!cancelled) setTasks(t);
      })
      .catch(() => {
        if (!cancelled) setTasks([]); // fail open — a gate-status error should never block the app itself
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!tasks || tasks.length === 0 || dismissed) return null;

  return <CoachPendingTasksGateModal visible tasks={tasks} onDismiss={() => setDismissed(true)} />;
}

export default function CoachLayout() {
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
    <>
      <CoachGlobalGates />
      <Tabs tabBar={(props) => <LightTabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="index"
          options={{ title: 'Home', tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'home' : 'home-outline'} color={color} /> }}
        />
        <Tabs.Screen
          name="clients"
          options={{
            title: 'Clients',
            tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'people' : 'people-outline'} color={color} />,
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: 'Schedule',
            tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'calendar' : 'calendar-outline'} color={color} />,
          }}
        />
        <Tabs.Screen
          name="chats"
          options={{
            title: 'Chats',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="coach-more"
          options={{ title: 'More', tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'menu' : 'menu-outline'} color={color} /> }}
        />
        {/* Every other route in this group stays reachable (pushed, not
            tabbed). `href: null` is expo-router's documented way to keep a
            route in this group without a tab bar entry. */}
        <Tabs.Screen name="session/[id]" options={{ href: null }} />
        <Tabs.Screen name="clients/[id]" options={{ href: null, title: 'Client Details' }} />
        <Tabs.Screen name="pending-tasks" options={{ href: null, title: 'Pending Tasks' }} />
        <Tabs.Screen name="availability" options={{ href: null, title: 'Availability' }} />
        <Tabs.Screen name="leave-requests" options={{ href: null, title: 'Leave Requests' }} />
        <Tabs.Screen name="escalations" options={{ href: null, title: 'Escalations' }} />
        <Tabs.Screen name="renewals" options={{ href: null, title: 'Renewals' }} />
        <Tabs.Screen name="performance" options={{ href: null, title: 'Performance' }} />
        <Tabs.Screen name="coach-notifications" options={{ href: null, title: 'Notifications' }} />
        <Tabs.Screen name="coach-profile" options={{ href: null, title: 'Profile' }} />
        <Tabs.Screen name="chat/[id]" options={{ href: null, title: 'Chat' }} />
        <Tabs.Screen name="search" options={{ href: null, title: 'Search' }} />
      </Tabs>
    </>
  );
}
