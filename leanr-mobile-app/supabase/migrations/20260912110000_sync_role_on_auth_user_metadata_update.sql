-- Bug: admin.auth.admin.createUser({ app_metadata: { role: 'coach'|'admin' }, ... }) always results
-- in profiles.role='client' (the handle_new_user() fallback default), regardless of the requested
-- role. Confirmed by direct diagnostic: for a freshly created user, auth.users.created_at and
-- .updated_at differ by ~70ms, and raw_app_meta_data.role is only present as of the LATER
-- updated_at timestamp — GoTrue inserts the base user row first (before the requested
-- app_metadata is merged in), then performs a separate UPDATE shortly after to set it. The
-- `on_auth_user_created` AFTER INSERT trigger (handle_new_user()) fires on the first write, before
-- the real role ever lands, so it always falls through to its 'client' default — and, since it
-- also conditionally inserts into coach_profiles/client_profiles based on that same (wrong) role,
-- a coach/admin created this way gets a stray client_profiles row and no coach_profiles row at
-- all. This is what made admin-provisioning's "Add Coach" fail with "Coach profile was not
-- created" — the row genuinely never existed.
--
-- Fix: a second trigger reacting to the follow-up UPDATE, re-syncing profiles.role and creating
-- the missing role-specific profile row when the metadata's role becomes visible. Does not touch
-- or delete any existing coach_profiles/client_profiles row — only adds what's missing — since a
-- wrong-role leftover row is harmless clutter (access is gated by profiles.role, not by which
-- child table happens to have a row), and deleting it automatically risks cascading into real data
-- if this ever fired on an established user for an unrelated reason.

create or replace function public.sync_role_on_auth_user_metadata_update()
returns trigger
security definer
set search_path to 'public'
language plpgsql
as $function$
declare
  new_role user_role;
begin
  new_role := (new.raw_app_meta_data->>'role')::user_role;
  if new_role is null then
    return new;
  end if;

  update public.profiles set role = new_role where id = new.id and role is distinct from new_role;

  if new_role = 'coach' and not exists (select 1 from public.coach_profiles where profile_id = new.id) then
    insert into public.coach_profiles (profile_id) values (new.id);
  elsif new_role = 'client' and not exists (select 1 from public.client_profiles where profile_id = new.id) then
    insert into public.client_profiles (profile_id) values (new.id);
  end if;

  return new;
end;
$function$;

drop trigger if exists on_auth_user_metadata_updated on auth.users;

create trigger on_auth_user_metadata_updated
after update of raw_app_meta_data on auth.users
for each row
when (new.raw_app_meta_data->>'role' is distinct from old.raw_app_meta_data->>'role')
execute function public.sync_role_on_auth_user_metadata_update();
