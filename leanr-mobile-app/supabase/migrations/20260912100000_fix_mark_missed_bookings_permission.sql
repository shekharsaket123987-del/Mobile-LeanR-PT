-- Bug: has_scheduling_conflict() (called by every booking RPC — create_temporary_booking,
-- confirm_booking, reschedule_booking) unconditionally calls mark_missed_bookings() on every
-- invocation. mark_missed_bookings() does a blanket, unfiltered
-- `UPDATE bookings SET status='missed' WHERE status='upcoming' AND overdue` across the entire
-- table, which fires enforce_bookings_update_business_rules' trigger for every affected row.
-- That trigger requires auth.uid() to resolve to the row's own assigned coach for any
-- transition to 'missed' — which a plain client (or any coach other than the one on that
-- specific row) can never satisfy. The moment ANY overdue, still-'upcoming' booking exists
-- anywhere in the table (which will always eventually happen), every client's every booking
-- attempt fails with "Only the assigned coach may record a missed session", because a single
-- failing row aborts the whole set-based UPDATE.
--
-- mark_missed_bookings() was clearly designed be run in a privileged/system context — the
-- trigger's own first line (`if is_admin() or auth.uid() is null then return new;`) is exactly
-- the escape hatch a true backend/cron caller would hit (no user JWT -> auth.uid() is null).
-- But it's invoked here from a plain client-authenticated RPC call chain, so auth.uid() is
-- never null. Fix: mark_missed_bookings() sets a transaction-local flag before its update, and
-- the trigger's 'missed' branch specifically recognizes it as a legitimate system sweep,
-- bypassing the coach-identity check for that one status transition only. Every other rule in
-- the trigger (cancel cutoff, completed-by-coach-only, field-immutability, etc.) is untouched.

create or replace function public.mark_missed_bookings()
returns void
language plpgsql
set search_path to 'public'
as $function$
begin
  perform set_config('app.missed_sweep', 'true', true); -- true = local to this transaction only
  update bookings
  set status = 'missed'
  where status = 'upcoming' and scheduled_start + (duration_minutes || ' minutes')::interval < now();
end;
$function$;

create or replace function public.enforce_bookings_update_business_rules()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  cutoff_hours int;
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
      -- header. A plain client/coach directly setting status='missed' still requires being
      -- the assigned coach; only the sweep's own transaction-local flag skips this check.
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
  end if;

  return new;
end;
$function$;
