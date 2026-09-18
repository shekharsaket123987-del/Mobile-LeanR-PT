/**
 * Public Plans (mockup #5) — browsable, no purchase (purchasing requires
 * an account, same as the actual web app's marketing pricing section).
 * Plans apply to everyone — no Individual/Corporate segmentation exists
 * in the data model (`package_tiers` has no such concept).
 */
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { ScreenScaffold } from '@/components/screen-scaffold';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand, DisplayFont } from '@/constants/theme';
import { getMarketingPlans } from '@/lib/data/plans';
import { useAsync } from '@/lib/data/use-async';

function formatPrice(price: number) {
  return `₹${price.toLocaleString()}`;
}

export default function MarketingPlansScreen() {
  const { data: plans, loading, error, reload } = useAsync(getMarketingPlans, []);

  return (
    <ScreenScaffold title="Our Plans">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (plans?.length ?? 0) === 0 && <EmptyState message="No plans available right now." icon="pricetag-outline" />}
      {!loading &&
        !error &&
        plans?.map((plan) => (
          <GlassCard key={plan.id} style={styles.planCard}>
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.planPrice}>
              {formatPrice(plan.price)}
              <Text style={styles.planPriceUnit}> / month</Text>
            </Text>
            {plan.sessions_count ? <Text style={styles.planMeta}>{plan.sessions_count} sessions per month</Text> : null}
            <PrimaryButton size="lg" onPress={() => router.push('/signup')} style={styles.viewButton}>
              View Details
            </PrimaryButton>
          </GlassCard>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  planCard: { gap: 4 },
  planName: { fontFamily: 'Manrope_700Bold', fontSize: 13, letterSpacing: 0.4, color: 'rgba(255,255,255,0.6)' },
  planPrice: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 32, color: Brand.yellow },
  planPriceUnit: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.45)' },
  planMeta: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
  viewButton: { marginTop: 10 },
});
