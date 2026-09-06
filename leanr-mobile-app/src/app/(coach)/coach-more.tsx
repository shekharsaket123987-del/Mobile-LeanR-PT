/**
 * Coach More — New PRD.md §4.B nav items not promoted to the 5-tab bar
 * (mockup frame 16): Global Client Search, Availability Management,
 * Leave Requests, Renewals, Escalations, Performance, Notifications,
 * Profile. "Chats" dropped from this list since it's now a real tab
 * (Stage A) — no need for a duplicate entry point. No "Activity Log"/
 * "Notification Settings"/"Help & Support" rows — admin-only or
 * non-existent anywhere in the PRD for the coach role.
 */
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { LightCard } from '@/components/light/light-card';
import { LightDestructiveButton } from '@/components/light/light-button';
import { LightMenuRow } from '@/components/light/light-menu-row';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { useAuth } from '@/lib/auth/auth-context';

const LINKED_ROWS: {
  label: string;
  href: '/search' | '/availability' | '/leave-requests' | '/renewals' | '/escalations' | '/performance' | '/coach-notifications' | '/coach-profile';
  icon:
    | 'search-outline'
    | 'calendar-outline'
    | 'airplane-outline'
    | 'trending-up-outline'
    | 'alert-circle-outline'
    | 'bar-chart-outline'
    | 'notifications-outline'
    | 'person-outline';
}[] = [
  { label: 'Global Client Search', href: '/search', icon: 'search-outline' },
  { label: 'Availability Management', href: '/availability', icon: 'calendar-outline' },
  { label: 'Leave Requests', href: '/leave-requests', icon: 'airplane-outline' },
  { label: 'Renewals', href: '/renewals', icon: 'trending-up-outline' },
  { label: 'Escalations', href: '/escalations', icon: 'alert-circle-outline' },
  { label: 'Performance', href: '/performance', icon: 'bar-chart-outline' },
  { label: 'Notifications', href: '/coach-notifications', icon: 'notifications-outline' },
  { label: 'Profile', href: '/coach-profile', icon: 'person-outline' },
];

export default function CoachMore() {
  const { session, signOut } = useAuth();

  return (
    <LightScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      <LightCard style={styles.card}>
        {LINKED_ROWS.map((row, i) => (
          <LightMenuRow key={row.label} label={row.label} icon={row.icon} onPress={() => router.push(row.href)} last={i === LINKED_ROWS.length - 1} />
        ))}
      </LightCard>

      <LightDestructiveButton size="lg" onPress={signOut} style={styles.signOut}>
        Sign out
      </LightDestructiveButton>
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 4 },
  signOut: { marginTop: 4 },
});
