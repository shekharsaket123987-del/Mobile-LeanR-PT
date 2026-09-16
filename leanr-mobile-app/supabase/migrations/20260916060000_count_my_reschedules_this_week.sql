-- mobile-app-reference/audit/reschedule.md §4.3/§11.4: the client-side
-- weekly reschedule cap (max 2 per Monday-start calendar week) must be
-- counted from `session_rescheduled` timeline events in the current week,
-- not a rolling/approximated window. But `client_timeline_events` has no
-- SELECT policy for the client themselves (see
-- 20260915180000_client_timeline_events_rls_hardening.sql — timeline is
-- staff/coach-visible only, by design). This SECURITY DEFINER function
-- exposes only the count the caller needs for their own cap check, never
-- the underlying rows, so that boundary stays intact while still letting
-- the client compute an accurate weekly-remaining number.
--
-- date_trunc('week', ts) in Postgres truncates to Monday 00:00, matching
-- the spec's Monday-start week (equivalent to web's startOfWeekUTC/
-- endOfWeekUTC) with no custom day-of-week arithmetic needed.
create or replace function public.count_my_reschedules_this_week()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::int
  from client_timeline_events e
  join client_profiles cp on cp.id = e.client_id
  where cp.profile_id = auth.uid()
    and e.event_type = 'session_rescheduled'
    and e.created_at >= date_trunc('week', now() at time zone 'UTC')
    and e.created_at < date_trunc('week', now() at time zone 'UTC') + interval '7 days';
$$;

grant execute on function public.count_my_reschedules_this_week() to authenticated;
