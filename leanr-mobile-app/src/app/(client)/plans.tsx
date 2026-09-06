/**
 * Choose Your Plan — dual-branch (New PRD.md pre-purchase redesign):
 * before any purchase, a light-themed version (same data/purchase logic,
 * Individual/Corporate tabs matching the mockup and the marketing shell's
 * own Plans screen); the existing dark post-purchase/renewal screen is
 * unchanged, moved into `EnrolledPlansScreen`.
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
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { useAuth } from '@/lib/auth/auth-context';
import { getMarketingPlans } from '@/lib/data/plans';
import { purchasePackage } from '@/lib/data/payments';
import { getLatestSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

function formatPrice(price: number) {
  return `₹${price.toLocaleString()}`;
}

type PlanTab = 'individual' | 'corporate';
const TABS: { key: PlanTab; label: string }[] = [
  { key: 'individual', label: 'Individual' },
  { key: 'corporate', label: 'Corporate' },
];

function PrePurchasePlansScreen() {
  const { session, profile } = useAuth();
  const [tab, setTab] = useState<PlanTab>('individual');
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
    <LightScreenScaffold title="Our Plans">
      <TextLink onPress={() => router.push('/demo-booking')} style={lightStyles.demoLink}>
        Book a Free Demo first →
      </TextLink>

      <LightSegmentedControl options={TABS} value={tab} onChange={setTab} />

      {tab === 'corporate' && (
        <LightEmptyState message="Corporate plans aren't available yet — contact us for team pricing." icon="business-outline" />
      )}

      {tab === 'individual' && (
        <>
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
        </>
      )}

      {purchaseError && (
        <Text style={lightStyles.errorText} accessibilityRole="alert">
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
    </LightScreenScaffold>
  );
}

function EnrolledPlansScreen() {
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

export default function PlansScreen() {
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;
  return subscription ? <EnrolledPlansScreen /> : <PrePurchasePlansScreen />;
}

const styles = StyleSheet.create({
  demoLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.yellow, marginTop: -8 },
  planCard: { gap: 4 },
  planName: { fontFamily: 'Manrope_700Bold', fontSize: 13, letterSpacing: 0.4, color: 'rgba(255,255,255,0.7)' },
  planPrice: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 38, color: Brand.yellow, letterSpacing: -0.5 },
  planMeta: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
  purchaseButton: { marginTop: 12 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});

const lightStyles = StyleSheet.create({
  demoLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: LightBrand.teal, marginTop: -8 },
  planCard: { gap: 4 },
  planName: { fontFamily: 'Manrope_700Bold', fontSize: 13, letterSpacing: 0.4, color: LightBrand.textSecondary },
  planPrice: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 38, color: LightBrand.navy, letterSpacing: -0.5 },
  planMeta: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textSecondary },
  purchaseButton: { marginTop: 12 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
});
