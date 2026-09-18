/**
 * Coach Chat Thread — New PRD.md §4.B: mirrors the client Coach tab's
 * chat thread but for a specific conversation, sending as
 * `sender_role='coach'`. Reuses chat.ts's generic pieces directly
 * (`sendMessage`/`markMessagesRead` take a `senderRole`) and the same
 * `MessageBubble`/`MessageInput` the client Chats tab uses.
 * Closed conversations are read-only (PRD: "A new coach has been
 * assigned to this client — you can still see this history, but can't
 * send new messages") — the composer is hidden and this exact copy shown
 * instead, not just an error on send.
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MessageBubble, MessageInput } from '@/components/ui/chat-thread';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { getMessages, markMessagesRead, sendMessage, subscribeToConversation, uploadChatImage } from '@/lib/data/chat';
import { getMyConversations } from '@/lib/data/coach-chat';
import { getErrorMessage } from '@/lib/data/errors';
import type { Message } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { pickChatImage, type PickedImage } from '@/lib/media/pick-chat-image';

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
        if (!cancelled) setMessagesError(getErrorMessage(err));
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
      setMessagesError(getErrorMessage(err));
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
        {messages.length === 0 && <EmptyState message="No messages yet." icon="chatbubble-outline" />}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} mine={m.sender_role === 'coach'} />
        ))}
      </View>

      {messagesError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {messagesError}
        </Text>
      )}

      {conversation.readOnly ? (
        <Text style={styles.readOnlyNote}>
          A new coach has been assigned to this client — you can still see this history, but can&apos;t send new messages.
        </Text>
      ) : (
        <MessageInput
          value={draft}
          onChangeText={setDraft}
          onSend={onSend}
          sending={sending}
          onAttach={onPickImage}
          attaching={attaching}
          pendingImage={pendingImage}
          onRemovePendingImage={() => setPendingImage(null)}
          placeholder={pendingImage ? 'Add a caption (optional)…' : 'Message your client…'}
        />
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  thread: { gap: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  readOnlyNote: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 18 },
});
