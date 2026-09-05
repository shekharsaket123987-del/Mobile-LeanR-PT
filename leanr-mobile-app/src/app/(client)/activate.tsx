/**
 * Activate Plan — New PRD.md §4.A `/client/activate`: pick a start date
 * (>= tomorrow, one-time lock) for a just-purchased plan that's sitting at
 * `status:'awaiting_activation'`. Reached from Plans' post-purchase
 * celebration overlay, or from the Home journey gate
 * (src/lib/data/journey.ts) if a client re-opens the app before finishing
 * this step. Not a tab itself, hidden via `href: null` in the layout, same
 * convention as demo-booking.tsx, whose date-chip pattern this reuses.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { PrimaryButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Brand } from '@/constants/theme';
import { addIstDays, formatIstDateLabel, istDateKey, todayIst, type IstDate } from '@/lib/data/booking-wizard';
import { activateSubscription, getPendingActivationSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

const DATE_CHOICES = 14;

export default function ActivatePlanScreen() {
  const { data: subscription, loading, error, reload } = useAsync(getPendingActivationSubscription, []);
  const [selectedDate, setSelectedDate] = useState<IstDate>(() => addIstDays(todayIst(), 1));
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const onConfirm = async () => {
    if (!subscription) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await activateSubscription(subscription.id, istDateKey(selectedDate));
      router.replace('/onboarding');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ScreenScaffold title="Activate Your Plan">
        <LoadingState />
      </ScreenScaffold>
    );
  }

  if (error) {
    return (
      <ScreenScaffold title="Activate Your Plan">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  if (!subscription) {
    return (
      <ScreenScaffold title="Activate Your Plan">
        <EmptyState message="Nothing to activate right now." icon="checkmark-circle-outline" />
        <PrimaryButton size="lg" onPress={() => router.replace('/(client)')}>
          Back to Dashboard
        </PrimaryButton>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Activate Your Plan" subtitle="Pick the day you want your training to begin.">
      <GlassCard>
        <SectionHeader title="Start date" />
        <ChipGrid>
          {Array.from({ length: DATE_CHOICES }, (_, i) => addIstDays(todayIst(), i + 1)).map((d) => {
            const key = istDateKey(d);
            const isSelected = key === istDateKey(selectedDate);
            return <Chip key={key} label={formatIstDateLabel(d)} selected={isSelected} onPress={() => setSelectedDate(d)} />;
          })}
        </ChipGrid>
      </GlassCard>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}

      <PrimaryButton size="lg" onPress={onConfirm} loading={submitting}>
        Confirm start date
      </PrimaryButton>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
