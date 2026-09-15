/**
 * Admin Universal Search — New PRD.md §4.C "Screen: Search (Universal
 * Client Search)" — "Unrestricted (admin has full read access
 * already)." The approved UI reference (frame 3) shows three result
 * categories (Coaches/Plans, alongside clients) under one search bar,
 * so this searches all three entity types admin can manage, not just
 * clients — same identifiers the PRD lists (§4 "Client ID, Client name,
 * Coach, Other supported entities").
 */
import { supabase } from '@/lib/supabase/client';

export type AdminSearchResult =
  | { kind: 'client'; id: string; title: string; subtitle: string }
  | { kind: 'coach'; id: string; title: string; subtitle: string }
  | { kind: 'plan'; id: string; title: string; subtitle: string };

export async function searchAdmin(query: string): Promise<AdminSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Web's searchAdminClientsAction matches name, client ID, AND phone (screen's own
  // placeholder promises the same); a name-only ilike here silently broke that promise
  // for client_code/phone, so run one targeted query per matchable field and merge.
  const clientSelect = 'id, client_code, status, profiles!inner(full_name, phone)';
  const [clientsByName, clientsByCode, clientsByPhone, coachesRes, plansRes] = await Promise.all([
    supabase.from('client_profiles').select(clientSelect).ilike('profiles.full_name', `%${trimmed}%`).limit(15),
    supabase.from('client_profiles').select(clientSelect).ilike('client_code', `%${trimmed}%`).limit(15),
    supabase.from('client_profiles').select(clientSelect).ilike('profiles.phone', `%${trimmed}%`).limit(15),
    supabase.from('coach_profiles').select('id, employee_code, status, specialization, profiles!inner(full_name)').ilike('profiles.full_name', `%${trimmed}%`).limit(15),
    supabase.from('package_tiers').select('id, name, category, is_active').ilike('name', `%${trimmed}%`).limit(10),
  ]);
  if (clientsByName.error) throw clientsByName.error;
  if (clientsByCode.error) throw clientsByCode.error;
  if (clientsByPhone.error) throw clientsByPhone.error;
  if (coachesRes.error) throw coachesRes.error;
  if (plansRes.error) throw plansRes.error;

  const clientRowsById = new Map<string, (typeof clientsByName.data)[number]>();
  for (const row of [...(clientsByName.data ?? []), ...(clientsByCode.data ?? []), ...(clientsByPhone.data ?? [])]) {
    clientRowsById.set(row.id as string, row);
  }
  const clients: AdminSearchResult[] = [...clientRowsById.values()].slice(0, 15).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const phone = profile?.phone ? ` · ${profile.phone}` : '';
    return { kind: 'client', id: row.id as string, title: profile?.full_name ?? 'Client', subtitle: `#${row.client_code} · ${row.status}${phone}` };
  });
  const coaches: AdminSearchResult[] = (coachesRes.data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { kind: 'coach', id: row.id as string, title: profile?.full_name ?? 'Coach', subtitle: `${row.specialization ?? 'Coach'} · ${row.status}` };
  });
  const plans: AdminSearchResult[] = (plansRes.data ?? []).map((row) => ({
    kind: 'plan',
    id: row.id as string,
    title: row.name as string,
    subtitle: `${row.category}${row.is_active ? '' : ' · inactive'}`,
  }));

  return [...clients, ...coaches, ...plans];
}
