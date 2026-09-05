/**
 * More tab — Subscription, My Concerns, Notifications, Profile
 * (LEANR_PT_NEXTGEN_APP_PRD.md §6). All four are real now; only
 * "Progress" stays a placeholder row (it's already its own tab, this
 * row predates that and is effectively vestigial).
 */
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ScreenScaffold } from '@/components/screen-scaffold';
import { DestructiveButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { MenuRow } from '@/components/ui/menu-row';
import { useAuth } from '@/lib/auth/auth-context';

const LINKED_ROWS: { label: string; href: '/subscription' | '/concerns' | '/notifications' | '/profile'; icon: 'card-outline' | 'chatbox-ellipses-outline' | 'notifications-outline' | 'person-outline' }[] = [
  { label: 'Subscription & Plans', href: '/subscription', icon: 'card-outline' },
  { label: 'My Concerns', href: '/concerns', icon: 'chatbox-ellipses-outline' },
  { label: 'Notifications', href: '/notifications', icon: 'notifications-outline' },
  { label: 'Profile', href: '/profile', icon: 'person-outline' },
];

export default function MoreScreen() {
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
