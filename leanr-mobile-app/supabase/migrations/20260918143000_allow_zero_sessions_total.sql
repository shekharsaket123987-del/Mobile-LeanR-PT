-- Admin "Adjust Package/Sessions" needs to be able to set a plan down to 0
-- sessions (fully wound down, with all its upcoming bookings cancelled) —
-- the prior `sessions_total > 0` check made that state unrepresentable and
-- forced admins into a confusing "can't save 0" error. App-layer logic
-- (adjustClientSessions in admin-clients.ts) still refuses to set a total
-- below sessions already completed, so this is the only relaxation needed;
-- negative values remain rejected.
alter table public.subscriptions
  drop constraint subscriptions_sessions_total_check;

alter table public.subscriptions
  add constraint subscriptions_sessions_total_check check (sessions_total >= 0);
