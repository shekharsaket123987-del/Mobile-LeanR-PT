/**
 * Activate Plan — New PRD.md §4.A `/client/activate`: pick a start date
 * (>= tomorrow, one-time lock) for a just-purchased plan that's sitting at
 * `status:'awaiting_activation'`. Reached from Plans' post-purchase
 * celebration overlay, or from the Home journey gate
 * (src/lib/data/journey.ts) if a client re-opens the app before finishing
 * this step. Not a tab itself, hidden via `href: null` in the layout.
 *
 * Relit for the post-purchase light theme (mockup frame 4) — real month
 * calendar via `CalendarGrid` instead of the earlier date-chip row.
 */
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { CalendarGrid } from '@/components/ui/calendar-grid';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/button';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { addIstDays, formatIstDateLabel, istDateKey, todayIst, type IstDate } from '@/lib/data/booking-wizard';
import { getClientJourneyStage } from '@/lib/data/journey';
import { activateSubscription, getPendingActivationSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';
import { Brand } from '@/constants/theme';

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
      // AUTH-007 fix: route by the freshly-recomputed journey stage instead of unconditionally
      // to onboarding — a renewal client (who already has onboarding on file) needs
      // renewal-checkin/renewal-scheduling instead, exactly like EnrolledHomeScreen's own gate.
      const stage = await getClientJourneyStage();
      const dest: Record<string, Href> = {
        onboarding: '/onboarding' as Href,
        renewal_checkin: '/renewal-checkin' as Href,
        renewal_scheduling: '/renewal-scheduling' as Href,
        slot_selection: '/my-schedule' as Href,
      };
      router.replace(dest[stage] ?? ('/(client)' as Href));
    } catch (err) {
      setActionError(getErrorMessage(err));
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
    <ScreenScaffold title="Activate Your Plan" subtitle="Choose when you'd like to start your plan.">
      <GlassCard>
        <SectionHeader title="Selected date" />
        <Text style={styles.selectedDateText}>{formatIstDateLabel(selectedDate)}</Text>
        <CalendarGrid selected={selectedDate} onSelect={setSelectedDate} minDate={tomorrow} initialMonth={tomorrow} />
      </GlassCard>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}

      <PrimaryButton size="lg" onPress={onConfirm} loading={submitting}>
        Activate Plan
      </PrimaryButton>
      {/* SUB-010 fix: activation is a one-time lock (BR-5) — the previous copy here claimed
          the opposite. */}
      <Text style={styles.hint}>This start date is locked in once you activate — choose carefully.</Text>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  selectedDateText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: Brand.yellow, marginBottom: 4 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
});
