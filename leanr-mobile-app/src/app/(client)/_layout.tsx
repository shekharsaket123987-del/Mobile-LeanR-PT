/**
 * Client tab bar — dual-branch (New PRD.md pre-purchase redesign, then the
 * post-purchase light rebuild): a client who has never purchased anything
 * sees Home/Plans/Reviews/More (matching the mockup and the `(marketing)`
 * shell's own tab set for a seamless visual handoff across the login
 * boundary); once `hasEverPurchased`, the Active Client Portal's own 5-tab
 * bar renders — Home/Schedule/Plans/Chats/More, matching the "Complete
 * Journey After Plan Purchase" mockup. Both branches share the same
 * `LightTabBar`/light design system now — there is no dark tab bar left.
 *
 * Route files are shared between both branches (`index.tsx`, `plans.tsx`,
 * `sessions.tsx`, `coach.tsx`, `notifications.tsx`, `profile.tsx` each
 * internally branch on the same `hasEverPurchased` check) — see the
 * redesign plan's "dual-branch, not a global retheme" decision for why.
 *
 * This layout is also the route-group's auth/role gate — no session ->
 * /welcome; session but role isn't "client" -> that role's own home.
 */
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { ColorValue } from 'react-native';

import { GlobalGates } from '@/components/gates/global-gates';
import { LightTabBar } from '@/components/light/light-tab-bar';
import { useAuth } from '@/lib/auth/auth-context';
import { getHomeRouteForRole } from '@/lib/auth/role-routing';
import { getLatestSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';
import { registerPushToken } from '@/lib/notifications/register-push-token';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  return <Ionicons name={name} size={24} color={color as string} />;
}

export default function ClientLayout() {
  const { session, profile, loading } = useAuth();
  const { data: subscription, loading: subscriptionLoading } = useAsync(getLatestSubscription, [session?.user.id]);

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
  if (!session) return <Redirect href="/welcome" />;
  if (profile && profile.role !== 'client') return <Redirect href={getHomeRouteForRole(profile.role)} />;
  if (subscriptionLoading) return null;

  const hasEverPurchased = subscription !== null;

  if (!hasEverPurchased) {
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
        {/* Every other route in this group stays reachable (pushed, not tabbed) in both branches. */}
        <Tabs.Screen name="sessions" options={{ href: null, title: 'Sessions' }} />
        <Tabs.Screen name="coach" options={{ href: null, title: 'Coach' }} />
        <Tabs.Screen name="my-coach" options={{ href: null, title: 'My Coach' }} />
        <Tabs.Screen name="progress" options={{ href: null, title: 'Progress' }} />
        <Tabs.Screen name="book-session" options={{ href: null, title: 'Book a Session' }} />
        <Tabs.Screen name="reschedule/[id]" options={{ href: null, title: 'Reschedule' }} />
        <Tabs.Screen name="concerns" options={{ href: null, title: 'My Concerns' }} />
        <Tabs.Screen name="my-schedule" options={{ href: null, title: 'My Schedule' }} />
        <Tabs.Screen name="demo-booking" options={{ href: null, title: 'Book a Free Demo' }} />
        <Tabs.Screen name="notifications" options={{ href: null, title: 'Notifications' }} />
        <Tabs.Screen name="profile" options={{ href: null, title: 'Profile' }} />
        <Tabs.Screen name="payment-success" options={{ href: null, title: 'Payment Successful' }} />
        <Tabs.Screen name="activate" options={{ href: null, title: 'Activate Your Plan' }} />
        <Tabs.Screen name="onboarding" options={{ href: null, title: 'Onboarding' }} />
        <Tabs.Screen name="subscription" options={{ href: null, title: 'Subscription' }} />
      </Tabs>
    );
  }

  return (
    <>
      <GlobalGates />
      <Tabs tabBar={(props) => <LightTabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="index"
          options={{ title: 'Home', tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'home' : 'home-outline'} color={color} /> }}
        />
        <Tabs.Screen
          name="sessions"
          options={{
            title: 'Schedule',
            tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'calendar' : 'calendar-outline'} color={color} />,
          }}
        />
        <Tabs.Screen
          name="subscription"
          options={{ title: 'Plans', tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'pricetag' : 'pricetag-outline'} color={color} /> }}
        />
        <Tabs.Screen
          name="coach"
          options={{
            title: 'Chats',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{ title: 'More', tabBarIcon: ({ focused, color }) => <TabIcon name={focused ? 'menu' : 'menu-outline'} color={color} /> }}
        />
        {/* Every other route in this group stays reachable (pushed, not
            tabbed). `href: null` is expo-router's documented way to keep a
            route in this group without a tab bar entry. */}
        <Tabs.Screen name="my-coach" options={{ href: null, title: 'My Coach' }} />
        <Tabs.Screen name="progress" options={{ href: null, title: 'Progress' }} />
        <Tabs.Screen name="book-session" options={{ href: null, title: 'Book a Session' }} />
        <Tabs.Screen name="reschedule/[id]" options={{ href: null, title: 'Reschedule' }} />
        <Tabs.Screen name="concerns" options={{ href: null, title: 'My Concerns' }} />
        <Tabs.Screen name="my-schedule" options={{ href: null, title: 'My Schedule' }} />
        <Tabs.Screen name="demo-booking" options={{ href: null, title: 'Book a Free Demo' }} />
        <Tabs.Screen name="notifications" options={{ href: null, title: 'Notifications' }} />
        <Tabs.Screen name="profile" options={{ href: null, title: 'Profile' }} />
        <Tabs.Screen name="payment-success" options={{ href: null, title: 'Payment Successful' }} />
        <Tabs.Screen name="activate" options={{ href: null, title: 'Activate Your Plan' }} />
        <Tabs.Screen name="onboarding" options={{ href: null, title: 'Onboarding' }} />
        <Tabs.Screen name="plans" options={{ href: null, title: 'Plans' }} />
        <Tabs.Screen name="reviews" options={{ href: null, title: 'Reviews' }} />
      </Tabs>
    </>
  );
}
