-- client_onboarding's one-time-insert rule was enforced only in application
-- code (a pre-insert SELECT check in src/lib/data/onboarding.ts), with no
-- DB-level constraint (confirmed via information_schema.columns/
-- pg_constraint) — a double-tap/retry-after-timeout race could insert two
-- rows for the same client. Add the missing uniqueness at the DB layer so
-- the one-time rule can never be bypassed by a race, matching the web app's
-- one-time-insert guarantee.
create unique index if not exists client_onboarding_client_id_key
  on public.client_onboarding (client_id);
