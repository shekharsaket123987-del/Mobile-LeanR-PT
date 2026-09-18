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
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { RateSessionSheet } from '@/components/rate-session-sheet';
import { ProgressRing } from '@/components/progress-ring';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/button';
import { MenuRow } from '@/components/ui/menu-row';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand, DisplayFont } from '@/constants/theme';
import { rateSession } from '@/lib/data/bookings';
import { getUnratedCompletedDemo } from '@/lib/data/demo-booking';
import { getClientJourneyState } from '@/lib/data/journey';
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
    // web spec §8.4/§9.2: journeyState carries its own demoSession — one fetch, not two.
    const [pkg, sessionsUsed, payments, journeyState, unratedDemo] = await Promise.all([
      subscription ? getPackageById(subscription.package_id) : Promise.resolve(null),
      subscription ? getSessionsUsedCount(subscription.id) : Promise.resolve(0),
      getMyPayments(),
      subscription ? Promise.resolve(null) : getClientJourneyState(),
      subscription ? Promise.resolve(null) : getUnratedCompletedDemo(),
    ]);
    return { subscription, pkg, sessionsUsed, payments, stage: journeyState?.stage ?? null, demo: journeyState?.demoSession ?? null, unratedDemo };
  }, []);
  const [busy, setBusy] = useState(false);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);

  // GAP-13 / web spec §9.1: web never renders this screen for an `awaiting_activation`
  // subscription — the journey-stage redirect to /activate intercepts first. Mirror that
  // instead of showing a raw "Awaiting_activation" badge here.
  useEffect(() => {
    if (!loading && data?.subscription?.status === 'awaiting_activation') {
      router.replace('/activate');
    }
  }, [loading, data]);

  const {
    subscription,
    pkg,
    sessionsUsed,
    payments,
    stage,
    demo,
  } = data ?? { subscription: null, pkg: null, sessionsUsed: 0, payments: [], stage: null, demo: null, unratedDemo: null };
  const unratedDemo = !feedbackDismissed ? (data?.unratedDemo ?? null) : null;

  const onSubmitDemoFeedback = async (rating: { qualityRating: number; trainerRating: number; note: string }) => {
    if (!unratedDemo) return;
    await rateSession(unratedDemo.bookingId, rating);
    setFeedbackDismissed(true);
  };

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
      <ScreenScaffold title="My Plan">
        <LoadingState />
      </ScreenScaffold>
    );
  }

  if (error) {
    return (
      <ScreenScaffold title="My Plan">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  if (subscription?.status === 'awaiting_activation') return null; // redirecting via the effect above

  return (
    <ScreenScaffold title="My Plan">
      {/* client's rule: no "Choose Your Plan"/"View plans" CTA while a demo is still in
          flight (booked or unrated) — matches the same gate in index.tsx/plans.tsx. */}
      {!subscription && stage === 'demo_booked' && (
        <GlassCard variant="yellow">
          <View style={styles.headerRow}>
            <Text style={styles.planName}>Demo Session Scheduled</Text>
            <StatusBadge status="upcoming" />
          </View>
          {demo && <Text style={styles.planMeta}>Session: {formatDate(demo.scheduledStart)}</Text>}
          <Text style={styles.planMeta}>Plans unlock once your demo is done.</Text>
        </GlassCard>
      )}

      {!subscription && stage === 'demo_completed' && unratedDemo && (
        <>
          <EmptyState message="Rate your demo session to unlock plans." icon="star-outline" />
          <RateSessionSheet
            visible
            title={unratedDemo.coachName ? `Rate your session with ${unratedDemo.coachName}` : 'Rate your demo session'}
            requireNote
            onClose={() => setFeedbackDismissed(true)}
            onSubmit={onSubmitDemoFeedback}
          />
        </>
      )}

      {!subscription && stage === 'demo_completed' && !unratedDemo && (
        <>
          <GlassCard variant="yellow">
            <View style={styles.headerRow}>
              <Text style={styles.planName}>Demo Package</Text>
              <StatusBadge status="expired" />
            </View>
            {demo && <Text style={styles.planMeta}>Session: {formatDate(demo.scheduledStart)}</Text>}
            <Text style={styles.planMeta}>Amount: Free</Text>
          </GlassCard>
          <PrimaryButton size="lg" onPress={() => router.push('/plans')}>
            Choose Your Plan
          </PrimaryButton>
        </>
      )}

      {!subscription && stage === 'marketing' && (
        <>
          <EmptyState message="You haven't purchased a plan yet." icon="card-outline" />
          <PrimaryButton size="lg" onPress={() => router.push('/plans')}>
            View plans
          </PrimaryButton>
        </>
      )}

      {subscription && (
        <>
          <GlassCard variant="yellow">
            <View style={styles.headerRow}>
              <Text style={styles.planName}>{pkg?.name ?? 'Your plan'}</Text>
              <StatusBadge status={subscription.status} />
            </View>
            {pkg?.sessions_count ? <Text style={styles.planMeta}>{pkg.sessions_count} sessions per month</Text> : null}
            {/* GAP-13: the awaiting_activation redirect above means `subscription` here is
                never that status — this ring always renders for whatever reaches this point. */}
            <View style={styles.ringWrap}>
              <ProgressRing
                progress={subscription.sessions_total > 0 ? sessionsUsed / subscription.sessions_total : 0}
                valueText={`${sessionsUsed}/${subscription.sessions_total}`}
                label="sessions used"
                size={140}
                strokeWidth={12}
              />
            </View>
          </GlassCard>

          <GlassCard>
            <SectionHeader title="Plan details" />
            <Row label="Sessions Used" value={String(sessionsUsed)} />
            <Row label="Sessions Remaining" value={String(Math.max(subscription.sessions_total - sessionsUsed, 0))} />
            {subscription.pause_days_allowed > 0 && <Row label="Pause Days Included" value={String(subscription.pause_days_allowed)} />}
          </GlassCard>

          {(subscription.status === 'active' || subscription.status === 'paused') && (
            <GlassCard style={styles.actionsCard}>
              <MenuRow
                label={subscription.status === 'active' ? 'Pause Plan (if eligible)' : 'Resume Plan'}
                icon={subscription.status === 'active' ? 'pause-circle-outline' : 'play-circle-outline'}
                onPress={busy ? undefined : onTogglePause}
                last
              />
            </GlassCard>
          )}
        </>
      )}

      <GlassCard>
        <SectionHeader title="Payment history" />
        {payments.length === 0 && <EmptyState message="No payments yet." icon="receipt-outline" />}
        {payments.map((p: PaymentWithPackage) => (
          <View key={p.id} style={styles.paymentRow}>
            <View style={styles.paymentTextCol}>
              <Text style={styles.paymentName}>{p.package_tiers?.name ?? 'Package purchase'}</Text>
              <Text style={styles.paymentDate}>{formatDate(p.paid_at ?? p.created_at)}</Text>
            </View>
            <View style={styles.paymentAmountCol}>
              <Text style={styles.paymentAmount}>{formatPrice(p.amount)}</Text>
              <StatusBadge status={p.status} />
            </View>
          </View>
        ))}
      </GlassCard>
    </ScreenScaffold>
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
  planName: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 20, color: '#FFFFFF', flexShrink: 1 },
  planMeta: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: Brand.yellow },
  ringWrap: { alignItems: 'center', marginVertical: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  detailLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.45)' },
  detailValue: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#FFFFFF' },
  actionsCard: { paddingVertical: 4 },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  paymentTextCol: { gap: 2 },
  paymentName: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#FFFFFF' },
  paymentDate: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.45)' },
  paymentAmountCol: { alignItems: 'flex-end', gap: 4 },
  paymentAmount: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: Brand.yellow },
});
