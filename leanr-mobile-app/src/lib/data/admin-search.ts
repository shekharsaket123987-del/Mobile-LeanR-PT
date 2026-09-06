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

  const [clientsRes, coachesRes, plansRes] = await Promise.all([
    supabase.from('client_profiles').select('id, client_code, status, profiles!inner(full_name)').ilike('profiles.full_name', `%${trimmed}%`).limit(15),
    supabase.from('coach_profiles').select('id, employee_code, status, specialization, profiles!inner(full_name)').ilike('profiles.full_name', `%${trimmed}%`).limit(15),
    supabase.from('package_tiers').select('id, name, category, is_active').ilike('name', `%${trimmed}%`).limit(10),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (coachesRes.error) throw coachesRes.error;
  if (plansRes.error) throw plansRes.error;

  const clients: AdminSearchResult[] = (clientsRes.data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { kind: 'client', id: row.id as string, title: profile?.full_name ?? 'Client', subtitle: `#${row.client_code} · ${row.status}` };
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
