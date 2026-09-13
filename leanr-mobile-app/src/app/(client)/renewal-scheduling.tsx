/**
 * Renewal Scheduling — ClientPortal.md §4.0/§9 `renewal_scheduling` stage:
 * shown once per renewal, only when no `recurring_slots` row is billed
 * against the new subscription yet. Offers "Keep My Schedule" (carries
 * over the exact days/time/coach in one click, via
 * `carryOverRecurringSchedule`) or "No, Change It" (the existing
 * `my-schedule.tsx` full pattern picker, unchanged).
 *
 * Stage-gated (`href: null`, no nav entry), same convention as
 * activate.tsx/onboarding.tsx/renewal-checkin.tsx.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton, LightSecondaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { carryOverRecurringSchedule } from '@/lib/data/recurring-schedule';
import { getLatestSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

export default function RenewalSchedulingScreen() {
  const { data: subscription, loading, error, reload } = useAsync(getLatestSubscription, []);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const onKeep = async () => {
    if (!subscription) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await carryOverRecurringSchedule(subscription.id);
      router.replace('/(client)');
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <LightScreenScaffold title="Your Schedule">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }

  if (error) {
    return (
      <LightScreenScaffold title="Your Schedule">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Your Schedule" subtitle="Welcome back! Keep your usual sessions, or set up a new pattern.">
      <LightCard>
        <LightEmptyState message="Would you like to keep your previous weekly schedule, or set up a new one?" icon="calendar-outline" />
      </LightCard>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}

      <LightPrimaryButton size="lg" onPress={onKeep} loading={submitting}>
        Keep My Schedule
      </LightPrimaryButton>
      <LightSecondaryButton size="lg" onPress={() => router.replace('/my-schedule')}>
        No, Change It
      </LightSecondaryButton>
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
});
