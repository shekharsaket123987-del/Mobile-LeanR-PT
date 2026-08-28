/**
 * Coach Chat Thread — LEANR_PT_MOBILE_PRD.md §5/§20. Mirrors the
 * client Coach tab's chat thread (src/app/(client)/coach.tsx) but for a
 * specific conversation, sending as `sender_role='coach'`. Reuses
 * chat.ts's generic pieces directly (`sendMessage`/`markMessagesRead`
 * take a `senderRole` exactly for this) rather than a coach-specific
 * copy of the insert/update logic — only the UI is duplicated, same
 * per-screen-component convention as the rest of this app (Design
 * Principle #5 is about a consistent visual language, not shared
 * component code across the two independent portals). Camera capture +
 * captions alongside an image now both work — see
 * src/lib/media/pick-chat-image.ts, shared with the client-side thread.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { Brand, Colors } from '@/constants/theme';
import { getMessages, markMessagesRead, sendMessage, subscribeToConversation, uploadChatImage } from '@/lib/data/chat';
import { getMyConversations } from '@/lib/data/coach-chat';
import type { Message } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { pickChatImage, type PickedImage } from '@/lib/media/pick-chat-image';

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function CoachChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: conversations, loading, error, reload } = useAsync(getMyConversations, []);
  const conversation = conversations?.find((c) => c.id === id) ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [pendingImage, setPendingImage] = useState<PickedImage | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    getMessages(id)
      .then((result) => {
        if (!cancelled) setMessages(result);
      })
      .catch((err) => {
        if (!cancelled) setMessagesError(err instanceof Error ? err.message : String(err));
      });
    markMessagesRead(id, 'client').catch(() => {});

    const unsubscribe = subscribeToConversation(id, (message, event) => {
      setMessages((prev) => {
        if (event === 'INSERT') {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        }
        return prev.map((m) => (m.id === message.id ? message : m));
      });
      if (event === 'INSERT' && message.sender_role === 'client') {
        markMessagesRead(id, 'client').catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [id]);

  const onSend = async () => {
    if (!id || (!draft.trim() && !pendingImage)) return;
    const body = draft.trim();
    const image = pendingImage;
    setDraft('');
    setPendingImage(null);
    setMessagesError(null);
    setSending(true);
    if (image) setAttaching(true);
    try {
      const attachmentUrl = image ? await uploadChatImage(id, image.uri, image.mimeType) : null;
      const sent = await sendMessage(id, { body: body || null, attachmentUrl }, 'coach');
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (err) {
      setMessagesError(err instanceof Error ? err.message : String(err));
      setDraft(body);
      setPendingImage(image);
    } finally {
      setSending(false);
      setAttaching(false);
    }
  };

  const onPickImage = async () => {
    const picked = await pickChatImage();
    if (picked) setPendingImage(picked);
  };

  if (loading) {
    return (
      <ScreenScaffold title="Chat">
        <LoadingState />
      </ScreenScaffold>
    );
  }

  if (error) {
    return (
      <ScreenScaffold title="Chat">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  if (!conversation) {
    return (
      <ScreenScaffold title="Chat">
        <EmptyState message="Conversation not found." />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title={conversation.clientName}>
      <View style={styles.thread}>
        {messages.length === 0 && <EmptyState message="No messages yet." />}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </View>

      {messagesError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {messagesError}
        </Text>
      )}

      <MessageInput
        value={draft}
        onChangeText={setDraft}
        onSend={onSend}
        sending={sending}
        onAttach={onPickImage}
        attaching={attaching}
        pendingImage={pendingImage}
        onRemovePendingImage={() => setPendingImage(null)}
      />
    </ScreenScaffold>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  const isMine = message.sender_role === 'coach';

  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, { backgroundColor: isMine ? Brand.yellow : colors.backgroundElement }]}>
        {message.attachment_url && (
          <Image source={{ uri: message.attachment_url }} style={styles.attachmentImage} contentFit="cover" />
        )}
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
  onAttach,
  attaching,
  pendingImage,
  onRemovePendingImage,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  onAttach: () => void;
  attaching: boolean;
  pendingImage: PickedImage | null;
  onRemovePendingImage: () => void;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  const canSend = (value.trim().length > 0 || pendingImage !== null) && !sending;

  return (
    <View>
      {pendingImage && (
        <View style={styles.pendingImageRow}>
          <Image source={{ uri: pendingImage.uri }} style={styles.pendingImageThumb} contentFit="cover" />
          <Pressable
            onPress={onRemovePendingImage}
            disabled={attaching}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            style={styles.pendingImageRemove}>
            <Text style={styles.pendingImageRemoveText}>✕</Text>
          </Pressable>
        </View>
      )}
      <View style={[styles.inputRow, { backgroundColor: colors.backgroundElement }]}>
        <Pressable
          onPress={onAttach}
          disabled={attaching}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Attach a photo"
          accessibilityState={{ disabled: attaching, busy: attaching }}
          style={[styles.attachButton, attaching && styles.sendButtonDisabled]}>
          <Text style={styles.attachButtonText}>{attaching ? '…' : '📷'}</Text>
        </Pressable>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder={pendingImage ? 'Add a caption (optional)…' : 'Message your client…'}
          placeholderTextColor={colors.textSecondary}
          value={value}
          onChangeText={onChangeText}
          multiline
          accessibilityLabel="Message your client"
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
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { gap: 8 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  bubbleText: { fontFamily: 'Manrope_500Medium', fontSize: 15 },
  attachmentImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },
  bubbleMeta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 },
  bubbleTime: { fontFamily: 'Manrope_500Medium', fontSize: 11 },
  receipt: { fontFamily: 'Manrope_500Medium', fontSize: 11, color: 'rgba(0,0,0,0.5)' },
  receiptRead: { color: Brand.successEmerald },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 20, padding: 8 },
  input: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 15, maxHeight: 100, paddingVertical: 8, paddingHorizontal: 8 },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  attachButtonText: { fontSize: 18 },
  pendingImageRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  pendingImageThumb: { width: 56, height: 56, borderRadius: 10 },
  pendingImageRemove: {
    marginLeft: -12,
    marginTop: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Brand.alertRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingImageRemoveText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Manrope_700Bold' },
  sendButton: { backgroundColor: Brand.yellow, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: Brand.black },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
