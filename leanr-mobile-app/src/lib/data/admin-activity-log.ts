/**
 * Admin Activity Log — New PRD.md §4.C "Screen: Activity Log" — fully
 * server-rendered, entity-type filter pills, row: action badge
 * (INSERT/UPDATE/DELETE), entity type, actor name, computed diff
 * summary. `audit_logs` has only an admin SELECT policy (trigger-only
 * writes, confirmed live) and covers exactly 7 tables (New PRD.md §25).
 */
import { supabase } from '@/lib/supabase/client';

export const ENTITY_TYPES = ['bookings', 'subscriptions', 'coach_change_requests', 'client_profiles', 'coach_profiles', 'package_tiers', 'system_settings'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type AuditLogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  createdAt: string;
  summary: string;
};

function diffSummary(action: string, oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): string {
  if (action === 'INSERT') return 'Created';
  if (action === 'DELETE') return 'Deleted';
  if (!oldData || !newData) return 'Updated';
  const changed = Object.keys(newData).filter((k) => JSON.stringify(newData[k]) !== JSON.stringify(oldData[k]));
  if (changed.length === 0) return 'Updated';
  return `Changed: ${changed.slice(0, 4).join(', ')}${changed.length > 4 ? '…' : ''}`;
}

export async function getAuditLog(entityType?: EntityType): Promise<AuditLogRow[]> {
  let query = supabase.from('audit_logs').select('id, actor_id, action, entity_type, entity_id, old_data, new_data, created_at').order('created_at', { ascending: false }).limit(200);
  if (entityType) query = query.eq('entity_type', entityType);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
  const actorNameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, full_name').in('id', actorIds);
    if (profilesError) throw profilesError;
    for (const p of profiles ?? []) actorNameById.set(p.id, p.full_name ?? 'Unknown');
  }

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    actorName: r.actor_id ? (actorNameById.get(r.actor_id) ?? 'Unknown') : 'System',
    createdAt: r.created_at,
    summary: diffSummary(r.action, r.old_data as Record<string, unknown> | null, r.new_data as Record<string, unknown> | null),
  }));
}
