/**
 * Choose Your Plan — dual-branch: before any purchase vs. after (renewal),
 * sharing the same data/purchase logic and the same `ui/*`/`GlassCard`
 * components so both branches render identically. Plans apply to everyone —
 * no Individual/Corporate segmentation exists in the data model
 * (`package_tiers` has no such concept), so there's no tab to show.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { RateSessionSheet } from '@/components/rate-session-sheet';
import { Brand, DisplayFont } from '@/constants/theme';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/button';
import { TextLink } from '@/components/tappable';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useAuth } from '@/lib/auth/auth-context';
import { rateSession } from '@/lib/data/bookings';
import { getUnratedCompletedDemo } from '@/lib/data/demo-booking';
import { getClientJourneyState } from '@/lib/data/journey';
import { getMarketingPlans } from '@/lib/data/plans';
import { getMyPayments, purchasePackage } from '@/lib/data/payments';
import { getLatestSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

async function goToPaymentSuccess(planName: string) {
  const payments = await getMyPayments();
  const latest = payments[0];
  router.replace({
    pathname: '/payment-success',
    params: {
      planName,
      amount: String(latest?.amount ?? ''),
      paymentId: latest?.razorpay_payment_id ?? '',
      paidAt: latest?.paid_at ?? '',
    },
  });
}

function formatPrice(price: number) {
  return `₹${price.toLocaleString()}`;
}

function PrePurchasePlansScreen() {
  const { session, profile } = useAuth();
  const { data, loading, error, reload } = useAsync(async () => {
    const [plans, journeyState, unratedDemo] = await Promise.all([getMarketingPlans(), getClientJourneyState(), getUnratedCompletedDemo()]);
    return { plans, journeyState, unratedDemo };
  }, []);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);

  const plans = data?.plans ?? [];
  // client's rule: plans unlock only once any in-flight demo is done (rated or skipped) —
  // same journey-stage gate as index.tsx/subscription.tsx/book-session.tsx.
  const stage = data?.journeyState?.stage ?? 'marketing';
  const unratedDemo = !feedbackDismissed ? (data?.unratedDemo ?? null) : null;

  const onPurchase = async (planId: string, planName: string) => {
    setPurchasingId(planId);
    setPurchaseError(null);
    try {
      await purchasePackage(planId, planName, {
        email: session?.user.email,
        contact: session?.user.phone,
        name: profile?.full_name,
      });
      await goToPaymentSuccess(planName);
    } catch (err) {
      setPurchaseError(getErrorMessage(err));
    } finally {
      setPurchasingId(null);
    }
  };

  const onSubmitDemoFeedback = async (rating: { qualityRating: number; trainerRating: number; note: string }) => {
    if (!unratedDemo) return;
    await rateSession(unratedDemo.bookingId, rating);
    setFeedbackDismissed(true);
  };

  if (loading) {
    return (
      <ScreenScaffold title="Our Plans">
        <LoadingState />
      </ScreenScaffold>
    );
  }
  if (error) {
    return (
      <ScreenScaffold title="Our Plans">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  if (stage === 'demo_booked') {
    return (
      <ScreenScaffold title="Our Plans">
        <EmptyState message="Your demo session is scheduled — plans unlock once it's done." icon="lock-closed-outline" />
      </ScreenScaffold>
    );
  }

  if (stage === 'demo_completed' && unratedDemo) {
    return (
      <ScreenScaffold title="Our Plans">
        <EmptyState message="Rate your demo session to unlock plans." icon="star-outline" />
        <RateSessionSheet
          visible
          title={unratedDemo.coachName ? `Rate your session with ${unratedDemo.coachName}` : 'Rate your demo session'}
          requireNote
          onClose={() => setFeedbackDismissed(true)}
          onSubmit={onSubmitDemoFeedback}
        />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Our Plans">
      {stage === 'marketing' && (
        <TextLink onPress={() => router.push('/demo-booking')} style={styles.demoLink}>
          Book a Free Demo first →
        </TextLink>
      )}

      {plans.length === 0 && <EmptyState message="No plans available right now." icon="pricetag-outline" />}
      {plans.map((plan) => (
        <GlassCard key={plan.id} style={styles.planCard}>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.planPrice}>{formatPrice(plan.price)}</Text>
          {plan.sessions_count ? <Text style={styles.planMeta}>{plan.sessions_count} live sessions with your coach</Text> : null}
          <PrimaryButton
            size="lg"
            onPress={() => onPurchase(plan.id, plan.name)}
            loading={purchasingId === plan.id}
            disabled={purchasingId !== null && purchasingId !== plan.id}
            style={styles.purchaseButton}>
            Purchase plan
          </PrimaryButton>
        </GlassCard>
      ))}

      {purchaseError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {purchaseError}
        </Text>
      )}
    </ScreenScaffold>
  );
}

function EnrolledPlansScreen() {
  const { session, profile } = useAuth();
  const { data: plans, loading, error, reload } = useAsync(getMarketingPlans, []);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const onPurchase = async (planId: string, planName: string) => {
    setPurchasingId(planId);
    setPurchaseError(null);
    try {
      await purchasePackage(planId, planName, {
        email: session?.user.email,
        contact: session?.user.phone,
        name: profile?.full_name,
      });
      await goToPaymentSuccess(planName);
    } catch (err) {
      setPurchaseError(getErrorMessage(err));
    } finally {
      setPurchasingId(null);
    }
  };

  return (
    <ScreenScaffold title="Choose Your Plan" subtitle="Every plan pairs you with a dedicated live coach.">
      <TextLink onPress={() => router.push('/demo-booking')} style={styles.demoLink}>
        Book a Free Demo first →
      </TextLink>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (plans?.length ?? 0) === 0 && <EmptyState message="No plans available right now." icon="pricetag-outline" />}
      {!loading &&
        !error &&
        plans?.map((plan) => (
          <GlassCard key={plan.id} style={styles.planCard}>
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.planPrice}>{formatPrice(plan.price)}</Text>
            {plan.sessions_count ? <Text style={styles.planMeta}>{plan.sessions_count} live sessions with your coach</Text> : null}
            <PrimaryButton
              size="lg"
              onPress={() => onPurchase(plan.id, plan.name)}
              loading={purchasingId === plan.id}
              disabled={purchasingId !== null && purchasingId !== plan.id}
              style={styles.purchaseButton}>
              Purchase plan
            </PrimaryButton>
          </GlassCard>
        ))}

      {purchaseError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {purchaseError}
        </Text>
      )}
    </ScreenScaffold>
  );
}

export default function PlansScreen() {
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;
  return subscription ? <EnrolledPlansScreen /> : <PrePurchasePlansScreen />;
}

const styles = StyleSheet.create({
  demoLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.yellow, marginTop: -8 },
  planCard: { gap: 4 },
  planName: { fontFamily: 'Manrope_700Bold', fontSize: 13, letterSpacing: 0.4, color: 'rgba(255,255,255,0.6)' },
  planPrice: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 38, color: '#FFFFFF', letterSpacing: -0.5 },
  planMeta: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
  purchaseButton: { marginTop: 12 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
