/**
 * Choose Your Plan — LEANR_PT_NEXTGEN_APP_PRD.md §9.4. Listing is real
 * (Supabase read); Purchase is an honest stub, not a fake success or an
 * insecure client-side order creation. See the Alert copy below and
 * README open items for exactly why.
 */
import { router } from 'expo-router';
import { Alert, Text } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton, TextLink } from '@/components/tappable';
import { getMarketingPlans } from '@/lib/data/plans';
import { useAsync } from '@/lib/data/use-async';

function formatPrice(price: number) {
  return `₹${price.toLocaleString()}`;
}

export default function PlansScreen() {
  const { data: plans, loading, error, reload } = useAsync(getMarketingPlans, []);

  const onPurchase = (planName: string) => {
    Alert.alert(
      'Not available yet',
      `Purchasing "${planName}" requires a server-side endpoint that creates the Razorpay order with your account's secret key — that key can never live in this mobile app, and no such endpoint exists yet (see LEANR_PT_MOBILE_PRD.md §8g and the README's open items). This screen is otherwise fully wired and ready for it.`
    );
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
            <CtaButton onPress={() => onPurchase(plan.name)} style={{ marginTop: 12 }}>
              Purchase Plan
            </CtaButton>
          </Card>
        ))}
    </ScreenScaffold>
  );
}
