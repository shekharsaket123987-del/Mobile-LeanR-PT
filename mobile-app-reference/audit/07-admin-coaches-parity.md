# Audit Section 7: Admin Coaches Module — Web vs App Parity

Scope: Admin "Coaches" module only (list/detail/create). Web (source of truth): `src/app/admin/coaches/{page.tsx,[id]/page.tsx,new/page.tsx}`, `src/lib/actions/admin-coach.actions.ts`, `src/lib/services/{coaches,coachPerformance}.service.ts`, `src/lib/constants/coach-tags.ts`, `src/components/admin/AdminCoachesListClient.tsx`. App: `src/app/(admin)/coaches.tsx`, `coaches/[id].tsx`, `coaches/new.tsx`, `src/lib/data/admin-coaches.ts`. Fixes applied directly to the app repo (no schema/backend changes).

---

## Findings

**COA-001 — Coach list (search, columns, row nav): WORKING CORRECTLY.** `coaches.tsx:28-31` filters by name only, same as web's `AdminCoachesListClient.tsx:13`. Columns (avatar, name, specialization, utilization%, active clients, rating, status badge) match 1:1. No fix needed.

**COA-002 — Coach detail: Profile/Skills/Working-Hours/Admin-Controls tabs: WORKING CORRECTLY.** `admin-coaches.ts` (`updateCoach`, `updateCoachSkills`, `setCoachAvailability`, `blockCoachSlot`, `reassignCoachClients`, `disableCoach`) all map to web's equivalent actions (`updateCoachAction`, `updateCoachSkillsAction`, `setCoachAvailabilityAction`, `blockCoachSlotAction`, `reassignCoachClientsAction`, `disableCoachAction`). `reassignCoachClients` (`admin-coaches.ts:193-219`) correctly per-client try/catches, same failure-isolation fix web's own code comment documents (`admin-coach.actions.ts:119-124`) — not partial, matches intent.

**COA-003 — Coach creation form used freeform text for specialization/skills/languages, unbounded slot hours: NOT IMPLEMENTED (now FIXED).** Web's `new/page.tsx` draws specialization (single-select) and additional skills (multi-select chips) from the shared `COACH_SKILLS` constant (12 canonical values, `coach-tags.ts:5-18`), and languages from `COACH_LANGUAGES` (8 values including "Punjabi", `coach-tags.ts:20`). App's `coaches/new.tsx` had: (a) `specialization` as a raw free-text `LightTextField` — any string, no constraint to the canonical skill vocabulary used elsewhere for coach-client specialization matching; (b) "additional skills" as a freeform add-one-at-a-time text input, same problem; (c) a **hardcoded 7-language array missing "Punjabi"** entirely (`LANGUAGE_OPTIONS`, old line 22) — an admin literally could not create a Punjabi-speaking coach on mobile; (d) slot hour as a raw `number-pad` text field accepting 0-23 with no bound, vs web's fixed 5am-9pm `HOUR_GRID` tied to the `booking_window_*` settings — an admin could create an unreachable 2am slot.
  - **Fix**: added `src/lib/constants/coach-tags.ts` (mirrors web's file verbatim). Rewired `coaches/new.tsx` to use `COACH_SKILLS`/`COACH_LANGUAGES` chip-selects (specialization single-select + additional-skills multi-select excluding the chosen specialization, same pattern as web) and a `HOUR_OPTIONS`/`formatHour` 5am-9pm chip picker for slot hour, replacing the free-text fields. `CreateCoachInput.slots[].hour` changed from a parsed string to a validated number at the type level (`SlotRow.hour: number`).

**COA-004 — Coach detail "Performance" panel missing 9 of 15 web metrics: PARTIALLY IMPLEMENTED (now FIXED).** Web's `getCoachPerformanceAction` → `coachPerformance.service.ts:computePerformance()` returns 15 fields used for admin workload-balancing/quality-review decisions: `sessionsScheduledToday`, `attendancePct`, `clientNoShowPct`, `coachNoShowPct`, `maxCapacity`/`availableCapacity`, `totalWeeklySessions`, `totalMonthlySessions`, `avgSessionDurationMinutes`, `escalationsRaised`, `coachChangeRequestsReceived` (plus `totalActiveClients`/`totalSessionsCompleted`/`averageRating`, already covered by the app's existing `getAdminCoachDetail`). The app's coach-detail Performance card (`coaches/[id].tsx`, old lines 138-150) only ever showed 6 stats: completed/upcoming/missed session counts + rating/utilization/active-clients — the entire attendance-quality, no-show-rate, weekly/monthly-load, escalation-count, and coach-change-request-count picture was absent. (Mobile does have a `coach-performance.ts`, but it's hardcoded to `getMyCoachProfileId()` — the logged-in coach's own row — and can't be reused for an admin viewing an arbitrary coach.)
  - **Fix**: added `getAdminCoachPerformance(coachId)` to `admin-coaches.ts`, replicating web's `computePerformance()` query-for-query (same tables/predicates: `bookings`, `attendance`, `coach_profiles.max_capacity`, `coach_utilization_view`, `coach_change_requests.current_coach_id`, `escalations.coach_id`). Wired into `coaches/[id].tsx`'s Performance card as four additional stat rows (Today/Week/Month, Attendance/No-Show%s, Avg Duration/Capacity Left/Escalations, Change Requests).

**COA-005 — Coach detail "Clients" tab shows name only, web shows package + sessions remaining: IMPLEMENTED BUT DIFFERENT.** Web's `getAdminCoachDetailAction` clients array includes `packageName`/`sessionsRemaining` per client (`admin-coach.actions.ts:78,103-109`); app's `assignedClients` (`admin-coaches.ts:63,111-116,139`) only carries `id`/`full_name`. Not fixed this pass — would require joining `recurring_slots` → `client_profiles` → active `subscriptions`/`package_tiers`, a nontrivial addition risking overlap with the concurrently-running Clients-module task's edits to subscription-reading code. **Requires follow-up** (low severity — admin can already tap through to the client's own detail page for this).

---

## Requires product/schema decision

None — all confirmed gaps were fixable by reusing existing tables/patterns. COA-005 is a scope/sequencing deferral, not a schema gap.

---

## Matrix Rows

| ID | Area | Functionality | Location | Web Behavior | App Behavior (before) | Status | Fix |
|---|---|---|---|---|---|---|---|
| COA-001 | Coach list | Search + columns | `coaches.tsx`, `AdminCoachesListClient.tsx` | Name search, avatar/util/clients/rating/status | Identical | WORKING CORRECTLY | — |
| COA-002 | Coach detail | Profile/Skills/Hours/Controls actions | `admin-coaches.ts`, `admin-coach.actions.ts` | Full CRUD + reassign + disable | Identical, correct per-client failure isolation | WORKING CORRECTLY | — |
| COA-003 | Coach creation | Specialization/skills/languages/slot-hour inputs | `coaches/new.tsx`, `new/page.tsx` | Constrained chip-selects from `COACH_SKILLS`/`COACH_LANGUAGES`, 5am-9pm hour grid | Freeform text (specialization/skills), 7-language hardcode missing Punjabi, unbounded 0-23 hour field | NOT IMPLEMENTED | FIXED — shared `coach-tags.ts` + chip-select rewire |
| COA-004 | Coach detail | "Performance" panel metrics | `admin-coaches.ts`, `coachPerformance.service.ts` | 15-metric workload/quality panel | Only 6 of 15 metrics shown | PARTIALLY IMPLEMENTED | FIXED — added `getAdminCoachPerformance()` + 4 new stat rows |
| COA-005 | Coach detail | "Clients" tab row detail | `admin-coaches.ts`, `admin-coach.actions.ts` | Name + package + sessions remaining | Name only | IMPLEMENTED BUT DIFFERENT | Deferred — low severity, follow-up needed |

---

## Typecheck

`npx tsc --noEmit` — clean, no errors, after all fixes above.
