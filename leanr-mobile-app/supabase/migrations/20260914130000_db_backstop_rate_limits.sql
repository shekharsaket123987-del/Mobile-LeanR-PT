-- GAP-11 (SES-009 / SES-010 / rating cap / progress-log cap): the reschedule weekly cap,
-- same-day double-booking check, session-rating 7-day global cap, and progress-log 7-day cap
-- were all confirmed enforced ONLY in client-side TypeScript — bypassable by any caller that
-- talks to Supabase directly. The team's own escalation call-gate trigger already proves the
-- correct pattern (DB-enforced, not just app-layer); this migration applies that same pattern
-- to the remaining four rules. Client-side checks are kept as-is for responsive UX — they
-- become advisory only, with the DB layer as the real enforcement (defense in depth, matching
-- web's own posture).
--
-- This `create or replace` extends the existing `enforce_bookings_update_business_rules()`
-- trigger function (originally added by 20260912100000_fix_mark_missed_bookings_permission.sql)
-- rather than adding a second competing trigger on the same table, to keep one single mutation
-- gatekeeper instead of risking firing-order ambiguity between multiple bookings triggers.
-- The `is_admin() or auth.uid() is null` bypass at the top is unchanged, so none of this
-- affects admin-driven repoints (transferClientCoach, coach-change admin paths) or system
-- sweeps — only a plain client-role caller hits the new checks below.
create or replace function public.enforce_bookings_update_business_rules()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  cutoff_hours int;
  reschedule_count int;
begin
  if is_admin() or auth.uid() is null then
    return new;
  end if;

  if new.client_id is distinct from old.client_id
    or new.subscription_id is distinct from old.subscription_id
    or new.recurring_slot_id is distinct from old.recurring_slot_id
    or new.assessment_session_id is distinct from old.assessment_session_id
    or new.session_type is distinct from old.session_type
    or new.amount_paid is distinct from old.amount_paid
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Not permitted to modify this field' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'upcoming' then
      raise exception 'This booking can no longer be modified' using errcode = 'P0001';
    end if;

    if new.status = 'cancelled' then
      cutoff_hours := get_setting_int('reschedule_cutoff_hours');
      if extract(epoch from (old.scheduled_start - now())) / 3600.0 < cutoff_hours then
        raise exception 'Too close to the session start to cancel (cutoff is % hours)', cutoff_hours using errcode = 'P0001';
      end if;
      if new.cancelled_by is distinct from auth.uid() then
        raise exception 'cancelled_by must be the acting user' using errcode = 'P0001';
      end if;
    elsif new.status = 'completed' then
      if my_coach_id() is null or old.coach_id <> my_coach_id() then
        raise exception 'Only the assigned coach may complete this session' using errcode = 'P0001';
      end if;
    elsif new.status = 'missed' then
      -- Bypass for the system missed-session sweep (mark_missed_bookings) — see migration
      -- 20260912100000's header. A plain client/coach directly setting status='missed' still
      -- requires being the assigned coach; only the sweep's own transaction-local flag skips
      -- this check.
      if current_setting('app.missed_sweep', true) is distinct from 'true'
        and (my_coach_id() is null or old.coach_id <> my_coach_id())
      then
        raise exception 'Only the assigned coach may record a missed session' using errcode = 'P0001';
      end if;
    else
      raise exception 'Invalid status transition' using errcode = 'P0001';
    end if;

  elsif old.status <> 'upcoming' and (
    new.scheduled_start is distinct from old.scheduled_start
    or new.duration_minutes is distinct from old.duration_minutes
    or new.coach_id is distinct from old.coach_id
  ) then
    raise exception 'This booking can no longer be modified' using errcode = 'P0001';

  -- GAP-11 (SES-013-adjacent rule, BR-26): session-rating 7-day global cap, DB-enforced.
  -- Status is unchanged (stays 'completed') when only rating fields are written, so this is
  -- its own elsif branch rather than living inside the status-change block above.
  elsif new.quality_rating is distinct from old.quality_rating
    or new.trainer_rating is distinct from old.trainer_rating
    or new.rating_note is distinct from old.rating_note
  then
    if old.status <> 'completed' then
      raise exception 'Only a completed session can be rated' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.bookings b2
      where b2.client_id = old.client_id
        and b2.id <> old.id
        and b2.rated_at >= now() - interval '7 days'
    ) then
      raise exception 'You can only rate one session every 7 days.' using errcode = 'P0001';
    end if;
  end if;

  if old.status = 'upcoming' and (
    new.scheduled_start is distinct from old.scheduled_start
    or new.duration_minutes is distinct from old.duration_minutes
    or new.coach_id is distinct from old.coach_id
  ) then
    if not is_slot_within_working_hours(new.coach_id, new.scheduled_start, new.duration_minutes) then
      raise exception 'Coach is not available at this time' using errcode = 'P0001';
    end if;
    if has_scheduling_conflict(new.coach_id, new.scheduled_start, new.duration_minutes, old.id) then
      raise exception 'This slot is no longer available' using errcode = 'P0001';
    end if;

    -- GAP-11 (SES-009, BR-22): reschedule weekly cap (2/week), DB-enforced. Mirrors the app's
    -- own client-side approximation (was_rescheduled + updated_at within 7 days) rather than a
    -- dedicated event log, since no such log table is confirmed to exist in this schema.
    select count(*) into reschedule_count
    from public.bookings b2
    where b2.client_id = old.client_id
      and b2.was_rescheduled = true
      and b2.updated_at >= now() - interval '7 days'
      and b2.id <> old.id;
    if reschedule_count >= 2 then
      raise exception 'You have reached the maximum reschedule limit for this week.' using errcode = 'P0001';
    end if;

    -- GAP-11 (SES-010, BR-24): no double-booking the same IST calendar day, DB-enforced.
    if exists (
      select 1 from public.bookings b2
      where b2.client_id = old.client_id
        and b2.status = 'upcoming'
        and b2.id <> old.id
        and (b2.scheduled_start at time zone 'Asia/Kolkata')::date = (new.scheduled_start at time zone 'Asia/Kolkata')::date
    ) then
      raise exception 'You already have another session booked on that day.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$function$;

-- GAP-11 (BR-14): progress-log 7-day weekly cap, DB-enforced. The renewal check-in bypass
-- (BR-13) is derived from real data — "no log yet since the client's current subscription
-- activated" — rather than a caller-supplied flag: a session-local `set_config` flag (the
-- `app.missed_sweep` pattern used elsewhere in this schema) only works within a single
-- function invocation's own transaction, and this app's Supabase-JS insert calls each run as
-- their own separate request/transaction, so a flag set beforehand wouldn't survive to reach
-- this trigger. Deriving the exemption from data instead is both correct (matches BR-13's
-- actual criterion exactly) and can't be spoofed by any direct-to-Postgres caller the way a
-- client-passed bypass parameter could.
create or replace function public.enforce_progress_log_weekly_cap()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  last_logged_at timestamptz;
  current_activated_at timestamptz;
begin
  if is_admin() or auth.uid() is null then
    return new;
  end if;

  select activated_at into current_activated_at
  from public.subscriptions
  where client_id = new.client_id and status = 'active'
  order by activated_at desc nulls last
  limit 1;

  select logged_at into last_logged_at
  from public.progress_logs
  where client_id = new.client_id
  order by logged_at desc
  limit 1;

  if current_activated_at is not null and (last_logged_at is null or last_logged_at < current_activated_at) then
    return new;
  end if;

  if last_logged_at is not null and new.logged_at - last_logged_at < interval '7 days' then
    raise exception 'You already submitted a measurement update this week — next update available in a few days.' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_progress_log_weekly_cap on public.progress_logs;
create trigger trg_enforce_progress_log_weekly_cap
  before insert on public.progress_logs
  for each row
  execute function public.enforce_progress_log_weekly_cap();
