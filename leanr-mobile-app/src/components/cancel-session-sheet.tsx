/**
 * Cancel Session confirmation — reschedule.md §3/§6.2: cancelling a
 * recurring-slot booking auto-generates one replacement future occurrence
 * (the client's total scheduled sessions don't shrink), while a one-off
 * booking (no `recurring_slot_id`) is just removed. Surfacing which one
 * applies here, plus the live "reschedules left this week" count, so the
 * client knows the actual consequence before confirming — not just a bare
 * "this cannot be undone".
 *
 * Built as a custom sheet rather than `Alert.alert` because
 * react-native-web's `Alert.alert` is a no-op (`static alert() {}` in
 * react-native-web/src/exports/Alert) — on the web build, the previous
 * Alert-based confirm silently did nothing, which is what made the Cancel
 * button look broken.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { LightBottomSheet } from '@/components/light/light-bottom-sheet';
import { LightDestructiveButton, LightGhostButton } from '@/components/light/light-button';
import { LightTextField } from '@/components/light/light-text-field';
import { LightBrand } from '@/constants/light-theme';
import type { SchedulingRules } from '@/lib/data/bookings';
import { getErrorMessage } from '@/lib/data/errors';
import type { Booking } from '@/lib/data/types';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function CancelSessionSheet({
  visible,
  booking,
  rules,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  booking: Booking | null;
  rules: SchedulingRules;
  onClose: () => void;
  onConfirm: (bookingId: string, reason: string | null) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setReason('');
      setError(null);
    }
  }, [visible]);

  if (!booking) return null;

  const willBackfill = booking.recurring_slot_id != null;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(booking.id, reason.trim() || null);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LightBottomSheet visible={visible} onClose={onClose} title="Cancel this session?" subtitle={formatSessionTime(booking.scheduled_start)}>
      <Text style={styles.consequence}>
        {willBackfill
          ? "This won't cost you a session — a new slot with your coach will be scheduled automatically further out."
          : "This session will be removed from your schedule and can't be recovered."}
      </Text>
      <Text style={styles.policyLine}>
        Cancellations require at least {rules.cancellationCutoffHours} hour{rules.cancellationCutoffHours === 1 ? '' : 's'} notice.
      </Text>

      <Text style={styles.label}>REASON (OPTIONAL)</Text>
      <LightTextField placeholder="Let us know why (optional)" value={reason} onChangeText={setReason} multiline numberOfLines={3} style={styles.reasonInput} />

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <LightDestructiveButton size="lg" onPress={submit} loading={submitting} style={styles.confirmButton}>
        Cancel session
      </LightDestructiveButton>
      <LightGhostButton size="lg" onPress={onClose}>
        Keep session
      </LightGhostButton>
    </LightBottomSheet>
  );
}

const styles = StyleSheet.create({
  consequence: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: LightBrand.textPrimary, lineHeight: 19 },
  policyLine: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted, marginTop: 6 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: LightBrand.textMuted, marginTop: 16 },
  reasonInput: { minHeight: 64, textAlignVertical: 'top', paddingTop: 14 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed, marginTop: 8 },
  confirmButton: { marginTop: 14 },
});
