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
 */
import { getLatestDemoBooking } from '@/lib/data/demo-booking';
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

export async function getClientJourneyStage(): Promise<ClientJourneyStage> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return 'marketing';

  const latest = await getLatestSubscription();

  if (latest?.status === 'awaiting_activation') return 'awaiting_activation';

  if (latest?.status === 'active') {
    const onboarding = await getMyOnboarding();
    if (!onboarding) return 'onboarding';

    if (await isRenewalSubscription(clientId, latest.id)) {
      if (latest.activated_at && !(await hasProgressLoggedSince(clientId, latest.activated_at))) {
        return 'renewal_checkin';
      }
      if (!(await hasRecurringSlotsForSubscription(clientId, latest.id))) {
        return 'renewal_scheduling';
      }
      return 'active';
    }

    const slots = await getMyActiveRecurringSlots();
    if (slots.length === 0) return 'slot_selection';
    return 'active';
  }

  // No subscription, or one sitting at 'paused'/'inactive' with nothing newer — never a permanent trap.
  const demo = await getLatestDemoBooking();
  if (demo?.status === 'upcoming') return 'demo_booked';
  if (demo?.status === 'completed' || demo?.status === 'missed') return 'demo_completed';
  return 'marketing';
}

/** Narrow redirect-only view of the stage, kept for call sites that only care about the purchase->activate->onboarding funnel. */
export type JourneyGate = 'needs_activation' | 'needs_onboarding' | null;

export async function getClientJourneyGate(): Promise<JourneyGate> {
  const stage = await getClientJourneyStage();
  if (stage === 'awaiting_activation') return 'needs_activation';
  if (stage === 'onboarding') return 'needs_onboarding';
  return null;
}
