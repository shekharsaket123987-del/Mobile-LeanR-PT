/**
 * More tab — dual-branch. Pre-purchase light branch surfaces the screens
 * the mockup's "after demo" section reaches via links rather than tabs
 * (My Schedule, Coach Profile, My Concerns, Notifications, Profile).
 * Enrolled branch (mockup frame 16, "Profile & More") surfaces the
 * screens not promoted to the 5-tab bar — My Coach, Progress, Subscription
 * & Plans, My Concerns, Notifications, Profile.
 */
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightCard } from '@/components/light/light-card';
import { LightMenuRow } from '@/components/light/light-menu-row';
import { LightDestructiveButton } from '@/components/light/light-button';
import { useAuth } from '@/lib/auth/auth-context';
import { getLatestSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

const PRE_PURCHASE_ROWS: { label: string; href: '/sessions' | '/coach' | '/concerns' | '/notifications' | '/profile'; icon: 'calendar-outline' | 'person-circle-outline' | 'chatbox-ellipses-outline' | 'notifications-outline' | 'person-outline' }[] = [
  { label: 'My Schedule', href: '/sessions', icon: 'calendar-outline' },
  { label: 'Coach Profile', href: '/coach', icon: 'person-circle-outline' },
  { label: 'My Concerns', href: '/concerns', icon: 'chatbox-ellipses-outline' },
  { label: 'Notifications', href: '/notifications', icon: 'notifications-outline' },
  { label: 'Profile', href: '/profile', icon: 'person-outline' },
];

const ENROLLED_ROWS: {
  label: string;
  href: '/my-coach' | '/progress' | '/subscription' | '/concerns' | '/notifications' | '/profile';
  icon: 'person-circle-outline' | 'stats-chart-outline' | 'card-outline' | 'chatbox-ellipses-outline' | 'notifications-outline' | 'person-outline';
}[] = [
  { label: 'My Coach', href: '/my-coach', icon: 'person-circle-outline' },
  { label: 'Progress', href: '/progress', icon: 'stats-chart-outline' },
  { label: 'Subscription & Plans', href: '/subscription', icon: 'card-outline' },
  { label: 'My Concerns', href: '/concerns', icon: 'chatbox-ellipses-outline' },
  { label: 'Notifications', href: '/notifications', icon: 'notifications-outline' },
  { label: 'Profile', href: '/profile', icon: 'person-outline' },
];

function PrePurchaseMoreScreen() {
  const { session, signOut } = useAuth();

  return (
    <LightScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      <LightCard style={styles.card}>
        {PRE_PURCHASE_ROWS.map((row, i) => (
          <LightMenuRow key={row.label} label={row.label} icon={row.icon} onPress={() => router.push(row.href)} last={i === PRE_PURCHASE_ROWS.length - 1} />
        ))}
      </LightCard>

      <LightDestructiveButton size="lg" onPress={signOut} style={styles.signOut}>
        Sign out
      </LightDestructiveButton>
    </LightScreenScaffold>
  );
}

function EnrolledMoreScreen() {
  const { session, signOut } = useAuth();

  return (
    <LightScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      <LightCard style={styles.card}>
        {ENROLLED_ROWS.map((row, i) => (
          <LightMenuRow key={row.label} label={row.label} icon={row.icon} onPress={() => router.push(row.href)} last={i === ENROLLED_ROWS.length - 1} />
        ))}
      </LightCard>

      <LightDestructiveButton size="lg" onPress={signOut} style={styles.signOut}>
        Sign out
      </LightDestructiveButton>
    </LightScreenScaffold>
  );
}

export default function MoreScreen() {
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;
  return subscription ? <EnrolledMoreScreen /> : <PrePurchaseMoreScreen />;
}

const styles = StyleSheet.create({
  card: { paddingVertical: 4 },
  signOut: { marginTop: 4 },
});
