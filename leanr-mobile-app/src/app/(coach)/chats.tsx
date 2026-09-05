/**
 * Coach Chats (conversation list) — LEANR_PT_MOBILE_PRD.md §5 "Chat with
 * Clients". A coach has many clients, unlike the client app's single-
 * conversation Coach tab, so this is a list -> detail pair
 * (chat/[id].tsx). See src/lib/data/coach-chat.ts header for the
 * confirmed RLS.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { GlassCard } from '@/components/ui/glass-card';
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
      {!loading && !error && (conversations?.length ?? 0) === 0 && <EmptyState message="No active conversations yet." icon="chatbubbles-outline" />}
      {!loading &&
        !error &&
        conversations?.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Open chat with ${c.clientName}`}>
            <GlassCard variant={c.unreadCount > 0 ? 'yellow' : 'default'}>
              <View style={styles.row}>
                <Text style={styles.name} numberOfLines={1}>
                  {c.clientName}
                </Text>
                {c.unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{c.unreadCount}</Text>
                  </View>
                )}
              </View>
              {c.lastMessage && (
                <Text style={styles.preview} numberOfLines={1}>
                  {c.lastMessage}
                </Text>
              )}
              <View style={styles.footerRow}>
                {c.lastMessageAt && <Text style={styles.time}>{formatTime(c.lastMessageAt)}</Text>}
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
              </View>
            </GlassCard>
          </Pressable>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#FFFFFF', flexShrink: 1 },
  badge: {
    backgroundColor: Brand.yellow,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: Brand.black },
  preview: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  time: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: 'rgba(255,255,255,0.4)' },
});
