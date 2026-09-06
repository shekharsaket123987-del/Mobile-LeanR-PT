/**
 * Admin More — New PRD.md §4.C nav items not promoted to the 5-tab bar
 * (prompt4.md rule 19: "must remain accessible if they exist in the
 * PRD" — nothing hidden). Escalations carries the same red
 * unresolved-count badge the web app's own admin nav shows.
 */
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { LightCard } from '@/components/light/light-card';
import { LightDestructiveButton } from '@/components/light/light-button';
import { LightMenuRow } from '@/components/light/light-menu-row';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { useAuth } from '@/lib/auth/auth-context';
import { getAllEscalations } from '@/lib/data/admin-escalations';
import { useAsync } from '@/lib/data/use-async';

type Row = {
  label: string;
  href:
    | '/availability-check'
    | '/coach-change-requests'
    | '/leave'
    | '/shadow'
    | '/admin-escalations'
    | '/admin-renewals'
    | '/sales'
    | '/scheduling'
    | '/activity-log'
    | '/admin-notifications'
    | '/settings'
    | '/admin-profile'
    | '/admin-sessions';
  icon:
    | 'calendar-outline'
    | 'swap-horizontal-outline'
    | 'airplane-outline'
    | 'people-outline'
    | 'alert-circle-outline'
    | 'trending-up-outline'
    | 'cash-outline'
    | 'grid-outline'
    | 'document-text-outline'
    | 'notifications-outline'
    | 'settings-outline'
    | 'person-outline'
    | 'time-outline';
  badgeKey?: 'escalations';
};

const LINKED_ROWS: Row[] = [
  { label: 'Sessions', href: '/admin-sessions', icon: 'time-outline' },
  { label: 'Scheduling', href: '/scheduling', icon: 'grid-outline' },
  { label: 'Availability Check', href: '/availability-check', icon: 'calendar-outline' },
  { label: 'Coach Change Requests', href: '/coach-change-requests', icon: 'swap-horizontal-outline' },
  { label: 'Leave Requests', href: '/leave', icon: 'airplane-outline' },
  { label: 'Shadow Coverage', href: '/shadow', icon: 'people-outline' },
  { label: 'Escalations', href: '/admin-escalations', icon: 'alert-circle-outline', badgeKey: 'escalations' },
  { label: 'Renewal Opportunities', href: '/admin-renewals', icon: 'trending-up-outline' },
  { label: 'Sales', href: '/sales', icon: 'cash-outline' },
  { label: 'Activity Log', href: '/activity-log', icon: 'document-text-outline' },
  { label: 'Notifications', href: '/admin-notifications', icon: 'notifications-outline' },
  { label: 'Settings', href: '/settings', icon: 'settings-outline' },
  { label: 'Profile', href: '/admin-profile', icon: 'person-outline' },
];

export default function AdminMore() {
  const { session, signOut } = useAuth();
  const { data: activeEscalations } = useAsync(() => getAllEscalations('active'), []);
  const escalationCount = activeEscalations?.length ?? 0;

  return (
    <LightScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      <LightCard style={styles.card}>
        {LINKED_ROWS.map((row, i) => (
          <LightMenuRow
            key={row.label}
            label={row.label}
            icon={row.icon}
            badge={row.badgeKey === 'escalations' && escalationCount > 0 ? escalationCount : undefined}
            onPress={() => router.push(row.href)}
            last={i === LINKED_ROWS.length - 1}
          />
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
