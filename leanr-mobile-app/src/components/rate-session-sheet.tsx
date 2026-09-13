/**
 * Shared "rate a session" bottom sheet — New PRD.md §16.B: Quality Rating
 * + Trainer Rating (both required, star 1-5) + optional note. Used by
 * both My Sessions' Rate Session action and the demo-completion feedback
 * gate on Book a Session (same field shape, same `rateSession` call).
 */
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { LightBottomSheet } from '@/components/light/light-bottom-sheet';
import { LightPrimaryButton } from '@/components/light/light-button';
import { StarRating } from '@/components/ui/star-rating';
import { LightBrand } from '@/constants/light-theme';
import { getErrorMessage } from '@/lib/data/errors';

export function RateSessionSheet({
  visible,
  title = 'Rate this session',
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onSubmit: (rating: { qualityRating: number; trainerRating: number; note: string }) => Promise<void>;
}) {
  const [quality, setQuality] = useState(0);
  const [trainer, setTrainer] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (quality === 0 || trainer === 0) {
      setError('Rate both to continue.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ qualityRating: quality, trainerRating: trainer, note: '' });
      setQuality(0);
      setTrainer(0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LightBottomSheet visible={visible} onClose={onClose} title={title}>
      <Text style={styles.label}>SESSION QUALITY</Text>
      <StarRating value={quality} onChange={setQuality} />
      <Text style={[styles.label, styles.labelSpacing]}>TRAINER</Text>
      <StarRating value={trainer} onChange={setTrainer} />

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <LightPrimaryButton size="lg" onPress={submit} loading={submitting} style={styles.button}>
        Submit rating
      </LightPrimaryButton>
    </LightBottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: LightBrand.textMuted },
  labelSpacing: { marginTop: 14 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed, marginTop: 8 },
  button: { marginTop: 14 },
});
