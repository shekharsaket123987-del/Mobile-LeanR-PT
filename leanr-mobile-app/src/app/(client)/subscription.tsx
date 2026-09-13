/**
 * My Plan & Subscription — New PRD.md §4.A `/client/subscription`. Usage,
 * status, self-service pause/resume, and payment history. Registered as
 * the "Plans" tab for enrolled clients (mockup frame 14) as well as
 * reachable from More, matching how several other screens in this app
 * already have more than one entry point.
 *
 * Relit for the post-purchase light theme. Web's Subscription screen
 * (ClientPortal.md §9) renders neither a start date nor an invoice view —
 * both were mobile-only additions, removed to match documented web
 * behavior. Pre-purchase branch is now journey-stage-aware, matching web's
 * three distinct states: `demo_completed` gets a "Demo Package — Expired"
 * summary card, `marketing`/`demo_booked` get "No Subscription Found".
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { LightProgressRing } from '@/components/light/light-progress-ring';
import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightMenuRow } from '@/components/light/light-menu-row';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightStatusBadge } from '@/components/light/light-badge';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { DisplayFont } from '@/constants/theme';
import { getLatestDemoBooking } from '@/lib/data/demo-booking';
import { getClientJourneyStage } from '@/lib/data/journey';
import { getPackageById } from '@/lib/data/plans';
import { getMyPayments, type PaymentWithPackage } from '@/lib/data/payments';
import { getLatestSubscription, getSessionsUsedCount, pauseSubscription, resumeSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPrice(amount: number) {
  return `₹${amount.toLocaleString()}`;
}

export default function SubscriptionScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const subscription = await getLatestSubscription();
    const [pkg, sessionsUsed, payments, stage, demo] = await Promise.all([
      subscription ? getPackageById(subscription.package_id) : Promise.resolve(null),
      subscription ? getSessionsUsedCount(subscription.id) : Promise.resolve(0),
      getMyPayments(),
      subscription ? Promise.resolve(null) : getClientJourneyStage(),
      subscription ? Promise.resolve(null) : getLatestDemoBooking(),
    ]);
    return { subscription, pkg, sessionsUsed, payments, stage, demo };
  }, []);
  const [busy, setBusy] = useState(false);

  const {
    subscription,
    pkg,
    sessionsUsed,
    payments,
    stage,
    demo,
  } = data ?? { subscription: null, pkg: null, sessionsUsed: 0, payments: [], stage: null, demo: null };

  const onTogglePause = () => {
    if (!subscription) return;
    const willPause = subscription.status === 'active';
    Alert.alert(
      willPause ? 'Pause your plan?' : 'Resume your plan?',
      willPause ? 'You can resume any time from this screen.' : 'Your sessions will pick back up on your usual schedule.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: willPause ? 'Pause' : 'Resume',
          style: willPause ? 'destructive' : 'default',
          onPress: async () => {
            setBusy(true);
            try {
              if (willPause) await pauseSubscription(subscription.id);
              else await resumeSubscription(subscription.id);
              reload();
            } catch (err) {
              Alert.alert('Could not update your plan', getErrorMessage(err));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <LightScreenScaffold title="My Plan">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }

  if (error) {
    return (
      <LightScreenScaffold title="My Plan">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="My Plan">
      {!subscription && stage === 'demo_completed' && (
        <>
          <LightCard variant="teal">
            <View style={styles.headerRow}>
              <Text style={styles.planName}>Demo Package</Text>
              <LightStatusBadge status="expired" />
            </View>
            {demo && <Text style={styles.planMeta}>Session: {formatDate(demo.scheduledStart)}</Text>}
            <Text style={styles.planMeta}>Amount: Free</Text>
          </LightCard>
          <LightPrimaryButton size="lg" onPress={() => router.push('/plans')}>
            Choose Your Plan
          </LightPrimaryButton>
        </>
      )}

      {!subscription && stage !== 'demo_completed' && (
        <>
          <LightEmptyState message="You haven't purchased a plan yet." icon="card-outline" />
          <LightPrimaryButton size="lg" onPress={() => router.push('/plans')}>
            View plans
          </LightPrimaryButton>
        </>
      )}

      {subscription && (
        <>
          <LightCard variant="teal">
            <View style={styles.headerRow}>
              <Text style={styles.planName}>{pkg?.name ?? 'Your plan'}</Text>
              <LightStatusBadge status={subscription.status} />
            </View>
            {pkg?.sessions_count ? <Text style={styles.planMeta}>{pkg.sessions_count} sessions per month</Text> : null}
            {subscription.status !== 'awaiting_activation' && (
              <View style={styles.ringWrap}>
                <LightProgressRing
                  progress={subscription.sessions_total > 0 ? sessionsUsed / subscription.sessions_total : 0}
                  valueText={`${sessionsUsed}/${subscription.sessions_total}`}
                  label="sessions used"
                  size={140}
                  strokeWidth={12}
                />
              </View>
            )}
          </LightCard>

          <LightCard>
            <LightSectionHeader title="Plan details" />
            <Row label="Sessions Used" value={String(sessionsUsed)} />
            <Row label="Sessions Remaining" value={String(Math.max(subscription.sessions_total - sessionsUsed, 0))} />
            {subscription.pause_days_allowed > 0 && <Row label="Pause Days Included" value={String(subscription.pause_days_allowed)} />}
          </LightCard>

          {(subscription.status === 'awaiting_activation' || subscription.status === 'active' || subscription.status === 'paused') && (
            <LightCard style={styles.actionsCard}>
              {subscription.status === 'awaiting_activation' ? (
                <LightMenuRow label="Activate this plan" icon="play-circle-outline" onPress={() => router.push('/activate')} last />
              ) : (
                <LightMenuRow
                  label={subscription.status === 'active' ? 'Pause Plan (if eligible)' : 'Resume Plan'}
                  icon={subscription.status === 'active' ? 'pause-circle-outline' : 'play-circle-outline'}
                  onPress={busy ? undefined : onTogglePause}
                  last
                />
              )}
            </LightCard>
          )}
        </>
      )}

      <LightCard>
        <LightSectionHeader title="Payment history" />
        {payments.length === 0 && <LightEmptyState message="No payments yet." icon="receipt-outline" />}
        {payments.map((p: PaymentWithPackage) => (
          <View key={p.id} style={styles.paymentRow}>
            <View style={styles.paymentTextCol}>
              <Text style={styles.paymentName}>{p.package_tiers?.name ?? 'Package purchase'}</Text>
              <Text style={styles.paymentDate}>{formatDate(p.paid_at ?? p.created_at)}</Text>
            </View>
            <View style={styles.paymentAmountCol}>
              <Text style={styles.paymentAmount}>{formatPrice(p.amount)}</Text>
              <LightStatusBadge status={p.status} />
            </View>
          </View>
        ))}
      </LightCard>
    </LightScreenScaffold>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  planName: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 20, color: LightBrand.navy, flexShrink: 1 },
  planMeta: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.tealDark },
  ringWrap: { alignItems: 'center', marginVertical: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  detailLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textMuted },
  detailValue: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: LightBrand.navy },
  actionsCard: { paddingVertical: 4 },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: LightBrand.border,
  },
  paymentTextCol: { gap: 2 },
  paymentName: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.navy },
  paymentDate: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted },
  paymentAmountCol: { alignItems: 'flex-end', gap: 4 },
  paymentAmount: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.teal },
});
