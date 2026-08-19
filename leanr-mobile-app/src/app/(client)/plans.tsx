/**
 * Choose Your Plan — LEANR_PT_NEXTGEN_APP_PRD.md §9.4, §8g. Listing is
 * real; Purchase now calls the real `razorpay` Edge Function
 * (src/lib/data/payments.ts) instead of the earlier honest stub — see
 * that function's source for exactly what it does and the Razorpay
 * secrets it needs before a real payment can be captured. Until those
 * secrets are set, the function returns a clear 503 rather than silently
 * failing, surfaced here as the purchase error.
 *
 * Celebration on success per §9.4 ("the single highest-emotion moment in
 * the funnel") reuses the same `CelebrationOverlay` the Home screen uses
 * for milestones.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { CelebrationOverlay } from '@/components/celebration-overlay';
import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton, TextLink } from '@/components/tappable';
import { useAuth } from '@/lib/auth/auth-context';
import { useAsync } from '@/lib/data/use-async';
import { getMarketingPlans } from '@/lib/data/plans';
import { purchasePackage } from '@/lib/data/payments';

function formatPrice(price: number) {
  return `₹${price.toLocaleString()}`;
}

export default function PlansScreen() {
  const { session, profile } = useAuth();
  const { data: plans, loading, error, reload } = useAsync(getMarketingPlans, []);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  const onPurchase = async (planId: string, planName: string) => {
    setPurchasingId(planId);
    setPurchaseError(null);
    try {
      await purchasePackage(planId, planName, {
        email: session?.user.email,
        contact: session?.user.phone,
        name: profile?.full_name,
      });
      setCelebrating(true);
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : String(err));
    } finally {
      setPurchasingId(null);
    }
  };

  return (
    <ScreenScaffold title="Choose Your Plan">
      <TextLink onPress={() => router.push('/demo-booking')} style={shared.retryLink}>
        Book a Free Demo first →
      </TextLink>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (plans?.length ?? 0) === 0 && <EmptyState message="No plans available right now." />}
      {!loading &&
        !error &&
        plans?.map((plan) => (
          <Card key={plan.id}>
            <Text style={shared.cardLabel}>{plan.name}</Text>
            <Text style={shared.bigStat}>{formatPrice(plan.price)}</Text>
            {plan.sessions_count && <Text style={shared.cardLabel}>{plan.sessions_count} sessions</Text>}
            <CtaButton
              onPress={() => onPurchase(plan.id, plan.name)}
              loading={purchasingId === plan.id}
              disabled={purchasingId !== null && purchasingId !== plan.id}
              style={{ marginTop: 12 }}>
              Purchase Plan
            </CtaButton>
          </Card>
        ))}

      {purchaseError && (
        <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#EF4444' }} accessibilityRole="alert">
          {purchaseError}
        </Text>
      )}

      {celebrating && (
        <CelebrationOverlay
          title="You're in! 🎉"
          subtitle="Your plan is active — set up your weekly schedule next."
          onDismiss={() => {
            setCelebrating(false);
            router.replace('/my-schedule');
          }}
        />
      )}
    </ScreenScaffold>
  );
}
