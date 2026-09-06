/**
 * Notifications (coach) — New PRD.md §4.B, reuses the client portal's
 * `NotificationsClient` component on web verbatim. Relit + adds an
 * All/Clients/System filter matching the mockup (mirrors the same
 * pattern already built for the client portal's own Notifications
 * screen) — "Clients" is real non-`system` notification types, not a
 * fabricated category.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
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

const COACH_ROUTES: Record<string, '/schedule' | '/escalations'> = {
  sessions: '/schedule',
  concerns: '/escalations',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type FilterTab = 'all' | 'clients' | 'system';

export default function CoachNotificationsScreen() {
  const { data: notifications, loading, error, reload } = useAsync(getMyNotifications, []);
  const [tab, setTab] = useState<FilterTab>('all');
  const hasUnread = (notifications ?? []).some((n) => !n.read);
  const filtered = (notifications ?? []).filter((n) => (tab === 'all' ? true : tab === 'system' ? n.type === 'system' : n.type !== 'system'));

  const onPress = async (notification: NotificationRow) => {
    if (!notification.read) markNotificationRead(notification.id).catch(() => {});
    const category = routeCategoryForTemplateKey(notification.template_key);
    const target = category ? COACH_ROUTES[category] : null;
    if (target) router.push(target);
    reload();
  };

  return (
    <LightScreenScaffold title="Notifications">
      <LightSegmentedControl
        options={[
          { key: 'all', label: 'All' },
          { key: 'clients', label: 'Clients' },
          { key: 'system', label: 'System' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {hasUnread && (
        <Pressable onPress={() => markAllNotificationsRead().then(reload).catch(() => {})} accessibilityRole="button">
          <Text style={styles.markAllText}>Mark all as read</Text>
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
              <View style={styles.row}>
                {!n.read && <View style={styles.dot} />}
                <Text style={styles.title} numberOfLines={1}>
                  {n.title}
                </Text>
              </View>
              <Text style={styles.message}>{n.message}</Text>
              <Text style={styles.date}>{formatDate(n.created_at)}</Text>
            </LightCard>
          </Pressable>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  markAllText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: LightBrand.teal, alignSelf: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LightBrand.teal },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: LightBrand.navy, flexShrink: 1 },
  message: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textSecondary, marginTop: 2 },
  date: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: LightBrand.textMuted, marginTop: 6 },
});
