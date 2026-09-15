# Audit Section 15: Session-Reminder Cron Gap — Root Cause & Recommendation

Scope: cross-repo (web `LeanR-PT-main` + shared Supabase backend also used by `leanr-mobile-app`). Follow-up to prior finding A9/ADM-012 (`mobile-app-reference/audit/05-admin-coach-crossdeps-navigation.md`), which confirmed no reminder mechanism exists anywhere in the mobile app or its local `supabase/` tree. This pass traces the actual web implementation and determines the correct fix.

## Confirmed: web and mobile share one live Supabase project

Both `LeanR-PT-main/.env.local` and `leanr-mobile-app/.env` point `SUPABASE_URL` at the same project ref (`hdrpioypocyeclazkffl`). This is one physical database. Web's `supabase/migrations/` (57 files) is the authoritative full schema history; mobile's `supabase/migrations/` (10 files) only holds mobile-specific additive migrations (e.g. the escalation call-gate trigger) — it is not, and doesn't need to be, a full mirror. **`bookings.reminder_sent_at` already exists in the live database**, added by web's `supabase/migrations/0056_email_notification_coverage.sql`. My initial assumption (inherited from the task brief) that this column needs to be added via a new migration in `leanr-mobile-app/supabase/` was wrong — re-verified directly, no such migration is needed.

## The actual, correct implementation already exists — and is already shared

`src/app/api/cron/session-reminders/route.ts` (web) is fully correct and not mobile-specific in any way:
- Queries `bookings` for `status='upcoming'`, `reminder_sent_at IS NULL`, `scheduled_start` in a ±15min window around now+6h (`:33-43`).
- For each booking, calls `notifyClient`/`notifyCoach` (`src/lib/services/sessionNotifications.service.ts:76-99`), which both (a) write a row via `createFromTemplate()` into the shared `notifications` table — the exact table the mobile app's existing `send-push` Edge Function is triggered from on every INSERT (per prior audit, event-triggered via a Postgres trigger + `pg_net.http_post`) — and (b) additionally send email (`email.service.ts`) and, for clients, SMS (`sms.service.ts`).
- Marks `reminder_sent_at` after a successful send (`:57`), so it never double-fires.

Because (a) is a write to the shared `notifications` table, **the moment this cron actually runs, mobile users already receive the push notification for free** through infrastructure that already exists in `leanr-mobile-app/supabase/functions/send-push/`. No new Supabase migration or Edge Function is needed or appropriate — writing a second, parallel implementation would violate the "one business logic, one data source" principle (task Rule 7/9) and risks double-sending reminders (email+SMS from web's service, a second email from a duplicate mobile-side job) if this root cause is later fixed independently.

## Root cause: the cron trigger itself is not configured

`route.ts:11` says *"Vercel Cron (see vercel.json's 'crons' entry)"* — but `LeanR-PT-main/vercel.json` is:
```json
{ "regions": ["syd1"] }
```
No `"crons"` key exists anywhere in the repo (confirmed: only one `vercel.json`, no `.github/workflows` cron, no other scheduler config). **This endpoint is never invoked in production today.** This is a pre-existing bug in the web app itself, not something introduced by or specific to the mobile-parity effort — but it is the actual, sole reason neither web nor mobile users ever receive session reminders.

## Why I did not implement the fix myself

The correct fix is a one-line addition to `LeanR-PT-main/vercel.json`:
```json
{ "regions": ["syd1"], "crons": [{ "path": "/api/cron/session-reminders", "schedule": "*/15 * * * *" }] }
```
plus confirming `CRON_SECRET` is set in the Vercel project's env vars (the route already gates on it if present, `route.ts:28-31`).

I did not make this change because:
1. It edits the **web repo's live production deployment config** (`vercel.json`), not `leanr-mobile-app` — outside this sweep's stated scope of mobile-app gap-filling, and a repo none of the other parallel audit passes are touching.
2. Vercel Cron Jobs have plan-tier restrictions (frequency limits, and historically a paid-plan requirement) — I cannot verify the project's current Vercel plan from the repo, so I can't confirm `*/15 * * * *` is deployable as-is without checking the dashboard.
3. Activating this immediately starts sending real emails/SMS to real users on every deploy — a production, user-facing, hard-to-reverse action that should be a deliberate decision, not a side effect of an app-parity sweep.

## Recommendation (requires a product/infra decision)

Add the `crons` entry to `LeanR-PT-main/vercel.json`, verify `CRON_SECRET` is set in Vercel's env vars for the project, and confirm the account's Vercel plan supports the desired schedule frequency (fall back to hourly if the plan restricts sub-hourly cron). No mobile-app or shared-backend code changes are needed — parity for this feature arrives automatically for both platforms the moment the web cron actually fires, via the already-correct, already-shared notification pipeline.

## Matrix Row

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Root Cause | Frontend | Backend/API | Database | Dependencies | Severity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| REM-001 | Notifications infra | Session reminder ~6h before session | Time-triggered email+SMS+push to client, email to coach | `LeanR-PT-main/vercel.json`, `src/app/api/cron/session-reminders/route.ts` | Route handler fully implemented and correct; never invoked — `vercel.json` has no `crons` entry despite the route's own header comment expecting one | Scheduled cron hits the endpoint every 15-30min (web §10/§15/§33) | BROKEN (web-side config gap, not a mobile/app-parity gap) | Missing `"crons"` array in `vercel.json` — pre-existing production bug, unrelated to mobile build | Web + Mobile (both read the same `notifications` table) | Vercel Cron (unconfigured) | `bookings.reminder_sent_at` (column exists, unused because never triggered) | Requires Vercel plan/env verification before enabling | High (affects both platforms equally; not something mobile-side code can fix) |
