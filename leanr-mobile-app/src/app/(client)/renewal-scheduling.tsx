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

import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { carryOverRecurringSchedule } from '@/lib/data/recurring-schedule';
import { getLatestSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';
import { Brand } from '@/constants/theme';

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
      <ScreenScaffold title="Your Schedule">
        <LoadingState />
      </ScreenScaffold>
    );
  }

  if (error) {
    return (
      <ScreenScaffold title="Your Schedule">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Your Schedule" subtitle="Welcome back! Keep your usual sessions, or set up a new pattern.">
      <GlassCard>
        <EmptyState message="Would you like to keep your previous weekly schedule, or set up a new one?" icon="calendar-outline" />
      </GlassCard>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}

      <PrimaryButton size="lg" onPress={onKeep} loading={submitting}>
        Keep My Schedule
      </PrimaryButton>
      <SecondaryButton
        size="lg"
        onPress={() => subscription && router.replace({ pathname: '/my-schedule', params: { renewalSubscriptionId: subscription.id } })}
      >
        No, Change It
      </SecondaryButton>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
