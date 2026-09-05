/**
 * Subscription — New PRD.md §4.A `/client/subscription`. Usage, status,
 * self-service pause/resume, and payment history. Reached from More
 * ("Subscription & Plans" row) — previously that row pointed at `/plans`
 * (the purchase screen), which had no usage/pause-resume/payment-history
 * surface at all. Not a tab itself, hidden via `href: null` in the layout.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ProgressRing } from '@/components/progress-ring';
import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/badge';
import { Brand, DisplayFont } from '@/constants/theme';
import { getPackageById } from '@/lib/data/plans';
import { getMyPayments, type PaymentWithPackage } from '@/lib/data/payments';
import { getLatestSubscription, getSessionsUsedCount, pauseSubscription, resumeSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

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
    const [pkg, sessionsUsed, payments] = await Promise.all([
      subscription ? getPackageById(subscription.package_id) : Promise.resolve(null),
      subscription ? getSessionsUsedCount(subscription.id) : Promise.resolve(0),
      getMyPayments(),
    ]);
    return { subscription, pkg, sessionsUsed, payments };
  }, []);
  const [busy, setBusy] = useState(false);

  const { subscription, pkg, sessionsUsed, payments } = data ?? { subscription: null, pkg: null, sessionsUsed: 0, payments: [] };

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
              Alert.alert('Could not update your plan', err instanceof Error ? err.message : String(err));
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
      <ScreenScaffold title="Subscription">
        <LoadingState />
      </ScreenScaffold>
    );
  }

  if (error) {
    return (
      <ScreenScaffold title="Subscription">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Subscription">
      {!subscription && (
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
            {subscription.status !== 'awaiting_activation' && (
              <View style={styles.ringWrap}>
                <ProgressRing
                  progress={subscription.sessions_total > 0 ? sessionsUsed / subscription.sessions_total : 0}
                  valueText={`${sessionsUsed}/${subscription.sessions_total}`}
                  label="sessions used"
                  size={150}
                  strokeWidth={12}
                />
              </View>
            )}
            {subscription.pause_days_allowed > 0 && (
              <Text style={styles.metaText}>{subscription.pause_days_allowed} pause days included with this plan</Text>
            )}
          </GlassCard>

          {(subscription.status === 'active' || subscription.status === 'paused') && (
            <SecondaryButton size="lg" onPress={onTogglePause} loading={busy}>
              {subscription.status === 'active' ? 'Pause Plan' : 'Resume Plan'}
            </SecondaryButton>
          )}

          {subscription.status === 'awaiting_activation' && (
            <PrimaryButton size="lg" onPress={() => router.push('/activate')}>
              Activate this plan
            </PrimaryButton>
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

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  planName: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 20, color: '#FFFFFF', flexShrink: 1 },
  ringWrap: { alignItems: 'center', marginVertical: 8 },
  metaText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.65)' },
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
  paymentDate: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.55)' },
  paymentAmountCol: { alignItems: 'flex-end', gap: 4 },
  paymentAmount: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: Brand.yellow },
});
