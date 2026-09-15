/**
 * Admin Renewal Opportunities — New PRD.md §4.C "Screen: Renewal
 * Opportunities" — shared shape with the coach's own view (coach-renewals.ts),
 * with the Coach column additionally shown here (unlike the coach's own view,
 * where every row is already "my client").
 *
 * Parity fix (2026-09-14, admin-parity sweep #8): matches web's
 * `src/lib/services/renewals.service.ts` exactly —
 * - Web's `RENEWAL_OPPORTUNITY_THRESHOLD = 10` (a wider, staff-only bar,
 *   deliberately more than the client's own `SESSIONS_LOW_THRESHOLD = 5`,
 *   so staff see it coming first) — this file previously reused
 *   `SESSIONS_LOW_THRESHOLD` for the admin list, which was wrong.
 * - Web also surfaces a second category, "expired" — a client who has
 *   *ever* had a subscription (any status) but has none active right now.
 *   That bucket was entirely missing here; this file only ever queried
 *   active subscriptions, so an admin could never see lapsed clients who
 *   need re-selling. Added below via a `hasEverSubscribed`/`converted`
 *   pass over all subscription rows (not just active), same as web's
 *   `listClients()` (`clients.service.ts:107-118`).
 *
 * `sessionsRemaining` is still derived the same way it is everywhere else
 * in this codebase (sessions_total minus a live count of `completed`
 * bookings for that subscription) — not changed here; that's an
 * app-wide, already-established pattern, not a renewals-specific gap.
 */
import { supabase } from '@/lib/supabase/client';

/** Kept only as a citation of the client-facing gate's own threshold — not
 * used for filtering here anymore (see RENEWAL_OPPORTUNITY_THRESHOLD). */
export const SESSIONS_LOW_THRESHOLD = 5;

/** Matches web's `renewals.service.ts:7` exactly. */
export const RENEWAL_OPPORTUNITY_THRESHOLD = 10;

export type AdminRenewalOpportunity = {
  clientId: string;
  clientCode: string;
  clientName: string;
  clientPhoto: string | null;
  coachName: string | null;
  packageName: string | null;
  sessionsTotal: number | null;
  sessionsRemaining: number;
  estimatedDaysRemaining: number | null;
  category: 'opportunity' | 'expired';
  /** Has this client ever purchased a second plan — matches web's exact
   * proxy for "already renewed" (more than one subscription row ever). */
  converted: boolean;
};

export async function getAdminRenewalOpportunities(): Promise<AdminRenewalOpportunity[]> {
  const { data: clients, error: clientsError } = await supabase.from('client_profiles').select('id, client_code, profiles(full_name, photo_url)');
  if (clientsError) throw clientsError;
  if (!clients || clients.length === 0) return [];

  const clientIds = clients.map((c) => c.id);

  const { data: allSubs, error: subsError } = await supabase
    .from('subscriptions')
    .select('id, client_id, status, sessions_total, package:package_tiers(name)')
    .in('client_id', clientIds);
  if (subsError) throw subsError;

  const { data: slots, error: slotsError } = await supabase
    .from('recurring_slots')
    .select('client_id, coach_profiles(profiles(full_name))')
    .eq('status', 'active')
    .in('client_id', clientIds);
  if (slotsError) throw slotsError;

  const slotsPerClient = new Map<string, number>();
  const coachNameByClient = new Map<string, string>();
  for (const s of slots ?? []) {
    slotsPerClient.set(s.client_id, (slotsPerClient.get(s.client_id) ?? 0) + 1);
    if (!coachNameByClient.has(s.client_id)) {
      const cp = Array.isArray(s.coach_profiles) ? s.coach_profiles[0] : s.coach_profiles;
      const p = cp ? (Array.isArray(cp.profiles) ? cp.profiles[0] : cp.profiles) : null;
      if (p?.full_name) coachNameByClient.set(s.client_id, p.full_name);
    }
  }

  const activeSubs = (allSubs ?? []).filter((s) => s.status === 'active');
  const { data: completedCounts, error: countError } =
    activeSubs.length > 0
      ? await supabase
          .from('bookings')
          .select('subscription_id')
          .eq('status', 'completed')
          .in(
            'subscription_id',
            activeSubs.map((s) => s.id)
          )
      : { data: [], error: null };
  if (countError) throw countError;
  const usedBySubscription = new Map<string, number>();
  for (const b of completedCounts ?? []) {
    if (!b.subscription_id) continue;
    usedBySubscription.set(b.subscription_id, (usedBySubscription.get(b.subscription_id) ?? 0) + 1);
  }

  const subsByClient = new Map<string, typeof allSubs>();
  for (const s of allSubs ?? []) {
    const arr = subsByClient.get(s.client_id) ?? [];
    arr.push(s);
    subsByClient.set(s.client_id, arr);
  }

  const rows: AdminRenewalOpportunity[] = [];
  for (const c of clients) {
    const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
    const subsForClient = subsByClient.get(c.id) ?? [];
    const hasEverSubscribed = subsForClient.length > 0;
    const converted = subsForClient.length > 1;
    const activeSub = subsForClient.find((s) => s.status === 'active');

    let category: 'opportunity' | 'expired' | null = null;
    let sessionsRemaining = 0;
    let sessionsTotal: number | null = null;
    let packageName: string | null = null;
    let estimatedDaysRemaining: number | null = null;

    if (activeSub) {
      const sessionsUsed = usedBySubscription.get(activeSub.id) ?? 0;
      sessionsRemaining = (activeSub.sessions_total as number) - sessionsUsed;
      sessionsTotal = activeSub.sessions_total as number;
      const pkg = Array.isArray(activeSub.package) ? activeSub.package[0] : activeSub.package;
      packageName = pkg?.name ?? null;
      const perWeek = slotsPerClient.get(c.id) ?? 0;
      estimatedDaysRemaining = perWeek > 0 ? Math.round((Math.max(sessionsRemaining, 0) / perWeek) * 7) : null;
      if (sessionsRemaining <= RENEWAL_OPPORTUNITY_THRESHOLD) category = 'opportunity';
    } else if (hasEverSubscribed) {
      category = 'expired';
    }

    if (!category) continue;

    rows.push({
      clientId: c.id,
      clientCode: c.client_code ?? '',
      clientName: profile?.full_name ?? 'Client',
      clientPhoto: profile?.photo_url ?? null,
      coachName: coachNameByClient.get(c.id) ?? null,
      packageName,
      sessionsTotal,
      sessionsRemaining,
      estimatedDaysRemaining,
      category,
      converted,
    });
  }

  return rows.sort((a, b) => a.sessionsRemaining - b.sessionsRemaining);
}
