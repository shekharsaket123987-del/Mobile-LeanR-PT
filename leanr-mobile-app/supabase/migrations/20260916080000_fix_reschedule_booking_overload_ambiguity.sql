-- Two overloads of reschedule_booking (4-arg and 5-arg, differing only by
-- an optional p_new_coach_id with a DEFAULT) made PostgREST's RPC overload
-- resolution ambiguous for any 4-named-arg call ("Could not choose the
-- best candidate function"), breaking every reschedule that doesn't pass
-- a substitute coach. Consolidating into one canonical 5-arg function
-- removes the ambiguity. This also fixes a pre-existing side gap: the old
-- 5-arg overload never set was_rescheduled/original_scheduled_start (only
-- the 4-arg one did), so a substitute-coach reschedule silently failed to
-- mark the booking as rescheduled — the merged body now does so
-- unconditionally, regardless of whether a substitute coach was used.

drop function if exists public.reschedule_booking(uuid, timestamp with time zone, integer, boolean);

create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_new_start timestamp with time zone,
  p_new_duration_minutes integer default null,
  p_enforce_cutoff boolean default true,
  p_new_coach_id uuid default null
)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  b bookings%rowtype;
  new_duration int;
  target_coach_id uuid;
  cutoff_hours int := get_setting_int('reschedule_cutoff_hours');
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found or b.status <> 'upcoming' then
    raise exception 'Only upcoming bookings can be rescheduled' using errcode = 'P0001';
  end if;

  if p_enforce_cutoff and extract(epoch from (b.scheduled_start - now())) / 3600.0 < cutoff_hours then
    raise exception 'Too close to the session start to reschedule (cutoff is % hours)', cutoff_hours using errcode = 'P0001';
  end if;

  new_duration := coalesce(p_new_duration_minutes, b.duration_minutes);
  target_coach_id := coalesce(p_new_coach_id, b.coach_id);

  if not is_slot_within_working_hours(target_coach_id, p_new_start, new_duration) then
    raise exception 'Coach is not available at this time' using errcode = 'P0001';
  end if;
  if has_scheduling_conflict(target_coach_id, p_new_start, new_duration, p_booking_id) then
    raise exception 'This slot is no longer available' using errcode = 'P0001';
  end if;

  update bookings
  set scheduled_start = p_new_start,
      duration_minutes = new_duration,
      coach_id = target_coach_id,
      was_rescheduled = true,
      original_scheduled_start = coalesce(original_scheduled_start, b.scheduled_start)
  where id = p_booking_id;
end;
$$;
