-- Session reminders (~1h before start) + no-show warnings for both client
-- and coach. mobile-app-reference/audit/15-session-reminder-cron.md: web
-- already has a `bookings.reminder_sent_at` column plus a fully-correct
-- but never-invoked 6h-before reminder cron (its Vercel `crons` entry was
-- never added — a web-repo config gap outside this project's scope, and
-- that repo isn't present here to fix anyway). Reusing `reminder_sent_at`
-- for a *different* lead time (1h, not 6h) would collide with web's
-- semantics if that job is ever fixed later: a 6h-before send would mark
-- the flag before the 1h mark is ever reached, permanently suppressing
-- this reminder. So this uses its own column, its own pg_cron job, and
-- its own Edge Function — independent of web's dormant one, same
-- `notifications` table + push pipeline underneath.

alter table public.bookings
  add column if not exists reminder_1h_sent_at timestamptz,
  add column if not exists client_joined_at timestamptz,
  add column if not exists coach_no_show_warned_at timestamptz,
  add column if not exists client_no_show_warned_at timestamptz;

-- Read live by the new `session-reminders` Edge Function, same pattern as
-- every other admin-configurable timing value in this schema
-- (cancellation_cutoff_hours, reschedule_cutoff_hours, etc.) — never
-- compiled-in constants.
insert into public.system_settings (key, value, description)
values
  ('session_reminder_lead_minutes', '60'::jsonb, 'How many minutes before a session start to send the reminder email/push to client and coach.'),
  ('no_show_grace_minutes', '10'::jsonb, 'How many minutes past a session''s scheduled start to wait before warning a client/coach who has not joined.')
on conflict (key) do nothing;

insert into public.notification_templates (key, type, title_template, body_template)
values
  ('session_reminder_1h_client', 'reminder', 'Session starting soon', 'Your session with {{coach_name}} starts at {{session_time}} (in about 1 hour). Don''t forget to join!'),
  ('session_reminder_1h_coach', 'reminder', 'Session starting soon', 'Your session with {{client_name}} starts at {{session_time}} (in about 1 hour).'),
  ('coach_no_show_warning', 'system', 'Session missed', 'You missed your session with {{client_name}} scheduled for {{session_time}}. Please join on time for upcoming sessions.'),
  ('client_no_show_warning', 'system', 'You missed your session', 'Missing sessions can set back your progress. You didn''t join your session with {{coach_name}} on {{session_time}} — let''s get back on track for the next one!')
on conflict (key) do nothing;

-- Same pg_net async-HTTP mechanism as trigger_send_push_notification()
-- (push_tokens_and_send_trigger migration), just invoked on a timer
-- instead of a row-insert trigger. verify_jwt:false on the target
-- function, same as send-push, because the caller here is Postgres
-- itself via pg_cron, not a logged-in app user.
create extension if not exists pg_cron;

select cron.schedule(
  'session-reminders-and-no-show-check',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://hdrpioypocyeclazkffl.supabase.co/functions/v1/session-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
