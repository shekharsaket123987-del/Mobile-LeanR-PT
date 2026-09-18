/**
 * Coach Chats (conversation list) — New PRD.md §4.B: 4 tabs (Active/Old/
 * Expired/Pause, derived from conversation + client subscription status
 * — see coach-chat.ts header for the exact quoted categorization logic).
 * The mockup's "Clients/Team" split isn't reproduced — there's no
 * coach-to-coach/admin chat schema anywhere; this real 4-way
 * categorization is what the PRD actually specifies for this screen.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { getMyConversations, type ChatCategory } from '@/lib/data/coach-chat';
import { useAsync } from '@/lib/data/use-async';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const TABS: { key: ChatCategory; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'old', label: 'Old' },
  { key: 'expired', label: 'Expired' },
  { key: 'pause', label: 'Pause' },
];

export default function CoachChatsScreen() {
  const { data: conversations, loading, error, reload } = useAsync(getMyConversations, []);
  const [tab, setTab] = useState<ChatCategory>('active');

  const counts = useMemo(() => {
    const c: Record<ChatCategory, number> = { active: 0, old: 0, expired: 0, pause: 0 };
    for (const conv of conversations ?? []) c[conv.category]++;
    return c;
  }, [conversations]);

  const filtered = (conversations ?? []).filter((c) => c.category === tab);

  return (
    <ScreenScaffold title="Chats">
      <SegmentedControl
        options={TABS.map((t) => ({ ...t, label: counts[t.key] > 0 ? `${t.label} (${counts[t.key]})` : t.label }))}
        value={tab}
        onChange={setTab}
      />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <EmptyState message={`No ${tab} conversations.`} icon="chatbubbles-outline" />}
      {!loading &&
        !error &&
        filtered.map((c) => (
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
                {c.unreadCount > 0 && <Badge label={String(c.unreadCount)} tone="yellow" />}
              </View>
              {c.lastMessage && (
                <Text style={styles.preview} numberOfLines={1}>
                  {c.lastMessage}
                </Text>
              )}
              <View style={styles.footerRow}>
                {c.lastMessageAt && <Text style={styles.time}>{formatTime(c.lastMessageAt)}</Text>}
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.45)" />
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
  preview: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  time: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: 'rgba(255,255,255,0.45)' },
});
