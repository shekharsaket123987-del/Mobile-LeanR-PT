/**
 * Chats tab (enrolled) / Coach Profile (pre-purchase) — dual-branch.
 *
 * Pre-purchase (mockup #4, unchanged by this pass): read-only coach
 * profile, no chat composer — matches both the mockup's "Not Available
 * (Until Plan Purchase): Client chat with coach" and New PRD.md §6 ("chat
 * is gated on 'has ever purchased', not on having a coach").
 *
 * Enrolled (mockup frame 12, "Chats"): real-time chat thread only. The
 * coach profile card + Request Coach Change flow that used to live on
 * this screen moved to `my-coach.tsx` (reached from More) — the mockup's
 * Chats frame shows no profile/coach-change UI at all for the enrolled
 * state, matching New PRD.md §21's own placement of "My Coach" as a
 * Profile-menu item rather than part of the chat screen.
 *
 * The mockup's "Coach / Support" segmented control is reproduced, but
 * "Support" is shown disabled: no live chat-with-admin feature exists
 * anywhere in the web app or PRD — only the async, written My Concerns
 * flow does — so wiring it to anything would be inventing functionality.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightAvatar } from '@/components/light/light-avatar';
import { LightCard } from '@/components/light/light-card';
import { LightMessageBubble, LightMessageInput } from '@/components/light/light-chat-thread';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import {
  getMyActiveConversation,
  getMessages,
  markMessagesRead,
  sendMessage,
  subscribeToConversation,
  uploadChatImage,
} from '@/lib/data/chat';
import { getMyCoach } from '@/lib/data/coach';
import { getLatestSubscription } from '@/lib/data/subscription';
import type { Message } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { pickChatImage, type PickedImage } from '@/lib/media/pick-chat-image';

/** Pre-purchase Coach Profile (mockup #4) — unchanged. */
function PrePurchaseCoachScreen() {
  const { data: coach, loading, error, reload } = useAsync(getMyCoach, []);

  return (
    <LightScreenScaffold title="Coach Profile">
      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && !coach && <LightEmptyState message="No coach assigned yet." icon="person-outline" />}
      {!loading && !error && coach && (
        <LightCard style={lightStyles.coachCard}>
          <View style={lightStyles.coachRow}>
            <LightAvatar photoUrl={coach.photo_url} name={coach.full_name} size={64} ring />
            <View style={lightStyles.coachInfo}>
              <Text style={lightStyles.coachName} numberOfLines={1}>
                {coach.full_name}
              </Text>
              {coach.specialization && (
                <Text style={lightStyles.coachSpecialty} numberOfLines={1}>
                  {coach.specialization}
                </Text>
              )}
              {coach.rating != null && <Text style={lightStyles.coachRating}>★ {coach.rating.toFixed(1)}</Text>}
            </View>
          </View>
          {coach.bio && <Text style={lightStyles.coachBio}>{coach.bio}</Text>}
        </LightCard>
      )}
    </LightScreenScaffold>
  );
}

type ChatTab = 'coach' | 'support';

/** Enrolled Chats (mockup frame 12) — pure message thread, light theme. */
function EnrolledChatsScreen() {
  const [tab, setTab] = useState<ChatTab>('coach');
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
  const [attaching, setAttaching] = useState(false);
  const [pendingImage, setPendingImage] = useState<PickedImage | null>(null);

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
    markMessagesRead(conversation.id, 'coach').catch(() => {});

    const unsubscribe = subscribeToConversation(conversation.id, (message, event) => {
      setMessages((prev) => {
        if (event === 'INSERT') {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        }
        return prev.map((m) => (m.id === message.id ? message : m));
      });
      if (event === 'INSERT' && message.sender_role === 'coach') {
        markMessagesRead(conversation.id, 'coach').catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [conversation]);

  const onSend = async () => {
    if (!conversation || (!draft.trim() && !pendingImage)) return;
    const body = draft.trim();
    const image = pendingImage;
    setDraft('');
    setPendingImage(null);
    setMessagesError(null);
    setSending(true);
    if (image) setAttaching(true);
    try {
      const attachmentUrl = image ? await uploadChatImage(conversation.id, image.uri, image.mimeType) : null;
      const sent = await sendMessage(conversation.id, { body: body || null, attachmentUrl });
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

  return (
    <LightScreenScaffold title="Chats">
      <LightSegmentedControl
        options={[
          { key: 'coach', label: coach?.full_name ?? 'Coach' },
          { key: 'support', label: 'Support' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'support' && (
        <LightCard>
          <LightEmptyState
            message="Live support chat isn't available yet — coming soon. To raise an issue today, use My Concerns from More."
            icon="construct-outline"
          />
        </LightCard>
      )}

      {tab === 'coach' && (
        <>
          {loading && <LightLoadingState />}
          {error && <LightErrorState message={error} onRetry={reload} />}
          {!loading && !error && !coach && <LightEmptyState message="No coach assigned yet." icon="person-outline" />}

          {!loading && !error && coach && (
            <View style={lightStyles.headerRow}>
              <LightAvatar photoUrl={coach.photo_url} name={coach.full_name} size={36} />
              <View>
                <Text style={lightStyles.coachNameSmall}>{coach.full_name}</Text>
                <View style={lightStyles.onlineRow}>
                  <View style={lightStyles.onlineDot} />
                  <Text style={lightStyles.onlineText}>Online</Text>
                </View>
              </View>
            </View>
          )}

          {!loading && !error && coach && !conversation && (
            <LightEmptyState message="No conversation with your coach yet." icon="chatbubble-outline" />
          )}

          {!loading && !error && conversation && (
            <>
              <View style={lightStyles.thread}>
                {messages.length === 0 && <LightEmptyState message="Say hello to your coach." icon="hand-left-outline" />}
                {messages.map((m) => (
                  <LightMessageBubble key={m.id} message={m} mine={m.sender_role === 'client'} />
                ))}
              </View>

              {messagesError && (
                <Text style={lightStyles.errorText} accessibilityRole="alert">
                  {messagesError}
                </Text>
              )}

              <LightMessageInput
                value={draft}
                onChangeText={setDraft}
                onSend={onSend}
                sending={sending}
                onAttach={onPickImage}
                attaching={attaching}
                pendingImage={pendingImage}
                onRemovePendingImage={() => setPendingImage(null)}
                placeholder={pendingImage ? 'Add a caption (optional)…' : 'Message your coach…'}
              />
            </>
          )}
        </>
      )}
    </LightScreenScaffold>
  );
}

export default function CoachScreen() {
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;
  return subscription ? <EnrolledChatsScreen /> : <PrePurchaseCoachScreen />;
}

const lightStyles = StyleSheet.create({
  coachCard: { gap: 10 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  coachInfo: { flexShrink: 1, gap: 3 },
  coachName: { fontFamily: 'Manrope_800ExtraBold', fontSize: 19, color: LightBrand.navy },
  coachSpecialty: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textSecondary },
  coachRating: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: LightBrand.amber },
  coachBio: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textSecondary, lineHeight: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coachNameSmall: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: LightBrand.navy },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: LightBrand.successEmerald },
  onlineText: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: LightBrand.textMuted },
  thread: { gap: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
});
