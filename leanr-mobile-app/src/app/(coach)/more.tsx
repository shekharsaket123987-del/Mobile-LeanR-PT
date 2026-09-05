/**
 * Coach More — Availability, Escalations, Performance, Search, Renewals,
 * Notifications, Profile, Chats (LEANR_PT_MOBILE_PRD.md §5 coach nav).
 * All eight rows are now real — this completes §28 Phase 11 to the
 * extent buildable from this mobile-only repo.
 */
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ScreenScaffold } from '@/components/screen-scaffold';
import { DestructiveButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { MenuRow } from '@/components/ui/menu-row';
import { useAuth } from '@/lib/auth/auth-context';

const LINKED_ROWS: {
  label: string;
  href: '/availability' | '/escalations' | '/renewals' | '/performance' | '/notifications' | '/profile' | '/chats' | '/search';
  icon: 'calendar-outline' | 'chatbubbles-outline' | 'alert-circle-outline' | 'bar-chart-outline' | 'search-outline' | 'trending-up-outline' | 'notifications-outline' | 'person-outline';
}[] = [
  { label: 'Availability', href: '/availability', icon: 'calendar-outline' },
  { label: 'Chats', href: '/chats', icon: 'chatbubbles-outline' },
  { label: 'Escalations', href: '/escalations', icon: 'alert-circle-outline' },
  { label: 'Performance', href: '/performance', icon: 'bar-chart-outline' },
  { label: 'Search', href: '/search', icon: 'search-outline' },
  { label: 'Renewals', href: '/renewals', icon: 'trending-up-outline' },
  { label: 'Notifications', href: '/notifications', icon: 'notifications-outline' },
  { label: 'Profile', href: '/profile', icon: 'person-outline' },
];

export default function CoachMore() {
  const { session, signOut } = useAuth();

  return (
    <ScreenScaffold title="More" subtitle={session?.user.email ?? undefined}>
      <GlassCard style={styles.card}>
        {LINKED_ROWS.map((row, i) => (
          <MenuRow
            key={row.label}
            label={row.label}
            icon={row.icon}
            onPress={() => router.push(row.href)}
            last={i === LINKED_ROWS.length - 1}
          />
        ))}
      </GlassCard>

      <DestructiveButton size="lg" onPress={signOut} style={styles.signOut}>
        Sign out
      </DestructiveButton>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 4 },
  signOut: { marginTop: 4 },
});
