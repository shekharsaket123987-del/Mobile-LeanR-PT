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

import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
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
    <LightScreenScaffold title="Chats">
      <LightSegmentedControl
        options={TABS.map((t) => ({ ...t, label: counts[t.key] > 0 ? `${t.label} (${counts[t.key]})` : t.label }))}
        value={tab}
        onChange={setTab}
      />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <LightEmptyState message={`No ${tab} conversations.`} icon="chatbubbles-outline" />}
      {!loading &&
        !error &&
        filtered.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Open chat with ${c.clientName}`}>
            <LightCard variant={c.unreadCount > 0 ? 'teal' : 'default'}>
              <View style={styles.row}>
                <Text style={styles.name} numberOfLines={1}>
                  {c.clientName}
                </Text>
                {c.unreadCount > 0 && <LightBadge label={String(c.unreadCount)} tone="teal" />}
              </View>
              {c.lastMessage && (
                <Text style={styles.preview} numberOfLines={1}>
                  {c.lastMessage}
                </Text>
              )}
              <View style={styles.footerRow}>
                {c.lastMessageAt && <Text style={styles.time}>{formatTime(c.lastMessageAt)}</Text>}
                <Ionicons name="chevron-forward" size={16} color={LightBrand.textMuted} />
              </View>
            </LightCard>
          </Pressable>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: LightBrand.navy, flexShrink: 1 },
  preview: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textSecondary, marginTop: 2 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  time: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: LightBrand.textMuted },
});
