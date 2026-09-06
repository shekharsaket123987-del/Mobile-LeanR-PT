/**
 * Activate Plan — New PRD.md §4.A `/client/activate`: pick a start date
 * (>= tomorrow, one-time lock) for a just-purchased plan that's sitting at
 * `status:'awaiting_activation'`. Reached from Plans' post-purchase
 * celebration overlay, or from the Home journey gate
 * (src/lib/data/journey.ts) if a client re-opens the app before finishing
 * this step. Not a tab itself, hidden via `href: null` in the layout.
 *
 * Relit for the post-purchase light theme (mockup frame 4) — real month
 * calendar via `LightCalendarGrid` instead of the earlier date-chip row.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { LightCalendarGrid } from '@/components/light/light-calendar-grid';
import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { addIstDays, formatIstDateLabel, istDateKey, todayIst, type IstDate } from '@/lib/data/booking-wizard';
import { activateSubscription, getPendingActivationSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

export default function ActivatePlanScreen() {
  const { data: subscription, loading, error, reload } = useAsync(getPendingActivationSubscription, []);
  const tomorrow = addIstDays(todayIst(), 1);
  const [selectedDate, setSelectedDate] = useState<IstDate>(tomorrow);
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
      setActionError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <LightScreenScaffold title="Activate Your Plan">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }

  if (error) {
    return (
      <LightScreenScaffold title="Activate Your Plan">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  if (!subscription) {
    return (
      <LightScreenScaffold title="Activate Your Plan">
        <LightEmptyState message="Nothing to activate right now." icon="checkmark-circle-outline" />
        <LightPrimaryButton size="lg" onPress={() => router.replace('/(client)')}>
          Back to Dashboard
        </LightPrimaryButton>
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Activate Your Plan" subtitle="Choose when you'd like to start your plan.">
      <LightCard>
        <LightSectionHeader title="Selected date" />
        <Text style={styles.selectedDateText}>{formatIstDateLabel(selectedDate)}</Text>
        <LightCalendarGrid selected={selectedDate} onSelect={setSelectedDate} minDate={tomorrow} initialMonth={tomorrow} />
      </LightCard>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}

      <LightPrimaryButton size="lg" onPress={onConfirm} loading={submitting}>
        Activate Plan
      </LightPrimaryButton>
      <Text style={styles.hint}>You can reschedule later if needed.</Text>
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  selectedDateText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.teal, marginBottom: 4 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted, textAlign: 'center' },
});
