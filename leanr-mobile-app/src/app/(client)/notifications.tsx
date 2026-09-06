/**
 * Notifications (client) — one light screen for both pre-purchase and
 * enrolled clients (the post-purchase relight removed the last reason
 * these needed to differ). Same data/routing logic either way — see
 * src/lib/data/notifications.ts header for why routing is by
 * `template_key` substring rather than `related_entity_type/id`. All/
 * System segmented filter matches mockup #5.
 *
 * Reached from More ("Notifications") or the Home bell icon — not a tab
 * itself, hidden via `href: null` in the (client) layout.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightCard } from '@/components/light/light-card';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  routeCategoryForTemplateKey,
  type NotificationRow,
} from '@/lib/data/notifications';
import { useAsync } from '@/lib/data/use-async';

const CLIENT_ROUTES: Record<string, '/sessions' | '/coach' | '/concerns'> = {
  sessions: '/sessions',
  chat: '/coach',
  concerns: '/concerns',
  coach: '/coach',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type FilterTab = 'all' | 'system';

export default function ClientNotificationsScreen() {
  const [tab, setTab] = useState<FilterTab>('all');
  const { data: notifications, loading, error, reload } = useAsync(getMyNotifications, []);
  const hasUnread = (notifications ?? []).some((n) => !n.read);
  const filtered = (notifications ?? []).filter((n) => (tab === 'system' ? n.type === 'system' : true));

  const onPress = async (notification: NotificationRow) => {
    if (!notification.read) markNotificationRead(notification.id).catch(() => {});
    const category = routeCategoryForTemplateKey(notification.template_key);
    const target = category ? CLIENT_ROUTES[category] : null;
    if (target) router.push(target);
    reload();
  };

  return (
    <LightScreenScaffold title="Notifications">
      <LightSegmentedControl
        options={[
          { key: 'all', label: 'All' },
          { key: 'system', label: 'System' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {hasUnread && (
        <Pressable onPress={() => markAllNotificationsRead().then(reload).catch(() => {})} accessibilityRole="button">
          <Text style={lightStyles.markAllText}>Mark all as read</Text>
        </Pressable>
      )}

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <LightEmptyState message="No notifications yet." icon="notifications-off-outline" />}
      {!loading &&
        !error &&
        filtered.map((n) => (
          <Pressable key={n.id} onPress={() => onPress(n)} accessibilityRole="button" accessibilityLabel={n.title}>
            <LightCard variant={n.read ? 'default' : 'teal'}>
              <View style={lightStyles.row}>
                {!n.read && <View style={lightStyles.dot} />}
                <Text style={lightStyles.title} numberOfLines={1}>
                  {n.title}
                </Text>
              </View>
              <Text style={lightStyles.message}>{n.message}</Text>
              <Text style={lightStyles.date}>{formatDate(n.created_at)}</Text>
            </LightCard>
          </Pressable>
        ))}
    </LightScreenScaffold>
  );
}

const lightStyles = StyleSheet.create({
  markAllText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: LightBrand.teal, alignSelf: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LightBrand.teal },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: LightBrand.navy, flexShrink: 1 },
  message: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textSecondary, marginTop: 2 },
  date: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: LightBrand.textMuted, marginTop: 6 },
});
