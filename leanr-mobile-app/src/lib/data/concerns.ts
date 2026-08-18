/**
 * My Concerns (client-raised escalations) — LEANR_PT_MOBILE_PRD.md §10
 * "My Concerns" row, §3 "Restricted: cannot resolve escalations... can
 * only raise/request them", §13 rule 22 (the admin-only resolution gate
 * — not reproduced here since a client can never edit an escalation
 * after raising it). Confirmed against the real schema/RLS on
 * 2026-08-18: clients can INSERT/SELECT their own `escalations` rows and
 * SELECT (never write) `escalation_notes` for them.
 *
 * `category` is a free-text column, not a DB enum — only two values
 * exist in the live data ('technical_issue', 'other'). The chip set
 * below is a reasonable inferred vocabulary (Design Principle #4: chips
 * over free text), not a confirmed canonical list; being free text, an
 * unexpected value here can't fail a constraint either way.
 */
import { getMyCoach } from '@/lib/data/coach';
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';

export type ConcernCategory = 'coach' | 'scheduling' | 'billing' | 'technical_issue' | 'other';

export const CONCERN_CATEGORIES: { value: ConcernCategory; label: string }[] = [
  { value: 'coach', label: 'Coach' },
  { value: 'scheduling', label: 'Scheduling' },
  { value: 'billing', label: 'Billing' },
  { value: 'technical_issue', label: 'Technical issue' },
  { value: 'other', label: 'Other' },
];

export type EscalationStatus = 'open' | 'in_progress' | 'resolved';

export type Concern = {
  id: string;
  reason: string;
  description: string | null;
  category: string | null;
  status: EscalationStatus;
  created_at: string;
  resolution_notes: string | null;
};

export type ConcernNote = {
  id: string;
  escalation_id: string;
  note: string;
  created_at: string;
};

export async function getMyConcerns(): Promise<Concern[]> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('escalations')
    .select('id, reason, description, category, status, created_at, resolution_notes')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Concern[];
}

/** Admin-added, client-visible progress notes, grouped by concern. */
export async function getNotesForConcerns(escalationIds: string[]): Promise<Record<string, ConcernNote[]>> {
  if (escalationIds.length === 0) return {};

  const { data, error } = await supabase
    .from('escalation_notes')
    .select('id, escalation_id, note, created_at')
    .in('escalation_id', escalationIds)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const byEscalation: Record<string, ConcernNote[]> = {};
  for (const note of (data ?? []) as ConcernNote[]) {
    (byEscalation[note.escalation_id] ??= []).push(note);
  }
  return byEscalation;
}

export async function raiseConcern(input: {
  reason: string;
  description: string | null;
  category: ConcernCategory;
}): Promise<void> {
  const clientId = await getMyClientProfileId();
  if (!clientId) throw new Error('Could not resolve your client profile.');
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in.');

  // Best-effort link to the client's current coach — a client with no
  // coach assigned yet can still raise a concern (escalations.coach_id
  // is nullable).
  const coach = await getMyCoach();

  const { error } = await supabase.from('escalations').insert({
    client_id: clientId,
    coach_id: coach?.id ?? null,
    raised_by: userData.user.id,
    reason: input.reason,
    description: input.description,
    category: input.category,
  });
  if (error) throw error;
}
