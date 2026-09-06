/**
 * My Concerns (client-raised escalations) — New PRD.md §4.A "My Concerns",
 * §3 "Restricted: cannot resolve escalations... can only raise/request
 * them" — not reproduced here since a client can never edit an escalation
 * after raising it. Confirmed against the real schema/RLS: clients can
 * INSERT/SELECT their own `escalations` rows and SELECT (never write)
 * `escalation_notes` for them.
 *
 * `category` DOES have a DB CHECK constraint (`escalations_category_check`,
 * confirmed directly via `pg_constraint` — an earlier pass here believed
 * it was free-text based on incomplete live data and shipped an invented
 * 5-value set instead; corrected to the real, DB-enforced 7 values below).
 */
import { getMyCoach } from '@/lib/data/coach';
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';

export type ConcernCategory =
  | 'slot_not_available'
  | 'coach_missed_session'
  | 'need_schedule_change'
  | 'payment_issue'
  | 'technical_issue'
  | 'want_coach_change'
  | 'other';

export const CONCERN_CATEGORIES: { value: ConcernCategory; label: string }[] = [
  { value: 'slot_not_available', label: 'Slot not available' },
  { value: 'coach_missed_session', label: 'Coach missed session' },
  { value: 'need_schedule_change', label: 'Need schedule change' },
  { value: 'payment_issue', label: 'Payment issue' },
  { value: 'technical_issue', label: 'Technical issue' },
  { value: 'want_coach_change', label: 'Want coach change' },
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
