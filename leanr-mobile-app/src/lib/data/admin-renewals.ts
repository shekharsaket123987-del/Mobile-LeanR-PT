/**
 * Admin Renewal Opportunities — New PRD.md §4.C "Screen: Renewal
 * Opportunities" — shared `RenewalOpportunitiesClient` with the Coach
 * column shown (unlike the coach's own view, coach-renewals.ts, where
 * every row is already "my client"). The underlying query is identical
 * to coach-renewals.ts — admin RLS (`subscriptions_admin_all`) simply
 * returns every client instead of RLS auto-scoping to one coach's roster.
 */
import { supabase } from '@/lib/supabase/client';

export const SESSIONS_LOW_THRESHOLD = 5;

export type AdminRenewalOpportunity = {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  coachName: string | null;
  sessionsTotal: number;
  sessionsRemaining: number;
  estimatedDaysRemaining: number | null;
};

export async function getAdminRenewalOpportunities(): Promise<AdminRenewalOpportunity[]> {
  const { data: subs, error } = await supabase.from('subscriptions').select('id, client_id, sessions_total, client_profiles(profiles(full_name))').eq('status', 'active');
  if (error) throw error;
  if (!subs || subs.length === 0) return [];

  const clientIds = subs.map((s) => s.client_id);
  const { data: slots, error: slotsError } = await supabase.from('recurring_slots').select('client_id, coach_id, coach_profiles(profiles(full_name))').eq('status', 'active').in('client_id', clientIds);
  if (slotsError) throw slotsError;

  const slotsPerClient = new Map<string, number>();
  const coachNameByClient = new Map<string, string>();
  for (const s of slots ?? []) {
    slotsPerClient.set(s.client_id, (slotsPerClient.get(s.client_id) ?? 0) + 1);
    if (!coachNameByClient.has(s.client_id)) {
      const cp = Array.isArray(s.coach_profiles) ? s.coach_profiles[0] : s.coach_profiles;
      const p = cp ? (Array.isArray(cp.profiles) ? cp.profiles[0] : cp.profiles) : null;
      coachNameByClient.set(s.client_id, p?.full_name ?? 'Coach');
    }
  }

  const { data: completedCounts, error: countError } = await supabase
    .from('bookings')
    .select('subscription_id')
    .eq('status', 'completed')
    .in('subscription_id', subs.map((s) => s.id));
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
        coachName: coachNameByClient.get(s.client_id as string) ?? null,
        sessionsTotal: s.sessions_total as number,
        sessionsRemaining,
        estimatedDaysRemaining: perWeek > 0 ? Math.round((Math.max(sessionsRemaining, 0) / perWeek) * 7) : null,
      };
    })
    .filter((r) => r.sessionsRemaining <= SESSIONS_LOW_THRESHOLD)
    .sort((a, b) => a.sessionsRemaining - b.sessionsRemaining);
}
