/**
 * Client journey stage — the mobile equivalent of the web app's full
 * `ClientJourneyStage` state machine (ClientPortal.md §4.0), evaluated
 * fresh on every call, no client-side caching. Evaluation order mirrors
 * the spec exactly (first match wins):
 *   1. Latest subscription → if `awaiting_activation`, stop there.
 *   2. If `active` → onboarding missing? → renewal-only steps (only if an
 *      older subscription exists for this client) → recurring slots exist?
 *      → else `active`.
 *   3. If `paused`/`inactive` with nothing newer → falls through to the
 *      demo/marketing check as if no subscription existed at all — a
 *      client is never permanently stuck (access restrictions for a
 *      paused plan are a separate, independent concern from this routing
 *      stage — see §4.8/§17).
 *   4. No usable subscription → latest demo booking → `demo_booked` /
 *      `demo_completed` / `marketing`.
 *
 * mobile-app-reference/audit/demo-booking-workflow.md §8.4/§9.2: the web
 * app's `getMyJourneyStateAction()` returns the full `demoSession` detail
 * alongside the stage in ONE response — callers never re-fetch it. Mirrored
 * here via `getClientJourneyState()`; `getClientJourneyStage()` is kept as a
 * thin stage-only wrapper for callers (activate.tsx, index.tsx) that never
 * needed the demo detail in the first place.
 */
import { getDemoAssignedCoach, type DemoAssignedCoach } from '@/lib/data/demo-booking';
import { getMyClientProfileId } from '@/lib/data/identity';
import { getMyOnboarding } from '@/lib/data/onboarding';
import { getMyActiveRecurringSlots } from '@/lib/data/recurring-schedule';
import { getLatestSubscription } from '@/lib/data/subscription';
import { supabase } from '@/lib/supabase/client';

export type ClientJourneyStage =
  | 'marketing'
  | 'demo_booked'
  | 'demo_completed'
  | 'awaiting_activation'
  | 'onboarding'
  | 'renewal_checkin'
  | 'renewal_scheduling'
  | 'slot_selection'
  | 'active';

export type ClientJourneyState = {
  stage: ClientJourneyStage;
  /** Only populated for demo_booked/demo_completed — the client's most recent demo booking, auto-assigned coach and all. */
  demoSession: DemoAssignedCoach | null;
};

/** "Is this a renewal?" — true when the client has any other subscription row besides the current one. */
async function isRenewalSubscription(clientId: string, currentSubscriptionId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .neq('id', currentSubscriptionId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function hasProgressLoggedSince(clientId: string, sinceIso: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('progress_logs')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('logged_at', sinceIso);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Any recurring_slots row billed against this specific subscription — any status, existence only. */
async function hasRecurringSlotsForSubscription(clientId: string, subscriptionId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('recurring_slots')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('subscription_id', subscriptionId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function getClientJourneyState(): Promise<ClientJourneyState> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return { stage: 'marketing', demoSession: null };

  // Every helper below takes the already-resolved clientId to skip its own redundant
  // getMyClientProfileId() round trip — this function was previously re-resolving identity
  // (auth.getUser() + client_profiles lookup) up to 4 times per call.
  const latest = await getLatestSubscription(clientId);

  if (latest?.status === 'awaiting_activation') return { stage: 'awaiting_activation', demoSession: null };

  if (latest?.status === 'active') {
    // Onboarding-existence and renewal-ness are independent checks — fetched together instead
    // of one after the other; the renewal result is simply unused in the (common) case where
    // onboarding is still missing.
    const [onboarding, isRenewal] = await Promise.all([
      getMyOnboarding(clientId),
      isRenewalSubscription(clientId, latest.id),
    ]);
    if (!onboarding) return { stage: 'onboarding', demoSession: null };

    if (isRenewal) {
      if (latest.activated_at && !(await hasProgressLoggedSince(clientId, latest.activated_at))) {
        return { stage: 'renewal_checkin', demoSession: null };
      }
      if (!(await hasRecurringSlotsForSubscription(clientId, latest.id))) {
        return { stage: 'renewal_scheduling', demoSession: null };
      }
      return { stage: 'active', demoSession: null };
    }

    const slots = await getMyActiveRecurringSlots(clientId);
    if (slots.length === 0) return { stage: 'slot_selection', demoSession: null };
    return { stage: 'active', demoSession: null };
  }

  // No subscription, or one sitting at 'paused'/'inactive' with nothing newer — never a permanent trap.
  const demoSession = await getDemoAssignedCoach();
  if (demoSession?.status === 'upcoming') return { stage: 'demo_booked', demoSession };
  if (demoSession?.status === 'completed' || demoSession?.status === 'missed') return { stage: 'demo_completed', demoSession };
  return { stage: 'marketing', demoSession: null };
}

/** Narrow stage-only view for callers that never needed the demo detail (activate.tsx, index.tsx). */
export async function getClientJourneyStage(): Promise<ClientJourneyStage> {
  return (await getClientJourneyState()).stage;
}

/** Narrow redirect-only view of the stage, kept for call sites that only care about the purchase->activate->onboarding funnel. */
export type JourneyGate = 'needs_activation' | 'needs_onboarding' | null;

export async function getClientJourneyGate(): Promise<JourneyGate> {
  const stage = await getClientJourneyStage();
  if (stage === 'awaiting_activation') return 'needs_activation';
  if (stage === 'onboarding') return 'needs_onboarding';
  return null;
}
