/**
 * Coach Chats (conversation list) — LEANR_PT_MOBILE_PRD.md §5 "Chat with
 * Clients". A coach has many clients, unlike the client app's single-
 * conversation Coach tab, so this is a list -> detail pair
 * (chat/[id].tsx). See src/lib/data/coach-chat.ts header for the
 * confirmed RLS.
 */
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { TextLink } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import { getMyConversations } from '@/lib/data/coach-chat';
import { useAsync } from '@/lib/data/use-async';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function CoachChatsScreen() {
  const { data: conversations, loading, error, reload } = useAsync(getMyConversations, []);

  return (
    <ScreenScaffold title="Chats">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (conversations?.length ?? 0) === 0 && <EmptyState message="No active conversations yet." />}
      {!loading &&
        !error &&
        conversations?.map((c) => (
          <Card key={c.id}>
            <View style={styles.row}>
              <Text style={shared.bigStat}>{c.clientName}</Text>
              {c.unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{c.unreadCount}</Text>
                </View>
              )}
            </View>
            {c.lastMessage && <Text style={styles.preview}>{c.lastMessage}</Text>}
            {c.lastMessageAt && <Text style={shared.cardLabel}>{formatTime(c.lastMessageAt)}</Text>}
            <TextLink
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
              style={styles.openLink}>
              Open chat →
            </TextLink>
          </Card>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { backgroundColor: Brand.yellow, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: Brand.black },
  preview: { fontFamily: 'Manrope_500Medium', fontSize: 14, marginTop: 2 },
  openLink: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: Brand.yellow, marginTop: 8 },
});
