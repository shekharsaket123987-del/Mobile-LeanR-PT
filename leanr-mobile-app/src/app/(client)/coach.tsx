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
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PrimaryButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { MessageBubble, MessageInput } from '@/components/ui/chat-thread';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Brand, Radius, Shadow } from '@/constants/theme';
import { getBookingSettings } from '@/lib/data/booking-wizard';
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
  completeCoachChange,
  getMyCoachChangeRequests,
  requestCoachChange,
  type CoachChangeRequest,
  type CoachChangeStatus,
} from '@/lib/data/coach-change';
import { findCoachForSchedule, WEEKDAYS, type CoachMatchCandidate } from '@/lib/data/recurring-schedule';
import type { Message } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';
import { pickChatImage, type PickedImage } from '@/lib/media/pick-chat-image';

function formatHourLabel(hour: number) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour >= 12 ? 'PM' : 'AM'} IST`;
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
      {!loading && !error && !coach && <EmptyState message="No coach assigned yet." icon="person-outline" />}
      {!loading && !error && coach && (
        <GlassCard variant="yellow" style={styles.coachCard}>
          <View style={styles.coachRow}>
            <Avatar photoUrl={coach.photo_url} name={coach.full_name} size={56} ring />
            <View style={styles.coachInfo}>
              <Text style={styles.coachEyebrow}>YOUR COACH</Text>
              <Text style={styles.coachName} numberOfLines={1}>
                {coach.full_name}
              </Text>
              {coach.specialization && (
                <Text style={styles.coachSpecialty} numberOfLines={1}>
                  {coach.specialization}
                </Text>
              )}
            </View>
          </View>
          {coach.bio && <Text style={styles.coachBio}>{coach.bio}</Text>}
        </GlassCard>
      )}

      {!loading && !error && coach && <CoachChangeSection requests={changeRequests} onSubmitted={reload} />}

      {!loading && !error && coach && !conversation && (
        <EmptyState message="No conversation with your coach yet." icon="chatbubble-outline" />
      )}

      {!loading && !error && conversation && (
        <>
          <View style={styles.thread}>
            {messages.length === 0 && <EmptyState message="Say hello to your coach." icon="hand-left-outline" />}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} mine={m.sender_role === 'client'} />
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
            placeholder={pendingImage ? 'Add a caption (optional)…' : 'Message your coach…'}
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
const CHANGE_STATUS_TONE: Record<CoachChangeStatus, 'yellow' | 'green' | 'red'> = {
  pending: 'yellow',
  approved: 'green',
  rejected: 'red',
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
    <GlassCard>
      <View style={styles.changeHeader}>
        <Text style={styles.sectionLabel}>COACH CHANGE</Text>
        {!hasOpenRequest && (
          <Pressable onPress={() => setShowForm((v) => !v)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.changeToggle}>{showForm ? 'Cancel' : 'Request change'}</Text>
          </Pressable>
        )}
      </View>

      {requests.map((r) => (
        <View key={r.id} style={styles.changeRow}>
          <Text style={styles.metaLabel}>{formatDate(r.created_at)}</Text>
          <Badge label={CHANGE_STATUS_LABEL[r.status]} tone={CHANGE_STATUS_TONE[r.status]} />
        </View>
      ))}
      {requests.some((r) => r.status === 'approved' && r.new_coach_id) && (
        <Text style={styles.changeNote}>Your coach change is complete.</Text>
      )}

      {requests
        .filter((r) => r.status === 'approved' && !r.new_coach_id)
        .map((r) => (
          <CoachChangeCompletionCard key={r.id} requestId={r.id} onCompleted={onSubmitted} />
        ))}

      {showForm && (
        <View style={styles.changeForm}>
          <TextInput
            style={styles.reasonInput}
            placeholder="Why do you want to switch coaches?"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={reason}
            onChangeText={setReason}
            multiline
            accessibilityLabel="Reason for coach change"
          />
          <Text style={styles.metaLabel}>RATE YOUR CURRENT COACH (OPTIONAL)</Text>
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
          <PrimaryButton onPress={onSubmit} loading={submitting}>
            Submit request
          </PrimaryButton>
        </View>
      )}
    </GlassCard>
  );
}

function CoachChangeCompletionCard({ requestId, onCompleted }: { requestId: string; onCompleted: () => void }) {
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [match, setMatch] = useState<{ coach: CoachMatchCandidate; hours: number[] } | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const toggleDay = (dow: number) => {
    setMatch(null);
    setSelectedHour(null);
    setSelectedDays((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort((a, b) => a - b)));
  };

  const onFindCoach = async () => {
    if (selectedDays.length < 2) {
      setError('Pick at least 2 days.');
      return;
    }
    setError(null);
    setSearching(true);
    try {
      const settings = await getBookingSettings();
      const result = await findCoachForSchedule(
        selectedDays,
        settings.defaultSessionDurationMinutes,
        { startHour: settings.bookingWindowStartHour, endHour: settings.bookingWindowEndHour },
        'new',
        'no_preference'
      );
      if (!result) {
        setError('No available coach found for those days — try different days.');
        return;
      }
      setMatch(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const onConfirm = async () => {
    if (!match || selectedHour === null) return;
    setConfirming(true);
    setError(null);
    try {
      const settings = await getBookingSettings();
      await completeCoachChange({
        requestId,
        newCoachId: match.coach.id,
        days: selectedDays,
        hour: selectedHour,
        durationMinutes: settings.defaultSessionDurationMinutes,
      });
      setDone(true);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  };

  if (done) return null; // onCompleted() reloads the parent's requests list, which will drop this card once new_coach_id is set

  return (
    <GlassCard style={styles.completionCard}>
      <SectionHeader eyebrow="Approved" title="Pick your new schedule" />
      <Text style={styles.metaLabel}>DAYS</Text>
      <ChipGrid>
        {WEEKDAYS.map((d) => (
          <Chip key={d.dow} label={d.short} selected={selectedDays.includes(d.dow)} onPress={() => toggleDay(d.dow)} />
        ))}
      </ChipGrid>

      {!match && (
        <PrimaryButton onPress={onFindCoach} loading={searching} style={styles.findCoachButton}>
          Find available coach
        </PrimaryButton>
      )}

      {match && (
        <>
          <Text style={styles.changeNote}>Matched with {match.coach.full_name}</Text>
          <Text style={styles.metaLabel}>TIME</Text>
          <ChipGrid>
            {match.hours.map((h) => (
              <Chip key={h} label={formatHourLabel(h)} selected={h === selectedHour} onPress={() => setSelectedHour(h)} />
            ))}
          </ChipGrid>
          {selectedHour !== null && (
            <PrimaryButton onPress={onConfirm} loading={confirming} style={styles.findCoachButton}>
              Confirm {match.coach.full_name}
            </PrimaryButton>
          )}
        </>
      )}

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  coachCard: { gap: 10 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  coachInfo: { flexShrink: 1, gap: 2 },
  coachEyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 11, letterSpacing: 1, color: Brand.yellow },
  coachName: { fontFamily: 'Manrope_800ExtraBold', fontSize: 19, color: '#FFFFFF' },
  coachSpecialty: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  coachBio: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 20 },
  sectionLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: 'rgba(255,255,255,0.55)' },
  metaLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: 'rgba(255,255,255,0.5)' },
  changeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeToggle: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.yellow },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  changeNote: { fontFamily: 'Manrope_500Medium', fontSize: 13, marginTop: 6, color: 'rgba(255,255,255,0.6)' },
  changeForm: { marginTop: 8, gap: 10 },
  reasonInput: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    padding: 14,
    color: '#FFFFFF',
    minHeight: 80,
    backgroundColor: Brand.charcoal2,
    borderRadius: Radius.md,
    textAlignVertical: 'top',
  },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  ratingChipSelected: { backgroundColor: Brand.yellow, ...Shadow.glow },
  ratingChipText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFFFFF' },
  ratingChipTextSelected: { color: Brand.black },
  thread: { gap: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  completionCard: { gap: 8 },
  findCoachButton: { marginTop: 8 },
});
