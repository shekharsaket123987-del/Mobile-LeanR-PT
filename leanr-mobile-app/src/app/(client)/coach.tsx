/**
 * Coach tab — LEANR_PT_NEXTGEN_APP_PRD.md §9.5 "Unified Coach tab: coach
 * card up top... chat thread below" — coach profile (unchanged) plus a
 * real-time text chat thread (LEANR_PT_MOBILE_PRD.md §20), wired against
 * the live schema (see src/lib/data/chat.ts header for exactly what was
 * confirmed on 2026-08-18).
 *
 * Text messages only — image attachments (`chat-attachments` storage
 * bucket, confirmed to exist) aren't wired up; that needs a native image
 * picker dependency this repo doesn't have yet, see README open items.
 * Layout is the same single-ScrollView shell every other screen uses
 * (Design Principle #5) rather than a pinned keyboard-avoiding input bar
 * — a reasonable first pass for a low-volume PT coaching chat, not a
 * high-frequency messaging app; a docked input bar is a fair polish-pass
 * upgrade later.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Brand, Colors } from '@/constants/theme';
import { getMyActiveConversation, getMessages, markCoachMessagesRead, sendMessage, subscribeToConversation } from '@/lib/data/chat';
import { getMyCoach } from '@/lib/data/coach';
import type { Message } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function CoachScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [coach, conversation] = await Promise.all([getMyCoach(), getMyActiveConversation()]);
    return { coach, conversation };
  }, []);

  const coach = data?.coach ?? null;
  const conversation = data?.conversation ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!conversation) return;
    let cancelled = false;

    getMessages(conversation.id)
      .then((result) => {
        if (!cancelled) setMessages(result);
      })
      .catch((err) => {
        if (!cancelled) setMessagesError(err instanceof Error ? err.message : String(err));
      });
    markCoachMessagesRead(conversation.id).catch(() => {});

    const unsubscribe = subscribeToConversation(conversation.id, (message, event) => {
      setMessages((prev) => {
        if (event === 'INSERT') {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        }
        return prev.map((m) => (m.id === message.id ? message : m));
      });
      if (event === 'INSERT' && message.sender_role === 'coach') {
        markCoachMessagesRead(conversation.id).catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [conversation]);

  const onSend = async () => {
    if (!conversation || !draft.trim()) return;
    const body = draft.trim();
    setDraft('');
    setMessagesError(null);
    setSending(true);
    try {
      const sent = await sendMessage(conversation.id, body);
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (err) {
      setMessagesError(err instanceof Error ? err.message : String(err));
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <ScreenScaffold title="Your Coach">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && !coach && <EmptyState message="No coach assigned yet." />}
      {!loading && !error && coach && (
        <Card>
          <Text style={shared.cardLabel}>COACH</Text>
          <Text style={shared.bigStat}>{coach.full_name}</Text>
          {coach.bio && <Text style={shared.cardLabel}>{coach.bio}</Text>}
        </Card>
      )}

      {!loading && !error && coach && !conversation && (
        <EmptyState message="No conversation with your coach yet." />
      )}

      {!loading && !error && conversation && (
        <>
          <View style={styles.thread}>
            {messages.length === 0 && <EmptyState message="Say hello to your coach." />}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </View>

          {messagesError && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {messagesError}
            </Text>
          )}

          <MessageInput value={draft} onChangeText={setDraft} onSend={onSend} sending={sending} />
        </>
      )}
    </ScreenScaffold>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  const isMine = message.sender_role === 'client';

  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, { backgroundColor: isMine ? Brand.yellow : colors.backgroundElement }]}>
        {message.body && (
          <Text style={[styles.bubbleText, { color: isMine ? Brand.black : colors.text }]}>{message.body}</Text>
        )}
        <View style={styles.bubbleMeta}>
          <Text style={[styles.bubbleTime, { color: isMine ? 'rgba(0,0,0,0.6)' : colors.textSecondary }]}>
            {formatMessageTime(message.created_at)}
          </Text>
          {isMine && (
            <Text style={[styles.receipt, message.read_at && styles.receiptRead]}>{message.read_at ? '✓✓' : '✓'}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function MessageInput({
  value,
  onChangeText,
  onSend,
  sending,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  const canSend = value.trim().length > 0 && !sending;

  return (
    <View style={[styles.inputRow, { backgroundColor: colors.backgroundElement }]}>
      <TextInput
        style={[styles.input, { color: colors.text }]}
        placeholder="Message your coach…"
        placeholderTextColor={colors.textSecondary}
        value={value}
        onChangeText={onChangeText}
        multiline
        accessibilityLabel="Message your coach"
      />
      <Pressable
        onPress={onSend}
        disabled={!canSend}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}>
        <Text style={styles.sendButtonText}>Send</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { gap: 8 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  bubbleText: { fontFamily: 'Manrope_500Medium', fontSize: 15 },
  bubbleMeta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 },
  bubbleTime: { fontFamily: 'Manrope_500Medium', fontSize: 11 },
  receipt: { fontFamily: 'Manrope_500Medium', fontSize: 11, color: 'rgba(0,0,0,0.5)' },
  receiptRead: { color: Brand.successEmerald },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderRadius: 20,
    padding: 8,
  },
  input: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 15, maxHeight: 100, paddingVertical: 8, paddingHorizontal: 8 },
  sendButton: { backgroundColor: Brand.yellow, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: Brand.black },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
