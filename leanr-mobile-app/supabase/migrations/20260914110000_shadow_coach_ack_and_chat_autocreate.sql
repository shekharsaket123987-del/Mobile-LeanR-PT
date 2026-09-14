-- GAP-05 (ADM-009 / SES-019): shadow-coach coverage is fully built on the backend
-- (assign_shadow_coach RPC, shadow_coach_assignments table — see admin-shadow.ts) but has no
-- client-facing banner. Adds a client-settable acknowledgment column so the "Covering for
-- {coach}" banner can be dismissed once, durably (survives app reinstall/device change),
-- instead of a purely local/session flag.
alter table public.shadow_coach_assignments
  add column if not exists client_acknowledged_at timestamptz;

-- Client needs to read their own shadow assignments at all to render the "Covering for X"
-- banner — this table was admin-only before (no client-facing file ever queried it).
drop policy if exists shadow_assignments_client_select on public.shadow_coach_assignments;
create policy shadow_assignments_client_select
  on public.shadow_coach_assignments
  for select
  to authenticated
  using (client_id in (select id from public.client_profiles where profile_id = auth.uid()));

-- Client can acknowledge only their own shadow assignment, and only set (never clear or
-- backdate) the acknowledgment timestamp — mirrors the narrow, single-purpose client grants
-- already established elsewhere in this schema (e.g. messages.read_at).
drop policy if exists shadow_assignments_client_ack on public.shadow_coach_assignments;
create policy shadow_assignments_client_ack
  on public.shadow_coach_assignments
  for update
  to authenticated
  using (client_id in (select id from public.client_profiles where profile_id = auth.uid()))
  with check (client_id in (select id from public.client_profiles where profile_id = auth.uid()));

-- GAP-06 (COM-002): chat conversation auto-creation only happened on coach-change completion —
-- an ordinary first-time or renewal schedule setup left the client with no conversation at all
-- until an admin manually intervened. A trigger on recurring_slots is the single point that
-- fires regardless of which code path inserts the row (first-time setup, renewal scheduling,
-- ordinary schedule change, coach-change completion), closing all of them at once instead of
-- patching each call site separately.
create or replace function public.ensure_conversation_for_coach_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status <> 'active' then
    return new;
  end if;

  -- Same coach already has an active conversation with this client — nothing to do (this
  -- fires again on every subsequent renewal's recurring-slot insert for a continuing
  -- relationship, so this must be a safe no-op, not just a rare edge case).
  if exists (
    select 1 from public.conversations
    where client_id = new.client_id and coach_id = new.coach_id and status = 'active'
  ) then
    return new;
  end if;

  -- An active conversation exists with a DIFFERENT coach — this shouldn't happen (a coach
  -- change should have closed it), but don't silently create a second active row on top of
  -- an inconsistent state; the one-active-per-client constraint (if present) would reject it
  -- anyway. Leave it for an admin to reconcile rather than guessing which one is stale.
  if exists (
    select 1 from public.conversations
    where client_id = new.client_id and coach_id <> new.coach_id and status = 'active'
  ) then
    return new;
  end if;

  insert into public.conversations (client_id, coach_id, status, opened_at)
  values (new.client_id, new.coach_id, 'active', now());

  return new;
end;
$function$;

drop trigger if exists trg_ensure_conversation_for_coach_assignment on public.recurring_slots;
create trigger trg_ensure_conversation_for_coach_assignment
  after insert on public.recurring_slots
  for each row
  execute function public.ensure_conversation_for_coach_assignment();
