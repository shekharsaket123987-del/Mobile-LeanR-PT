-- Bug (app-gap-fix-plan.md GAP-02 / web audit SUB-011): the `subscription-lifecycle` Edge
-- Function's "activate" action performed the plan-activation update and the renewal
-- old-subscription-retirement update as two separate, sequential `.update()` calls over
-- PostgREST, with the second call's error never even checked. There was no atomicity
-- guarantee between them at all: a crash/failure between the two (or two concurrent activation
-- requests racing past the earlier check-then-update) could leave a client with two
-- simultaneously 'active' subscriptions, which breaks BR-16 (which subscription does a booking
-- draw against?) and BR-2 (does "already has an active plan" see one row or two?). The web
-- app's own client-portal spec calls this an explicit "MUST NOT CHANGE" rule (BR-6, atomic
-- renewal supersession).
--
-- Fix: move both writes (plus the one-time-activation-lock check) into a single Postgres
-- function, row-locked with `for update`, so they commit or roll back together by the ordinary
-- atomicity of one function invocation, and the caller gets a real, propagated error instead of
-- a silently swallowed one.
create or replace function public.activate_subscription(
  p_subscription_id uuid,
  p_client_id uuid,
  p_start_date date
)
returns public.subscriptions
language plpgsql
set search_path to 'public'
as $function$
declare
  v_subscription public.subscriptions;
begin
  select * into v_subscription
  from public.subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found.' using errcode = 'P0001';
  end if;

  if v_subscription.client_id is distinct from p_client_id then
    raise exception 'Not your subscription.' using errcode = 'P0001';
  end if;

  if v_subscription.status is distinct from 'awaiting_activation' then
    raise exception 'This plan has already been activated.' using errcode = 'P0001';
  end if;

  update public.subscriptions
  set status = 'active', activated_at = p_start_date
  where id = p_subscription_id;

  -- Renewal-supersede: any OTHER still-active subscription for this client becomes inactive,
  -- in the SAME transaction as the activation above — this is what makes BR-6 actually atomic.
  update public.subscriptions
  set status = 'inactive'
  where client_id = p_client_id
    and status = 'active'
    and id <> p_subscription_id;

  select * into v_subscription from public.subscriptions where id = p_subscription_id;
  return v_subscription;
end;
$function$;
