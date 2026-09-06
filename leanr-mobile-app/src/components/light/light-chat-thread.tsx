/**
 * LightMessageBubble / LightMessageInput — light-palette port of
 * `components/ui/chat-thread.tsx` (post-purchase relight, mockup frame 12
 * "Chats"). Same `Message`/`PickedImage` prop shapes as the dark version —
 * a reskin, not a rewrite: mine-bubble fill teal, theirs-bubble white/
 * border, send button teal-filled.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { LightBrand, LightRadius } from '@/constants/light-theme';
import type { Message } from '@/lib/data/types';
import type { PickedImage } from '@/lib/media/pick-chat-image';

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function LightMessageBubble({ message, mine }: { message: Message; mine: boolean }) {
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {message.attachment_url && (
          <Image source={{ uri: message.attachment_url }} style={styles.attachmentImage} contentFit="cover" />
        )}
        {message.body && (
          <Text style={[styles.bubbleText, { color: mine ? '#FFFFFF' : LightBrand.textPrimary }]}>{message.body}</Text>
        )}
        <View style={styles.bubbleMeta}>
          <Text style={[styles.bubbleTime, { color: mine ? 'rgba(255,255,255,0.75)' : LightBrand.textMuted }]}>
            {formatMessageTime(message.created_at)}
          </Text>
          {mine && <Text style={[styles.receipt, message.read_at && styles.receiptRead]}>{message.read_at ? '✓✓' : '✓'}</Text>}
        </View>
      </View>
    </View>
  );
}

export function LightMessageInput({
  value,
  onChangeText,
  onSend,
  sending,
  onAttach,
  attaching,
  pendingImage,
  onRemovePendingImage,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  onAttach: () => void;
  attaching: boolean;
  pendingImage: PickedImage | null;
  onRemovePendingImage: () => void;
  placeholder: string;
}) {
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
      <View style={styles.inputRow}>
        <Pressable
          onPress={onAttach}
          disabled={attaching}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Attach a photo"
          style={styles.attachButton}>
          <Ionicons name="camera-outline" size={19} color={LightBrand.textSecondary} />
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={LightBrand.textMuted}
          value={value}
          onChangeText={onChangeText}
          multiline
          accessibilityLabel={placeholder}
        />
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}>
          <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: LightRadius.md, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  bubbleMine: { backgroundColor: LightBrand.teal },
  bubbleTheirs: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LightBrand.border },
  bubbleText: { fontFamily: 'Manrope_500Medium', fontSize: 15 },
  attachmentImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },
  bubbleMeta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 },
  bubbleTime: { fontFamily: 'Manrope_500Medium', fontSize: 11 },
  receipt: { fontFamily: 'Manrope_500Medium', fontSize: 11, color: 'rgba(255,255,255,0.75)' },
  receiptRead: { color: '#FFFFFF' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderRadius: LightRadius.lg,
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: LightBrand.border,
  },
  attachButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 10,
    paddingHorizontal: 8,
    color: LightBrand.textPrimary,
  },
  pendingImageRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  pendingImageThumb: { width: 56, height: 56, borderRadius: 10 },
  pendingImageRemove: {
    marginLeft: -12,
    marginTop: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: LightBrand.alertRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingImageRemoveText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Manrope_700Bold' },
  sendButton: {
    backgroundColor: LightBrand.teal,
    borderRadius: LightRadius.pill,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
});
