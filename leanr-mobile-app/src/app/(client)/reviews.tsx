/**
 * Reviews — pre-purchase only tab (mockup's Home/Plans/Reviews/More set).
 * The post-purchase dark experience has no "Reviews" tab at all — if
 * somehow reached directly while `hasEverPurchased`, redirect home rather
 * than show orphaned content with no nav entry pointing at it.
 */
import { Redirect } from 'expo-router';

import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightTestimonialsList } from '@/components/light/light-testimonials-list';
import { getLatestSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

export default function ReviewsScreen() {
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;
  if (subscription) return <Redirect href="/(client)" />;

  return (
    <LightScreenScaffold title="Client Reviews" subtitle="Real stories from the LEANR community.">
      <LightTestimonialsList />
    </LightScreenScaffold>
  );
}
