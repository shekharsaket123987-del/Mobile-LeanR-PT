/**
 * Client bottom tab bar — LEANR_PT_NEXTGEN_APP_PRD.md §6.
 * Uses the JS `Tabs` (not NativeTabs) so we fully control brand styling
 * (yellow active state, black bar) instead of platform-default chrome —
 * matches Design Principle #5 (one disciplined, reused visual language).
 */
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { ColorValue, useColorScheme } from 'react-native';

import { Brand, Colors } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  return <Ionicons name={name} size={24} color={color as string} />;
}

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

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
    </Tabs>
  );
}
