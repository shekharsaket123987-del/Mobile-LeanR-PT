/**
 * More tab — dual-branch. Pre-purchase light branch surfaces the screens
 * the mockup's "after demo" section reaches via links rather than tabs
 * (My Schedule, Coach Profile, My Concerns, Notifications, Profile).
 * Enrolled branch (mockup frame 16, "Profile & More") surfaces the
 * screens not promoted to the 5-tab bar — My Coach, Progress, Subscription
 * & Plans, My Concerns, Notifications, Profile. Grouped into headed
 * sections for scannability, matching the coach/admin More sheets.
 */
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { LightDestructiveButton } from '@/components/light/light-button';
import { LightMenuRow } from '@/components/light/light-menu-row';
import { LightMoreSection } from '@/components/light/light-more-section';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { useAuth } from '@/lib/auth/auth-context';
import { getLatestSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

type PrePurchaseRow = {
  label: string;
  href: '/sessions' | '/coach' | '/concerns' | '/notifications' | '/profile';
  icon: 'calendar-outline' | 'person-circle-outline' | 'chatbox-ellipses-outline' | 'notifications-outline' | 'person-outline';
};

type EnrolledRow = {
  label: string;
  href: '/my-coach' | '/progress' | '/subscription' | '/concerns' | '/notifications' | '/profile';
  icon:
    | 'person-circle-outline'
    | 'stats-chart-outline'
    | 'card-outline'
    | 'chatbox-ellipses-outline'
    | 'notifications-outline'
    | 'person-outline';
};

const PRE_PURCHASE_GROUPS: { section: string; rows: PrePurchaseRow[] }[] = [
  {
    section: 'Training',
    rows: [
      { label: 'My Schedule', href: '/sessions', icon: 'calendar-outline' },
      { label: 'Coach Profile', href: '/coach', icon: 'person-circle-outline' },
    ],
  },
  {
    section: 'Account',
    rows: [
      { label: 'My Concerns', href: '/concerns', icon: 'chatbox-ellipses-outline' },
      { label: 'Notifications', href: '/notifications', icon: 'notifications-outline' },
      { label: 'Profile', href: '/profile', icon: 'person-outline' },
    ],
  },
];

const ENROLLED_GROUPS: { section: string; rows: EnrolledRow[] }[] = [
  {
    section: 'My Training & Plan',
    rows: [
      { label: 'My Coach', href: '/my-coach', icon: 'person-circle-outline' },
      { label: 'Progress', href: '/progress', icon: 'stats-chart-outline' },
      { label: 'Subscription & Plans', href: '/subscription', icon: 'card-outline' },
    ],
  },
  {
    section: 'Account',
    rows: [
      { label: 'My Concerns', href: '/concerns', icon: 'chatbox-ellipses-outline' },
      { label: 'Notifications', href: '/notifications', icon: 'notifications-outline' },
      { label: 'Profile', href: '/profile', icon: 'person-outline' },
    ],
  },
];

/** Row list + sign-out button, no outer page chrome — shared by the routed screen below and `(client)/_layout.tsx`'s More sheet. */
export function ClientMoreContent({ hasEverPurchased, onNavigate }: { hasEverPurchased: boolean; onNavigate?: (href: string) => void }) {
  const { signOut } = useAuth();
  const groups = hasEverPurchased ? ENROLLED_GROUPS : PRE_PURCHASE_GROUPS;
  const go = (href: string) => (onNavigate ? onNavigate(href) : router.push(href as Parameters<typeof router.push>[0]));

  return (
    <>
      {groups.map((group) => (
        <LightMoreSection key={group.section} title={group.section}>
          {group.rows.map((row, i) => (
            <LightMenuRow
              key={row.label}
              label={row.label}
              icon={row.icon}
              onPress={() => go(row.href)}
              last={i === group.rows.length - 1}
            />
          ))}
        </LightMoreSection>
      ))}

      <LightDestructiveButton size="lg" onPress={signOut} style={styles.signOut}>
        Sign out
      </LightDestructiveButton>
    </>
  );
}

export default function MoreScreen() {
  const { session } = useAuth();
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;

  return (
    <LightScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      <ClientMoreContent hasEverPurchased={subscription !== null} />
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  signOut: { marginTop: 4 },
});
