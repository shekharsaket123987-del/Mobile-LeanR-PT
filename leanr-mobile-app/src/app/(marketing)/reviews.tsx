/**
 * Reviews — static testimonials, read-only. New PRD.md §4.D documents the
 * web landing page's own "Testimonials (4 fabricated transformation
 * stories)" section; this reproduces that as its own tab per the mockup's
 * nav rather than inventing a review-authoring feature that doesn't exist
 * anywhere in the audited web app. Content shared with (client)/reviews.tsx.
 */
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightTestimonialsList } from '@/components/light/light-testimonials-list';

export default function ReviewsScreen() {
  return (
    <LightScreenScaffold title="Client Reviews" subtitle="Real stories from the LEANR community.">
      <LightTestimonialsList />
    </LightScreenScaffold>
  );
}
