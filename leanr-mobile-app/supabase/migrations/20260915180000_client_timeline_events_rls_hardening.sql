-- mobile-app-reference/audit/timeline.md §6.1/§6.4/§6.5: the timeline is an
-- append-only, staff/coach-only audit trail. The live policies diverged from
-- that: a client could SELECT their own timeline (never intended to be
-- client-visible), and admin's ALL policy also granted UPDATE/DELETE
-- (breaking "append-only, no edit/delete for any role"). No policy granted
-- INSERT to a client or coach at all, even though most event types are
-- client/coach-triggered -- fixed here so the app can write events itself
-- via the regular RLS-scoped client, same pattern every other
-- client/coach-writable table in this app already uses.

drop policy if exists timeline_select_own_client on client_timeline_events;

drop policy if exists timeline_admin_all on client_timeline_events;

create policy timeline_admin_select on client_timeline_events
  for select
  using (is_admin());

create policy timeline_admin_insert on client_timeline_events
  for insert
  with check (is_admin());

create policy timeline_insert_own_client on client_timeline_events
  for insert
  with check (client_id = my_client_id());

create policy timeline_insert_linked_coach on client_timeline_events
  for insert
  with check (coach_client_linked(my_coach_id(), client_id));
