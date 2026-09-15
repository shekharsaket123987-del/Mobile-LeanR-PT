/**
 * Client Timeline — mobile-app-reference/audit/timeline.md. An append-only
 * audit log of everything meaningful that happens on a client's account,
 * visible to Admin (any client) and Coach (their own linked clients, or any
 * client read-only via Global Search) — never to the client themselves.
 *
 * One shared write helper (`logTimelineEvent`) is called as a side effect
 * from inside each mutating service function across the app (bookings,
 * subscriptions, escalations, etc.) — never bolted on from the UI layer.
 * Writes go through the regular RLS-scoped `supabase` client (no
 * service-role key ships in this app, unlike the web's `supabaseAdmin`) —
 * see the `client_timeline_events_rls_hardening` migration for the INSERT
 * policies that make this possible for both client- and coach-triggered
 * events.
 */
import { supabase } from '@/lib/supabase/client';

export type TimelineEventType =
  | 'plan_purchased'
  | 'plan_activated'
  | 'onboarding_completed'
  | 'coach_assigned'
  | 'slot_assigned'
  | 'session_completed'
  | 'session_missed'
  | 'attendance_marked_present'
  | 'session_cancelled'
  | 'coach_notes_uploaded'
  | 'weekly_measurements_updated'
  | 'client_raised_concern'
  | 'escalation_created'
  | 'escalation_resolved'
  | 'pause_started'
  | 'pause_ended'
  | 'coach_changed'
  | 'shadow_coach_assigned'
  | 'manual_session_added'
  | 'session_rescheduled'
  | 'plan_extended'
  | 'plan_renewed'
  | 'refund_requested'
  | 'refund_approved'
  | 'plan_completed'
  | 'plan_promise_adjusted'
  | 'client_status_changed';

/** Which timeline column an event belongs to — fixed per event_type rather than
 * derived from who technically clicked the button, so e.g. an admin backfilling
 * a client's weight on their behalf still renders as a customer-side
 * measurement, not an admin action. */
export type TimelineSide = 'internal' | 'customer';

/** cancelBooking()/rescheduleBooking() are callable by both staff and the client
 * themselves — for these two, TIMELINE_EVENT_SIDE below is only a fallback for a
 * null/unresolved actor; listClientTimeline() overrides it per-row using the
 * actual actor's role, so a client's own reschedule renders on their side, not
 * staff's. */
export const ACTOR_DEPENDENT_SIDE_TYPES: ReadonlySet<TimelineEventType> = new Set(['session_cancelled', 'session_rescheduled']);

export const TIMELINE_EVENT_SIDE: Record<TimelineEventType, TimelineSide> = {
  plan_purchased: 'internal',
  plan_activated: 'internal',
  onboarding_completed: 'customer',
  coach_assigned: 'internal',
  slot_assigned: 'internal',
  session_completed: 'internal',
  session_missed: 'internal',
  attendance_marked_present: 'internal',
  session_cancelled: 'internal',
  coach_notes_uploaded: 'internal',
  weekly_measurements_updated: 'customer',
  client_raised_concern: 'customer',
  escalation_created: 'customer',
  escalation_resolved: 'customer',
  pause_started: 'internal',
  pause_ended: 'internal',
  coach_changed: 'internal',
  shadow_coach_assigned: 'internal',
  manual_session_added: 'internal',
  session_rescheduled: 'internal',
  plan_extended: 'internal',
  plan_renewed: 'internal',
  refund_requested: 'internal',
  refund_approved: 'internal',
  plan_completed: 'internal',
  plan_promise_adjusted: 'internal',
  client_status_changed: 'internal',
};

/** Who/what to show on the card's "Added by" line. "staff"/"customer" come from
 * the actor's own profiles.role; "system" is the fallback for an internal-side
 * event with no actor (an automated transition); "unknown" renders as N/A — e.g.
 * an admin logging a concern on a client's behalf, where the row deliberately
 * has no actor. */
export type TimelineActorSource = 'staff' | 'system' | 'customer' | 'unknown';

/**
 * Called as a side effect of another service's mutation (booking completed,
 * coach changed, escalation raised, etc). `actorId` defaults to the current
 * signed-in user; pass `null` explicitly for the deliberately actor-less
 * writes the spec calls out (e.g. an admin logging a concern on a client's
 * behalf with no actor recorded). Entries are permanent: no update/delete RLS
 * policy exists for any role, so nothing in the app layer can revise history
 * either.
 */
export async function logTimelineEvent(
  clientId: string,
  eventType: TimelineEventType,
  title: string,
  options?: { description?: string; metadata?: Record<string, unknown>; actorId?: string | null }
): Promise<void> {
  let actorId = options?.actorId;
  if (actorId === undefined) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    actorId = user?.id ?? null;
  }

  const { error } = await supabase.from('client_timeline_events').insert({
    client_id: clientId,
    event_type: eventType,
    title,
    description: options?.description ?? null,
    metadata: options?.metadata ?? null,
    actor_id: actorId,
  });
  if (error) throw error;
}

export interface TimelineEventRow {
  id: string;
  event_type: TimelineEventType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
  /** Always null today — client_timeline_events is append-only (no update/delete
   * RLS policy for any role), so no write path can ever populate this yet. Kept
   * on the row shape so a future "revisable session notes" feature could
   * populate it later without another shape change. */
  updated_at: string | null;
  side: TimelineSide;
  actor_source: TimelineActorSource;
  actor_name: string | null;
}

type ActorEmbed = { full_name: string | null; role: 'admin' | 'coach' | 'client' } | null;

export const TIMELINE_PAGE_SIZE = 20;

/**
 * RLS-scoped read: admin sees any client's timeline; coach sees their linked
 * clients' in full, and any client's read-only via the widened
 * `timeline_select_by_any_coach` policy (the surrounding page, not this
 * function, is responsible for the "not assigned to you" banner — see
 * client-timeline.tsx's consumers). Resolves each row's actor and side
 * (internal vs customer) so the timeline UI stays a pure display layer —
 * mirrors the web's `listClientTimeline()` exactly, including the
 * actor-dependent override for cancel/reschedule.
 */
export async function listClientTimeline(
  clientId: string,
  options?: { limit?: number; offset?: number }
): Promise<TimelineEventRow[]> {
  const limit = options?.limit ?? TIMELINE_PAGE_SIZE;
  const offset = options?.offset ?? 0;

  const { data, error } = await supabase
    .from('client_timeline_events')
    .select('id, event_type, title, description, metadata, actor_id, created_at, actor:profiles(full_name, role)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  return (data ?? []).map((row) => {
    const rawActor = row.actor as unknown as ActorEmbed | ActorEmbed[];
    const actor = Array.isArray(rawActor) ? (rawActor[0] ?? null) : rawActor;
    const eventType = row.event_type as TimelineEventType;
    const isClientActor = actor?.role === 'client';

    const side: TimelineSide =
      ACTOR_DEPENDENT_SIDE_TYPES.has(eventType) && actor
        ? isClientActor
          ? 'customer'
          : 'internal'
        : (TIMELINE_EVENT_SIDE[eventType] ?? 'internal');

    const actor_source: TimelineActorSource = actor ? (isClientActor ? 'customer' : 'staff') : side === 'internal' ? 'system' : 'unknown';

    return {
      id: row.id as string,
      event_type: eventType,
      title: row.title as string,
      description: row.description as string | null,
      metadata: row.metadata as Record<string, unknown> | null,
      actor_id: row.actor_id as string | null,
      created_at: row.created_at as string,
      updated_at: null,
      side,
      actor_source,
      actor_name: actor?.full_name ?? null,
    };
  });
}
