-- push_tokens: stores each user's Expo push token (one per user, last-write-wins).
create table if not exists public.push_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
create policy push_tokens_manage_own on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_tokens_admin_all on public.push_tokens
  for all using (is_admin()) with check (is_admin());

-- pg_net: lets a Postgres trigger fire an async HTTP call without blocking the
-- inserting transaction -- the mechanism behind Supabase's "Database Webhooks"
-- feature, wired here directly since this project doesn't have that schema set
-- up yet.
create extension if not exists pg_net;

create or replace function public.trigger_send_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://hdrpioypocyeclazkffl.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('notificationId', new.id)
  );
  return new;
end;
$$;

drop trigger if exists notifications_send_push on public.notifications;
create trigger notifications_send_push
  after insert on public.notifications
  for each row execute function public.trigger_send_push_notification();
