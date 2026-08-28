/**
 * Coach tab — LEANR_PT_NEXTGEN_APP_PRD.md §9.5 "Unified Coach tab: coach
 * card up top... 'message'/'request change' affordances... chat thread
 * below" — coach profile, a "Request Coach Change" affordance
 * (LEANR_PT_MOBILE_PRD.md §7e, see src/lib/data/coach-change.ts for a
 * real structural boundary this pass found there), and a real-time text
 * chat thread (§20), wired against the live schema (see
 * src/lib/data/chat.ts header for exactly what was confirmed on
 * 2026-08-18).
 *
 * Text + image messages, with an optional caption alongside an image
 * (single message row, both `body` and `attachment_url` set — the
 * schema always supported this, it just wasn't wired). Camera capture
 * is now a real second option alongside the photo library (see
 * src/lib/media/pick-chat-image.ts) — both were previously documented
 * as first-pass cuts. See src/lib/data/chat.ts header for the confirmed
 * upload-path/RLS shape. Layout is the same single-ScrollView shell
 * every other screen uses (Design Principle #5) rather than a pinned
 * keyboard-avoiding input bar — a reasonable first pass for a
 * low-volume PT coaching chat, not a high-frequency messaging app; a
 * docked input bar is a fair polish-pass upgrade later.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton } from '@/components/tappable';
import { Brand, Colors } from '@/constants/theme';
import {
  getMyActiveConversation,
  getMessages,
  markMessagesRead,
  sendMessage,
  subscribeToConversation,
  uploadChatImage,
} from '@/lib/data/chat';
import { getMyCoach } from '@/lib/data/coach';
import {
  getMyCoachChangeRequests,
  requestCoachChange,
  type CoachChangeRequest,
  type CoachChangeStatus,
} from '@/lib/data/coach-change';
import type { Message } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { pickChatImage, type PickedImage } from '@/lib/media/pick-chat-image';

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function CoachScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [coach, conversation, changeRequests] = await Promise.all([
      getMyCoach(),
      getMyActiveConversation(),
      getMyCoachChangeRequests(),
    ]);
    return { coach, conversation, changeRequests };
  }, []);

  const coach = data?.coach ?? null;
  const conversation = data?.conversation ?? null;
  const changeRequests = data?.changeRequests ?? [];

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

      {!loading && !error && coach && (
        <CoachChangeSection requests={changeRequests} onSubmitted={reload} />
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
        </>
      )}
    </ScreenScaffold>
  );
}

const CHANGE_STATUS_LABEL: Record<CoachChangeStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Not approved',
};
const CHANGE_STATUS_COLOR: Record<CoachChangeStatus, string> = {
  pending: Brand.streakEmberStart,
  approved: Brand.successEmerald,
  rejected: Brand.alertRed,
};

function CoachChangeSection({ requests, onSubmitted }: { requests: CoachChangeRequest[]; onSubmitted: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [coachRating, setCoachRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const hasOpenRequest = requests.some((r) => r.status === 'pending');

  const onSubmit = async () => {
    if (!reason.trim()) {
      setFormError('Tell us why you want to switch coaches.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await requestCoachChange({ reason: reason.trim(), overallExperience: null, coachRating, additionalComments: null });
      setReason('');
      setCoachRating(null);
      setShowForm(false);
      onSubmitted();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <View style={styles.changeHeader}>
        <Text style={shared.cardLabel}>COACH CHANGE</Text>
        {!hasOpenRequest && (
          <Pressable onPress={() => setShowForm((v) => !v)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.changeToggle}>{showForm ? 'Cancel' : 'Request change'}</Text>
          </Pressable>
        )}
      </View>

      {requests.map((r) => (
        <View key={r.id} style={styles.changeRow}>
          <Text style={styles.bubbleTime}>{formatDate(r.created_at)}</Text>
          <Text style={[styles.changeStatus, { color: CHANGE_STATUS_COLOR[r.status] }]}>
            {CHANGE_STATUS_LABEL[r.status]}
          </Text>
        </View>
      ))}
      {requests.some((r) => r.status === 'approved') && (
        <Text style={styles.changeNote}>
          Approved — your coach change is finalized by our team; you&apos;ll be notified once your new coach and
          schedule are set.
        </Text>
      )}

      {showForm && (
        <View style={styles.changeForm}>
          <TextInput
            style={styles.reasonInput}
            placeholder="Why do you want to switch coaches?"
            value={reason}
            onChangeText={setReason}
            multiline
            accessibilityLabel="Reason for coach change"
          />
          <Text style={styles.bubbleTime}>RATE YOUR CURRENT COACH (OPTIONAL)</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setCoachRating(coachRating === n ? null : n)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${n} out of 5`}
                accessibilityState={{ selected: coachRating === n }}
                style={[styles.ratingChip, coachRating === n && styles.ratingChipSelected]}>
                <Text style={[styles.ratingChipText, coachRating === n && styles.ratingChipTextSelected]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          {formError && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {formError}
            </Text>
          )}
          <CtaButton onPress={onSubmit} loading={submitting}>
            Submit request
          </CtaButton>
        </View>
      )}
    </Card>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  const isMine = message.sender_role === 'client';

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
          placeholder={pendingImage ? 'Add a caption (optional)…' : 'Message your coach…'}
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
    </View>
  );
}

const styles = StyleSheet.create({
  changeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeToggle: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.yellow },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  changeStatus: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  changeNote: { fontFamily: 'Manrope_500Medium', fontSize: 13, marginTop: 6 },
  changeForm: { marginTop: 8, gap: 8 },
  reasonInput: { fontFamily: 'Manrope_500Medium', fontSize: 15, paddingVertical: 8, color: Brand.charcoal2, minHeight: 44 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  ratingChipSelected: { backgroundColor: Brand.yellow },
  ratingChipText: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  ratingChipTextSelected: { color: Brand.black },
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderRadius: 20,
    padding: 8,
  },
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
