# Audit Section 14: Admin Misc Modules Parity (Sales, Reports, Settings, Search, Activity Log, Availability, Notifications, Dashboard)

Scope: `leanr-mobile-app` (Expo/React Native) vs web (`LeanR-PT-main`, source of truth). Task #9 of the admin-parity sweep. Prior audit `05-admin-coach-crossdeps-navigation.md` §A8 only skimmed these files for client-visible cross-effects and explicitly did not do screen-level field/filter parity — that's this doc's job. All line numbers current as of this pass (2026-09-14).

---

## 1. Sales

- **Search scope**: web's `AdminSalesClient.tsx:17-19` matches `clientName`, `clientCode`, AND `packageName`; mobile's `sales.tsx:28-31` (pre-fix) only matched `clientName`/`packageName` despite the web placeholder text ("Search by client, ID, or plan") implying ID search. **Status: NOT IMPLEMENTED → FIXED** (`sales.tsx:28-32`, placeholder text updated to match).
- **Row cap**: web's `listSales()` (`sales.service.ts:8`) has no limit; mobile capped at 200 with no pagination affordance, silently hiding older sales beyond that. **Status: IMPLEMENTED BUT DIFFERENT → FIXED** (raised to 2000, `admin-sales.ts:20`; true unlimited/paginated parity would need a larger UI change, left as a generous cap not full pagination).
- Everything else (header total, row fields, currency/date formatting) matches web exactly. **Status: WORKING CORRECTLY.**

## 2. Reports

- Both platforms expose the same 5 fixed reports (Client/Coach/Monthly PT/Revenue/Cancellation) with matching titles. **Status: WORKING CORRECTLY** (report set).
- Mobile's own CSV **column headers matched web**, but **cell value types diverged** from web's `admin-reports.actions.ts`: Monthly PT's Month was human-formatted ("Jan 2026") vs web's raw "2026-01", and Completion Rate was a `"NN%"` string vs web's plain number; Revenue's Month/Revenue had the same two issues; Coach's Utilization was a `"NN%"` string vs web's plain number. A CSV consumer (spreadsheet import) would treat these as text, not numeric columns, unlike web's exports. **Status: IMPLEMENTED BUT DIFFERENT → FIXED** (`admin-reports.ts`: `generateMonthlyPtReportCsv`, `generateRevenueReportCsv`, `generateCoachReportCsv` — raw ISO month, plain numeric rate/utilization).
- Cancellation report: web's `generateCancellationReportAction` has no row limit; mobile capped at 500. **Status: IMPLEMENTED BUT DIFFERENT → FIXED** (raised to 5000, `admin-reports.ts`).
- Cancellation report also carries 2 extra columns (Cancel Reason, No-Show Party) web's export doesn't have, and reuses `listAdminClients`'s already-computed `derivedStatus`/`sessionsTotal-sessionsUsed` for the Client report rather than web's own `activeSubscription.sessionsRemaining` field — both left as-is: the former is a beneficial superset (same precedent as the Clients-module finding), the latter's correctness depends on the Clients-module task's (#1) own `derivedStatus`/session-math audit, out of this doc's scope to avoid duplicate work. **Status: NOTED, not changed.**
- Coach report's rating/review-count is computed live from `bookings.trainer_rating` on mobile vs web's cached `coach_profiles.rating`/`review_count` columns — same intentional, documented, app-wide convention flagged again in Dashboard §8 below. **Requires product decision**: should web's cached columns be treated as the bug, or should mobile match web's (possibly-stale) cached values? Not changed pending that call.
- CSV export mechanism (native Share sheet vs browser blob-download/jsPDF) is a legitimate, documented platform adaptation, not a gap.

## 3. Settings

- Package list: web's `AdminSettingsClient.tsx` only ever shows `is_active` packages (`admin-settings.actions.ts:46`, hard filter before the list even reaches the client); mobile's `listAllPackages()` (`admin-settings.ts:24-28`) shows every package including soft-deleted ones, with an "Inactive" badge. **Status: DUPLICATED-CONFLICTING but beneficial** — same precedent as Clients-module superset finding; left in place (Edit doesn't reactivate since `PackageInput`/`updatePackage` never touches `is_active`, so no functional harm). Not changed.
- Session Rules sliders: web's 4 `<input type="range">` controls enforce discrete step values (duration step 15, cancellation-cutoff step 4, reschedule-cutoff step 1, inactivity step 7); mobile's free-text number fields (no native slider dependency) accepted **any** integer in range, not just the stepped values web allows — a real validation-rule mismatch (same setting saved via mobile could land on a value web's own UI could never produce). **Status: IMPLEMENTED BUT DIFFERENT → FIXED** (`settings.tsx`: `RULE_BOUNDS` now carries `step`, `clampToStep()` replaces `clamp()`).
- Package form validation: web's `savePackage()` (`AdminSettingsClient.tsx:99`) silently no-ops unless `name && sessions>=1 && price>=0`; mobile's `onSavePackage` had no equivalent guard beyond a non-empty name, so an admin could create/save a package with 0 sessions or a negative price via mobile only. **Status: NOT IMPLEMENTED → FIXED** (`settings.tsx`, guard added before `setBusy(true)`).

## 4. Search

- **Scope**: web's Search screen (`AdminSearchClient.tsx`, `searchAdminClientsAction`) is clients-only. Mobile's `admin-search.tsx`/`admin-search.ts` searches 3 entity kinds (client/coach/plan) — a documented, intentional superset per its own header comment. **Status: DUPLICATED-CONFLICTING but beneficial**, left in place per the same superset precedent, not stripped.
- **Confirmed broken, not just different**: mobile's own screen placeholder promises "Search by name, ID, email, or phone" and web's client search genuinely matches name/client-code/phone (`AdminSearchClient.tsx:28-30`), but the actual mobile query (`admin-search.ts:22`, pre-fix) only ever filtered on `profiles.full_name` — client-code and phone were never queried server-side, and phone wasn't even fetched. This is a UI-copy-vs-actual-behavior defect (task category J), not just a web-parity gap. **Status: BROKEN → FIXED** (`admin-search.ts`: now runs 3 targeted queries — name/client_code/`profiles.phone` — and merges/dedupes by client id; phone now included in the result subtitle).

## 5. Activity Log

- Entity-type filter set (7 types), table (`audit_logs`), 200-row cap, actor-name resolution: all match web exactly. **Status: WORKING CORRECTLY** on structure.
- Diff summary content: web's `summarize()` (`admin-audit.actions.ts:24-34`) shows up to 3 changed keys **with their actual old→new values**, excluding `updated_at`. Mobile's `diffSummary()` (pre-fix) only listed up to 4 changed **key names** with no values, and didn't exclude `updated_at` (so "Changed: updated_at, status" noise was possible). This is a real content-fidelity gap on the one thing this screen exists to show. **Status: IMPLEMENTED BUT DIFFERENT → FIXED** (`admin-activity-log.ts`: `diffSummary()` now matches web's format/field count/exclusion exactly).

## 6. Availability

This screen is a from-scratch reimplementation on mobile (not calling a shared service), so it carries the highest risk of the 8 modules. Comparison against web's `scheduling.service.ts:getAvailabilityCheck()`:

- **Missed bookings undercounted**: web's active-bookings query is `.neq('status','cancelled')` (i.e. upcoming/completed/missed all occupy the slot); mobile's was `.in('status', ['upcoming','completed'])`, silently excluding `missed` — a no-show slot would incorrectly render as "Free" on mobile. **Status: BROKEN → FIXED** (`admin-availability.ts`, query now `.neq('status','cancelled')`).
- **Generic freeReason text**: web's cancelled-slot reason is `` `Cancelled by ${canceller} — "${reason}"` `` (`scheduling.service.ts:478-480`); mobile just showed a static `'Prior cancellation'` string regardless of who cancelled or why. **Status: IMPLEMENTED BUT DIFFERENT → FIXED** (`admin-availability.ts`, now fetches `cancel_reason`/`canceller:profiles!cancelled_by(full_name)` and reproduces web's exact text).
- **Structural divergence, NOT fixed this pass — flagged for dedicated follow-up (High severity):**
  1. **Slot grid basis differs entirely.** Web generates one shared **hourly** grid from a global admin-configured booking window (`getBookingWindow()`/`hourlyGrid()`) and checks each coach's own working-hours window against each hourly tick. Mobile instead walks each coach's own `start_time..end_time` in fixed **45-minute** increments with no shared global window — the two platforms can produce a completely different set of slot times for the same coach/day (e.g. mobile might show 6:45/7:30 where web only ever shows 6:00/7:00/8:00).
  2. **No "ground truth" widening.** Web explicitly widens its candidate-time set with any actual booking/cancellation timestamp that doesn't land on the grid, so an off-grid booking still always appears (`scheduling.service.ts:420-432`). Mobile has no equivalent — a booking whose time doesn't align exactly to its 45-min arithmetic grid from the coach's start time would be invisible (rendered as a "Free" grid slot elsewhere, with the real booking simply missing).
  3. **`coach_shifts` is used by mobile but not by web's `getAvailabilityCheck()` at all** (grepped `scheduling.service.ts` — `coach_shifts` only appears in an unrelated function's comment). Mobile treats it as a date-override with priority over `coach_availability`; web's admin Availability Check screen doesn't consult this table for this screen at all.
  - **Requires product/schema decision** (not a quick fix — a from-scratch grid-algorithm rewrite, risked introducing new bugs under this pass's time budget): should mobile's grid be rewritten to match web's global-hourly-window + widening algorithm exactly, or is the per-coach 45-min-window approach (plus `coach_shifts`) an intentional, deliberate improvement that the web app should also adopt? Flagging for a product call rather than guessing.

## 7. Notifications

- Web's admin Notifications screen reuses the generic `NotificationsClient` (`client/NotificationsClient.tsx`) verbatim: no filter tabs, no bulk "mark all read," tapping only marks read (no deep-link navigation).
- Mobile's `admin-notifications.tsx` adds: All/Clients/System filter tabs, a "Mark all as read" action, and tap-to-navigate routing to the related admin screen (sessions/escalations/coach-change-requests) via `routeCategoryForTemplateKey`. All are a superset, not a defect — same precedent as other superset findings above. **Status: WORKING CORRECTLY (beneficial superset)**, not changed.
- The underlying `notifications.ts` data layer (shared with client/coach) was already covered by a separate prior audit pass (subsystem 4, chat/concerns/notifications) — not re-audited here to avoid duplicate work.

## 8. Dashboard

Web's `adminDashboard.service.ts` was directly readable this pass (mobile's own header comment admits its `emptySlots`/`renewalRate` formulas were previously "reconstructed from first principles" without access to this file) — so this module got the deepest re-verification of the 8.

- **`sessionsToday` overcounted `missed` bookings**: web's `sessionsBookedToday` is `.in('status', ['upcoming','completed'])`; mobile's `sessionsToday` (pre-fix) was `status !== 'cancelled'`, which counts `missed` bookings too, also inflating the `emptySlotsToday` subtraction (`capacitySlots - sessionsToday`). **Status: BROKEN → FIXED** (`admin-dashboard.ts`, now `status === 'upcoming' || status === 'completed'`).
- **`avgSessionsPerClient` metric entirely missing.** Web shows this as a dedicated large-number card next to Coach Utilization (`AdminDashboardClient.tsx:73-75`, from `subscription_usage_view`); mobile's `AdminDashboard` type/screen had no equivalent field or tile at all. **Status: NOT IMPLEMENTED → FIXED** (added `avgSessionsPerClient` computed from `subscription_usage_view.sessions_used`, same formula as web; new stat tile added — as a grid tile rather than web's separate large-number card layout, a presentation adaptation, not a data gap).
- **`renewalRatePct`/`renewalOpportunityCount` used a completely different, unrelated definition.** Web computes this from the live renewal-opportunities list (`listRenewalOpportunities()`, same data the Renewals screen shows): rate = % of currently-flagged opportunities that have `.converted`. Mobile's pre-fix formula was "of clients who have *ever* had >1 subscription, what fraction of clients-with-any-subscription" — an entirely different statistic that happened to share a UI label with web's "Renewal Rate," meaning the same-named KPI could show unrelated numbers on each platform. **Status: BROKEN (wrong metric, not just wrong number) → FIXED**, by importing and reusing `getAdminRenewalOpportunities()` from the already-fixed `admin-renewals.ts` (task #8 of this sweep) — same `RENEWAL_OPPORTUNITY_THRESHOLD=10`/`converted` semantics as web, no logic duplicated. `renewalOpportunityCount` (previously absent from the mobile type/screen entirely, web shows it as the stat card's sub-label) was also added as its own tile.
- **`emptySlotsToday` formula**: matched web's shape (working-hours-minutes / `default_session_duration_minutes`, summed, minus booked-today) but mobile additionally restricted `coach_availability` rows to currently-`active` coaches via an inner join web's own query does not apply. **Status: IMPLEMENTED BUT DIFFERENT → FIXED** (join/filter removed from `admin-availability`'s dashboard query in `admin-dashboard.ts` to match web verbatim; flagging that this means an inactive coach's leftover weekly-template row *does* count toward capacity on both platforms now, which may itself be a pre-existing web quirk — not this pass's call to silently "improve").
- **`avgCoachRating`**: web averages the cached `coach_profiles.rating` column for active coaches only; mobile averages live `bookings.trainer_rating` across all rated bookings, unfiltered by coach active-status. Same intentional/documented live-vs-cached convention noted in Reports §2 above. **Requires product decision**, not changed here (changing it would mean touching the coach-profile rating convention used elsewhere in the app, out of this doc's scope).
- Revenue Trend / Bookings-by-Hour / Coach Utilization charts: same source views (`revenue_trend_view`, `bookings_by_hour_view`, `coach_utilization_view`) as web, same shape. **Status: WORKING CORRECTLY.**

---

## Matrix Rows

| ID | Module | Finding | Location | Status | Severity |
|---|---|---|---|---|---|
| MISC-001 | Sales | Search omitted client-code match despite placeholder promising it | `sales.tsx`, `admin-sales.ts` | FIXED | Low |
| MISC-002 | Sales | 200-row cap with no pagination indicator | `admin-sales.ts:20` | FIXED (cap raised) | Low |
| MISC-003 | Reports | Monthly PT / Revenue / Coach CSV cell types diverged from web (formatted strings vs raw values) | `admin-reports.ts` | FIXED | Medium |
| MISC-004 | Reports | Cancellation report 500-row cap vs web's unlimited | `admin-reports.ts` | FIXED (cap raised) | Low |
| MISC-005 | Reports | Coach rating/review-count computed live vs web's cached columns | `admin-reports.ts:62-96` | Requires product decision | Info |
| MISC-006 | Settings | Package list shows inactive packages web hides entirely | `admin-settings.ts:24-28` | Noted, not changed (beneficial) | Low |
| MISC-007 | Settings | Session-rule inputs accepted non-stepped values web's sliders can't produce | `settings.tsx` | FIXED | Medium |
| MISC-008 | Settings | Package form missing web's sessions≥1/price≥0 validation guard | `settings.tsx` | FIXED | Medium |
| MISC-009 | Search | 3-entity-kind search scope vs web's clients-only | `admin-search.ts` | Noted, not changed (beneficial) | Info |
| MISC-010 | Search | Client search only matched name; code/phone never queried despite own placeholder promising it | `admin-search.ts:22` | FIXED | High |
| MISC-011 | Activity Log | Diff summary showed only changed key names, not old→new values; didn't exclude updated_at | `admin-activity-log.ts` | FIXED | Medium |
| MISC-012 | Availability | Missed bookings excluded from "booked", showing as false-Free | `admin-availability.ts` | FIXED | High |
| MISC-013 | Availability | Generic "Prior cancellation" text vs web's canceller+reason detail | `admin-availability.ts` | FIXED | Low |
| MISC-014 | Availability | Slot grid basis (per-coach 45-min windows + coach_shifts) structurally differs from web (shared hourly grid, no coach_shifts, ground-truth widening) | `admin-availability.ts` | Requires product/schema decision | High |
| MISC-015 | Notifications | Filter tabs / mark-all-read / tap-to-navigate not present on web | `admin-notifications.tsx` | Noted, not changed (beneficial) | Info |
| MISC-016 | Dashboard | sessionsToday counted 'missed' bookings, inflating both the KPI and emptySlotsToday | `admin-dashboard.ts` | FIXED | High |
| MISC-017 | Dashboard | avgSessionsPerClient metric entirely missing | `admin-dashboard.ts`, `index.tsx` | FIXED | Medium |
| MISC-018 | Dashboard | renewalRatePct/renewalOpportunityCount used an unrelated definition from web's | `admin-dashboard.ts` | FIXED | High |
| MISC-019 | Dashboard | emptySlotsToday wrongly restricted to active-coach availability rows vs web's unfiltered query | `admin-dashboard.ts` | FIXED | Low |
| MISC-020 | Dashboard | avgCoachRating computed live vs web's cached coach_profiles.rating | `admin-dashboard.ts` | Requires product decision | Info |

**Typecheck**: `npx tsc --noEmit` — clean, no errors, across all files touched in this pass.
