/**
 * Renewal Opportunities (coach, read-only) — LEANR_PT_MOBILE_PRD.md §5
 * "Renewal Opportunities (view)", §13 rule 16 ("renewal exception when
 * sessions_remaining <= 5, SESSIONS_LOW_THRESHOLD"). `SESSIONS_LOW_THRESHOLD`
 * is a hardcoded constant in the web app's source, not a `system_settings`
 * row (confirmed absent from the live table — see booking-wizard.ts's
 * settings dump) — reproduced here as the same hardcoded `5`, not
 * invented.
 *
 * Confirmed against the real schema/RLS on 2026-08-19:
 * `subscriptions_select_by_coach` (`coach_client_linked(my_coach_id(),
 * client_id)`) auto-scopes the plain SELECT below to the coach's own
 * linked clients. "sessions_remaining" is derived the same way it is
 * everywhere else in this codebase (subscription.ts) — `subscriptions`
 * has no such column; it's `sessions_total` minus a live count of
 * `completed` bookings for that subscription.
 */
import { supabase } from '@/lib/supabase/client';

export const SESSIONS_LOW_THRESHOLD = 5;

export type RenewalOpportunity = {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  sessionsTotal: number;
  sessionsRemaining: number;
  /**
   * Honest estimate only — `subscriptions` has no stored end date (same
   * finding as the client-side Subscription screen), so this is derived
   * from the client's actual recurring-slot cadence (sessionsRemaining /
   * sessions-per-week * 7), not a fabricated calendar date. `null` when
   * the client has no active weekly pattern to estimate from.
   */
  estimatedDaysRemaining: number | null;
};

export async function getRenewalOpportunities(): Promise<RenewalOpportunity[]> {
  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('id, client_id, sessions_total, client_profiles(profiles(full_name))')
    .eq('status', 'active');
  if (error) throw error;
  if (!subs || subs.length === 0) return [];

  const { data: slots, error: slotsError } = await supabase
    .from('recurring_slots')
    .select('client_id')
    .eq('status', 'active')
    .in(
      'client_id',
      subs.map((s) => s.client_id)
    );
  if (slotsError) throw slotsError;
  const slotsPerClient = new Map<string, number>();
  for (const s of slots ?? []) slotsPerClient.set(s.client_id, (slotsPerClient.get(s.client_id) ?? 0) + 1);

  const { data: completedCounts, error: countError } = await supabase
    .from('bookings')
    .select('subscription_id')
    .eq('status', 'completed')
    .in(
      'subscription_id',
      subs.map((s) => s.id)
    );
  if (countError) throw countError;

  const usedBySubscription = new Map<string, number>();
  for (const b of completedCounts ?? []) {
    if (!b.subscription_id) continue;
    usedBySubscription.set(b.subscription_id, (usedBySubscription.get(b.subscription_id) ?? 0) + 1);
  }

  return subs
    .map((s) => {
      const clientProfile = Array.isArray(s.client_profiles) ? s.client_profiles[0] : s.client_profiles;
      const profile = clientProfile ? (Array.isArray(clientProfile.profiles) ? clientProfile.profiles[0] : clientProfile.profiles) : null;
      const sessionsUsed = usedBySubscription.get(s.id) ?? 0;
      const sessionsRemaining = (s.sessions_total as number) - sessionsUsed;
      const perWeek = slotsPerClient.get(s.client_id as string) ?? 0;
      return {
        subscriptionId: s.id as string,
        clientId: s.client_id as string,
        clientName: profile?.full_name ?? 'Client',
        sessionsTotal: s.sessions_total as number,
        sessionsRemaining,
        estimatedDaysRemaining: perWeek > 0 ? Math.round((Math.max(sessionsRemaining, 0) / perWeek) * 7) : null,
      };
    })
    .filter((r) => r.sessionsRemaining <= SESSIONS_LOW_THRESHOLD)
    .sort((a, b) => a.sessionsRemaining - b.sessionsRemaining);
}
