-- Bug (app-gap-fix-plan.md GAP-04 / web audit ADM-003): coach-authored session notes
-- (`workout_notes.notes`) never reached the client on mobile — no client-facing file queried
-- the table at all. Web exposes exactly the `notes` column read-only to the client, never
-- `homework`/`exercises_performed`/`performance_rating`/`improvements`/`additional_remarks`
-- (those stay coach/admin-internal).
--
-- Fix: a column-scoped, row-scoped view. This is a DEFINER-style view (no
-- `security_invoker`), so it reads `workout_notes` with the view owner's privileges
-- (bypassing that table's own RLS, which has no client-facing grant) — the `where
-- cp.profile_id = auth.uid()` clause is what actually restricts each caller to their own
-- bookings, using auth.uid() from the caller's own session (unaffected by the view's
-- definer-style execution). Only SELECT is granted, and only on this view — the base table
-- remains exactly as restricted as it was for the client role.
create or replace view public.client_workout_notes as
select w.booking_id, w.notes
from public.workout_notes w
join public.bookings b on b.id = w.booking_id
join public.client_profiles cp on cp.id = b.client_id
where cp.profile_id = auth.uid();

grant select on public.client_workout_notes to authenticated;
