/**
 * Client journey gate — the mobile equivalent of the web app's Dashboard
 * "master gate" (a client with a pending activation or missing onboarding
 * gets routed there before anything else renders). Deliberately a reduced
 * two-stage gate, not the web app's full 9-stage journey state machine —
 * demo/renewal-specific stages are a separate, later slice; this only
 * covers the purchase -> activate -> onboarding funnel that today skips
 * straight from purchase to schedule setup with neither step.
 */
import { getMyOnboarding } from '@/lib/data/onboarding';
import { getLatestSubscription, getPendingActivationSubscription } from '@/lib/data/subscription';

export type JourneyGate = 'needs_activation' | 'needs_onboarding' | null;

export async function getClientJourneyGate(): Promise<JourneyGate> {
  const pending = await getPendingActivationSubscription();
  if (pending) return 'needs_activation';

  const latest = await getLatestSubscription();
  if (!latest) return null; // never subscribed — today's marketing/empty states handle this

  const onboarding = await getMyOnboarding();
  if (!onboarding) return 'needs_onboarding';

  return null;
}
