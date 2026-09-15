/**
 * Admin Escalations — LEANR_PT_MOBILE_PRD.md §10 "Screen: Escalation
 * Detail (admin) — GATED WORKFLOW", §13 rule 22 ("no field on an
 * escalation can be edited until `called_client_at` is set"). Confirmed
 * against the real schema/RLS on 2026-08-19: `escalations_admin_all`/
 * `escalation_notes_admin_all` give admin full read/write, no
 * restrictions beyond `is_admin()`.
 *
 * Rule 22's call-gate is enforced by a DB trigger (`escalations_call_gate` /
 * `escalation_notes_call_gate`, see
 * supabase/migrations/20260907120000_escalation_call_gate_trigger.sql) that
 * rejects the same mutations at the database layer — the real trust
 * boundary for a client that talks to Supabase directly, since there is no
 * server-action layer in front of it here. The functions below do not
 * duplicate the check client-side; the UI (escalation/[id].tsx) simply
 * hides the assessment/notes/resolve UI until `called_client_at` is set,
 * so the trigger's rejection is never actually exercised in normal use.
 *
 * `admin_issue_type` is a free-text column (no DB constraint); `fault` is
 * free-text at the column level but DB CHECK-constrained to exactly 6
 * values. Both vocabularies are confirmed canonical (Gap Verification
 * Report, Area 9 — src/lib/constants/concern-categories.ts) — see
 * ISSUE_TYPE_OPTIONS/FAULT_OPTIONS in escalation/[id].tsx.
 */
import { supabase } from '@/lib/supabase/client';
import { notifyProfile, resolveProfileIdForClient } from './notify';
import type { EscalationStatus } from './concerns';

export type AdminEscalation = {
  id: string;
  reason: string;
  description: string | null;
  category: string | null;
  status: EscalationStatus;
  created_at: string;
  resolved_at: string | null;
  called_client_at: string | null;
  admin_issue_type: string | null;
  fault: string | null;
  admin_summary: string | null;
  resolution_notes: string | null;
  clientCode: string | null;
  clientName: string | null;
  coachName: string | null;
  packageName: string | null;
};

export type EscalationNote = { id: string; note: string; created_at: string; authorName: string | null };

function pickName(rel: unknown): string | null {
  const row = Array.isArray(rel) ? rel[0] : rel;
  if (!row) return null;
  const profile = Array.isArray((row as { profiles?: unknown }).profiles)
    ? ((row as { profiles?: unknown[] }).profiles as { full_name?: string }[])[0]
    : ((row as { profiles?: { full_name?: string } }).profiles ?? null);
  return profile?.full_name ?? null;
}

const ESCALATION_FIELDS =
  'id, client_id, reason, description, category, status, created_at, resolved_at, called_client_at, admin_issue_type, fault, admin_summary, resolution_notes, client_profiles(client_code, profiles(full_name)), coach_profiles(profiles(full_name))';

function mapEscalation(row: any, packageName: string | null): AdminEscalation {
  const clientRow = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
  return {
    id: row.id,
    reason: row.reason,
    description: row.description,
    category: row.category,
    status: row.status,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    called_client_at: row.called_client_at,
    admin_issue_type: row.admin_issue_type,
    fault: row.fault,
    admin_summary: row.admin_summary,
    resolution_notes: row.resolution_notes,
    clientCode: clientRow?.client_code ?? null,
    clientName: pickName(row.client_profiles),
    coachName: pickName(row.coach_profiles),
    packageName,
  };
}

// Matches web's list card (AdminEscalationsClient.tsx:60-80), which shows
// `· {packageName}` from the client's active subscription -> package tier.
async function getPackageNamesByClientId(clientIds: string[]): Promise<Map<string, string>> {
  if (clientIds.length === 0) return new Map();
  const { data, error } = await supabase.from('subscriptions').select('client_id, package:package_tiers(name)').eq('status', 'active').in('client_id', clientIds);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const s of data ?? []) {
    const pkg = Array.isArray(s.package) ? s.package[0] : s.package;
    if (pkg?.name) map.set(s.client_id, pkg.name);
  }
  return map;
}

export async function getAllEscalations(tab: 'active' | 'resolved'): Promise<AdminEscalation[]> {
  let query = supabase.from('escalations').select(ESCALATION_FIELDS).order('created_at', { ascending: false });
  query = tab === 'active' ? query.neq('status', 'resolved') : query.eq('status', 'resolved');

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const clientIds = [...new Set(rows.map((r: any) => r.client_id).filter(Boolean))] as string[];
  const packageByClient = await getPackageNamesByClientId(clientIds);
  return rows.map((row: any) => mapEscalation(row, packageByClient.get(row.client_id) ?? null));
}

export async function getEscalationById(id: string): Promise<AdminEscalation | null> {
  const { data, error } = await supabase.from('escalations').select(ESCALATION_FIELDS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const packageByClient = await getPackageNamesByClientId(data.client_id ? [data.client_id] : []);
  return mapEscalation(data, packageByClient.get(data.client_id) ?? null);
}

export async function getEscalationNotes(escalationId: string): Promise<EscalationNote[]> {
  const { data, error } = await supabase
    .from('escalation_notes')
    .select('id, note, created_at, author:profiles(full_name)')
    .eq('escalation_id', escalationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    note: row.note,
    created_at: row.created_at,
    authorName: (Array.isArray(row.author) ? row.author[0]?.full_name : row.author?.full_name) ?? null,
  }));
}

export async function confirmCalledClient(id: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('escalations')
    .update({ called_client_at: new Date().toISOString(), called_by: userData.user?.id })
    .eq('id', id);
  if (error) throw error;
}

export async function updateEscalationAssessment(
  id: string,
  updates: { adminIssueType: string | null; fault: string | null; adminSummary: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('escalations')
    .update({ admin_issue_type: updates.adminIssueType, fault: updates.fault, admin_summary: updates.adminSummary })
    .eq('id', id);
  if (error) throw error;
}

export async function addEscalationNote(escalationId: string, note: string): Promise<void> {
  const { error } = await supabase.from('escalation_notes').insert({ escalation_id: escalationId, note });
  if (error) throw error;
}

export async function markEscalationInProgress(id: string): Promise<void> {
  const { error } = await supabase.from('escalations').update({ status: 'in_progress' }).eq('id', id);
  if (error) throw error;
}

export async function resolveEscalation(id: string, resolutionNotes: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { data: row, error: fetchError } = await supabase.from('escalations').select('client_id, reason').eq('id', id).single();
  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from('escalations')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: userData.user?.id,
      resolution_notes: resolutionNotes,
    })
    .eq('id', id);
  if (error) throw error;

  const clientProfileId = await resolveProfileIdForClient(row.client_id);
  await notifyProfile(clientProfileId, 'feedback', 'Your concern was resolved', `We resolved your concern (${row.reason}): ${resolutionNotes}`, 'escalation_resolved_client');
}
