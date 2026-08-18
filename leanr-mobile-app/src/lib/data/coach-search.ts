/**
 * Global Client Search (coach) — LEANR_PT_MOBILE_PRD.md §5 "Global
 * Client Search", §3 "read-only global client search (any client, not
 * just own roster)". Confirmed against the real RLS on 2026-08-19:
 * `client_profiles_select_by_any_coach` (`my_role() = 'coach'`) really
 * does let any coach read every client profile, not just linked ones —
 * this is not a bug to route around, it's the documented feature.
 *
 * Kept to a name search + status/client-code display, no full detail
 * screen — §3 also says a coach "cannot see billing/progress detail for
 * non-assigned clients found via Global Search (read-only banner
 * shown)", so a detail view would mostly need to be a stub anyway; the
 * list itself is the useful part.
 */
import { getCoachClients } from '@/lib/data/coach-portal';
import { supabase } from '@/lib/supabase/client';

export type ClientSearchResult = {
  id: string;
  fullName: string;
  clientCode: string;
  status: string;
  isMyClient: boolean;
};

export async function searchClients(query: string): Promise<ClientSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [{ data, error }, myClients] = await Promise.all([
    supabase
      .from('client_profiles')
      .select('id, client_code, status, profiles!inner(full_name)')
      .ilike('profiles.full_name', `%${trimmed}%`)
      .limit(25),
    getCoachClients(),
  ]);
  if (error) throw error;

  const myClientIds = new Set(myClients.map((c) => c.id));

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id as string,
      fullName: profile?.full_name ?? 'Client',
      clientCode: row.client_code as string,
      status: row.status as string,
      isMyClient: myClientIds.has(row.id as string),
    };
  });
}
