/**
 * Choose Your Plan — dual-branch (New PRD.md pre-purchase redesign):
 * before any purchase, a light-themed version (same data/purchase logic
 * as the marketing shell's own Plans screen). Plans apply to everyone —
 * no Individual/Corporate segmentation exists in the data model
 * (`package_tiers` has no such concept), so there's no tab to show.
 *
 * GAP-18 (NAV-005) fix: `EnrolledPlansScreen` (renewal/post-purchase) used to render the
 * legacy dark `ui/*`/`GlassCard` stack — the last un-migrated screen branch, jarring against
 * the rest of the now fully light-themed app, and reachable by every previously-subscribed
 * client via "Renew Now". Migrated onto the same Light* components `PrePurchasePlansScreen`
 * already uses — no business-logic change, palette only.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { RateSessionSheet } from '@/components/rate-session-sheet';
import { DisplayFont } from '@/constants/theme';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightTextLink } from '@/components/light/light-tappable';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
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
      <LightScreenScaffold title="Our Plans">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }
  if (error) {
    return (
      <LightScreenScaffold title="Our Plans">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  if (stage === 'demo_booked') {
    return (
      <LightScreenScaffold title="Our Plans">
        <LightEmptyState message="Your demo session is scheduled — plans unlock once it's done." icon="lock-closed-outline" />
      </LightScreenScaffold>
    );
  }

  if (stage === 'demo_completed' && unratedDemo) {
    return (
      <LightScreenScaffold title="Our Plans">
        <LightEmptyState message="Rate your demo session to unlock plans." icon="star-outline" />
        <RateSessionSheet
          visible
          title={unratedDemo.coachName ? `Rate your session with ${unratedDemo.coachName}` : 'Rate your demo session'}
          requireNote
          onClose={() => setFeedbackDismissed(true)}
          onSubmit={onSubmitDemoFeedback}
        />
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Our Plans">
      {stage === 'marketing' && (
        <LightTextLink onPress={() => router.push('/demo-booking')} style={lightStyles.demoLink}>
          Book a Free Demo first →
        </LightTextLink>
      )}

      {plans.length === 0 && <LightEmptyState message="No plans available right now." icon="pricetag-outline" />}
      {plans.map((plan) => (
        <LightCard key={plan.id} style={lightStyles.planCard}>
          <Text style={lightStyles.planName}>{plan.name}</Text>
          <Text style={lightStyles.planPrice}>{formatPrice(plan.price)}</Text>
          {plan.sessions_count ? <Text style={lightStyles.planMeta}>{plan.sessions_count} live sessions with your coach</Text> : null}
          <LightPrimaryButton
            size="lg"
            onPress={() => onPurchase(plan.id, plan.name)}
            loading={purchasingId === plan.id}
            disabled={purchasingId !== null && purchasingId !== plan.id}
            style={lightStyles.purchaseButton}>
            Purchase plan
          </LightPrimaryButton>
        </LightCard>
      ))}

      {purchaseError && (
        <Text style={lightStyles.errorText} accessibilityRole="alert">
          {purchaseError}
        </Text>
      )}
    </LightScreenScaffold>
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
    <LightScreenScaffold title="Choose Your Plan" subtitle="Every plan pairs you with a dedicated live coach.">
      <LightTextLink onPress={() => router.push('/demo-booking')} style={lightStyles.demoLink}>
        Book a Free Demo first →
      </LightTextLink>

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (plans?.length ?? 0) === 0 && <LightEmptyState message="No plans available right now." icon="pricetag-outline" />}
      {!loading &&
        !error &&
        plans?.map((plan) => (
          <LightCard key={plan.id} style={lightStyles.planCard}>
            <Text style={lightStyles.planName}>{plan.name}</Text>
            <Text style={lightStyles.planPrice}>{formatPrice(plan.price)}</Text>
            {plan.sessions_count ? <Text style={lightStyles.planMeta}>{plan.sessions_count} live sessions with your coach</Text> : null}
            <LightPrimaryButton
              size="lg"
              onPress={() => onPurchase(plan.id, plan.name)}
              loading={purchasingId === plan.id}
              disabled={purchasingId !== null && purchasingId !== plan.id}
              style={lightStyles.purchaseButton}>
              Purchase plan
            </LightPrimaryButton>
          </LightCard>
        ))}

      {purchaseError && (
        <Text style={lightStyles.errorText} accessibilityRole="alert">
          {purchaseError}
        </Text>
      )}
    </LightScreenScaffold>
  );
}

export default function PlansScreen() {
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;
  return subscription ? <EnrolledPlansScreen /> : <PrePurchasePlansScreen />;
}

const lightStyles = StyleSheet.create({
  demoLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: LightBrand.teal, marginTop: -8 },
  planCard: { gap: 4 },
  planName: { fontFamily: 'Manrope_700Bold', fontSize: 13, letterSpacing: 0.4, color: LightBrand.textSecondary },
  planPrice: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 38, color: LightBrand.navy, letterSpacing: -0.5 },
  planMeta: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textSecondary },
  purchaseButton: { marginTop: 12 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
});
