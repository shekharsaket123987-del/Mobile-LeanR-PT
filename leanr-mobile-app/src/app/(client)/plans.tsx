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
import { StyleSheet, Text } from 'react-native';

import { CelebrationOverlay } from '@/components/celebration-overlay';
import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { TextLink } from '@/components/tappable';
import { PrimaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { Brand, DisplayFont } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { getMarketingPlans } from '@/lib/data/plans';
import { purchasePackage } from '@/lib/data/payments';
import { useAsync } from '@/lib/data/use-async';

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
    <ScreenScaffold title="Choose Your Plan" subtitle="Every plan pairs you with a dedicated live coach.">
      <TextLink onPress={() => router.push('/demo-booking')} style={styles.demoLink}>
        Book a Free Demo first →
      </TextLink>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (plans?.length ?? 0) === 0 && (
        <EmptyState message="No plans available right now." icon="pricetag-outline" />
      )}
      {!loading &&
        !error &&
        plans?.map((plan) => (
          <GlassCard key={plan.id} style={styles.planCard}>
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.planPrice}>{formatPrice(plan.price)}</Text>
            {plan.sessions_count ? (
              <Text style={styles.planMeta}>{plan.sessions_count} live sessions with your coach</Text>
            ) : null}
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

      {celebrating && (
        <CelebrationOverlay
          title="You're in! 🎉"
          subtitle="Pick a start date next, then a quick health check."
          onDismiss={() => {
            setCelebrating(false);
            router.replace('/activate');
          }}
        />
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  demoLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.yellow, marginTop: -8 },
  planCard: { gap: 4 },
  planName: { fontFamily: 'Manrope_700Bold', fontSize: 13, letterSpacing: 0.4, color: 'rgba(255,255,255,0.7)' },
  planPrice: {
    fontFamily: DisplayFont,
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 38,
    color: Brand.yellow,
    letterSpacing: -0.5,
  },
  planMeta: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
  purchaseButton: { marginTop: 12 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
