/**
 * Coach More — New PRD.md §4.B nav items not promoted to the 5-tab bar
 * (mockup frame 16): Global Client Search, Availability Management,
 * Leave Requests, Renewals, Escalations, Performance, Notifications,
 * Profile. "Chats" dropped from this list since it's now a real tab
 * (Stage A) — no need for a duplicate entry point. No "Activity Log"/
 * "Notification Settings"/"Help & Support" rows — admin-only or
 * non-existent anywhere in the PRD for the coach role. Grouped into
 * headed sections (Workflow/Business/Account) for scannability.
 */
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { LightDestructiveButton } from '@/components/light/light-button';
import { LightMenuRow } from '@/components/light/light-menu-row';
import { LightMoreSection } from '@/components/light/light-more-section';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { useAuth } from '@/lib/auth/auth-context';

type Row = {
  label: string;
  href:
    | '/search'
    | '/availability'
    | '/leave-requests'
    | '/shadow-assignments'
    | '/renewals'
    | '/escalations'
    | '/performance'
    | '/coach-notifications'
    | '/coach-profile';
  icon:
    | 'search-outline'
    | 'calendar-outline'
    | 'airplane-outline'
    | 'shield-checkmark-outline'
    | 'trending-up-outline'
    | 'alert-circle-outline'
    | 'bar-chart-outline'
    | 'notifications-outline'
    | 'person-outline';
};

const GROUPS: { section: string; rows: Row[] }[] = [
  {
    section: 'Workflow',
    rows: [
      { label: 'Global Client Search', href: '/search', icon: 'search-outline' },
      { label: 'Availability Management', href: '/availability', icon: 'calendar-outline' },
      { label: 'Leave Requests', href: '/leave-requests', icon: 'airplane-outline' },
      { label: 'My Shadow Assignments', href: '/shadow-assignments', icon: 'shield-checkmark-outline' },
    ],
  },
  {
    section: 'Business',
    rows: [
      { label: 'Renewals', href: '/renewals', icon: 'trending-up-outline' },
      { label: 'Escalations', href: '/escalations', icon: 'alert-circle-outline' },
      { label: 'Performance', href: '/performance', icon: 'bar-chart-outline' },
    ],
  },
  {
    section: 'Account',
    rows: [
      { label: 'Notifications', href: '/coach-notifications', icon: 'notifications-outline' },
      { label: 'Profile', href: '/coach-profile', icon: 'person-outline' },
    ],
  },
];

/** Row list + sign-out button, no outer page chrome — shared by the routed screen below and `(coach)/_layout.tsx`'s More sheet. */
export function CoachMoreContent({ onNavigate }: { onNavigate?: (href: string) => void }) {
  const { signOut } = useAuth();
  const go = (href: Row['href']) => (onNavigate ? onNavigate(href) : router.push(href));

  return (
    <>
      {GROUPS.map((group) => (
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

export default function CoachMore() {
  const { session } = useAuth();

  return (
    <LightScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      <CoachMoreContent />
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  signOut: { marginTop: 4 },
});
