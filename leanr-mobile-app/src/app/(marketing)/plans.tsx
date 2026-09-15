/**
 * Public Plans (mockup #5) — browsable, no purchase (purchasing requires
 * an account, same as the actual web app's marketing pricing section).
 * Plans apply to everyone — no Individual/Corporate segmentation exists
 * in the data model (`package_tiers` has no such concept).
 */
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { DisplayFont } from '@/constants/theme';
import { getMarketingPlans } from '@/lib/data/plans';
import { useAsync } from '@/lib/data/use-async';

function formatPrice(price: number) {
  return `₹${price.toLocaleString()}`;
}

export default function MarketingPlansScreen() {
  const { data: plans, loading, error, reload } = useAsync(getMarketingPlans, []);

  return (
    <LightScreenScaffold title="Our Plans">
      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (plans?.length ?? 0) === 0 && <LightEmptyState message="No plans available right now." icon="pricetag-outline" />}
      {!loading &&
        !error &&
        plans?.map((plan) => (
          <LightCard key={plan.id} style={styles.planCard}>
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.planPrice}>
              {formatPrice(plan.price)}
              <Text style={styles.planPriceUnit}> / month</Text>
            </Text>
            {plan.sessions_count ? <Text style={styles.planMeta}>{plan.sessions_count} sessions per month</Text> : null}
            <LightPrimaryButton size="lg" onPress={() => router.push('/signup')} style={styles.viewButton}>
              View Details
            </LightPrimaryButton>
          </LightCard>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  planCard: { gap: 4 },
  planName: { fontFamily: 'Manrope_700Bold', fontSize: 13, letterSpacing: 0.4, color: LightBrand.textSecondary },
  planPrice: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 32, color: LightBrand.navy },
  planPriceUnit: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textMuted },
  planMeta: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textSecondary },
  viewButton: { marginTop: 10 },
});
