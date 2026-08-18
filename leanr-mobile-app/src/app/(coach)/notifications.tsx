/**
 * Notifications (coach) — LEANR_PT_MOBILE_PRD.md §5. See
 * src/lib/data/notifications.ts header for why routing is by
 * `template_key` substring rather than `related_entity_type/id` (the
 * latter is confirmed always null in live data). Coach chat isn't built
 * yet (see Coach More's remaining placeholder rows), so a
 * `new_chat_message`-style notification here just marks read without
 * navigating anywhere.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { TextLink } from '@/components/tappable';
import { Brand } from '@/constants/theme';
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

export default function CoachNotificationsScreen() {
  const { data: notifications, loading, error, reload } = useAsync(getMyNotifications, []);
  const hasUnread = (notifications ?? []).some((n) => !n.read);

  const onPress = async (notification: NotificationRow) => {
    if (!notification.read) {
      markNotificationRead(notification.id).catch(() => {});
    }
    const category = routeCategoryForTemplateKey(notification.template_key);
    const target = category ? COACH_ROUTES[category] : null;
    if (target) router.push(target);
    reload();
  };

  const onMarkAllRead = async () => {
    await markAllNotificationsRead().catch(() => {});
    reload();
  };

  return (
    <ScreenScaffold title="Notifications">
      {hasUnread && (
        <TextLink onPress={onMarkAllRead} style={styles.markAllLink}>
          Mark all as read
        </TextLink>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (notifications?.length ?? 0) === 0 && <EmptyState message="No notifications yet." />}
      {!loading &&
        !error &&
        notifications?.map((n) => (
          <Pressable key={n.id} onPress={() => onPress(n)} accessibilityRole="button" accessibilityLabel={n.title}>
            <Card>
              <View style={styles.row}>
                {!n.read && <View style={styles.dot} />}
                <Text style={[shared.bigStat, styles.title]}>{n.title}</Text>
              </View>
              <Text style={styles.message}>{n.message}</Text>
              <Text style={shared.cardLabel}>{formatDate(n.created_at)}</Text>
            </Card>
          </Pressable>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  markAllLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.yellow, alignSelf: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.yellow },
  title: { fontSize: 20 },
  message: { fontFamily: 'Manrope_500Medium', fontSize: 14, marginTop: 2 },
});
