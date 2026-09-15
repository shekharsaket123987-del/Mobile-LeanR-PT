# Audit Section 11: Admin Shadow Coverage — Screen-Level Parity

Scope: `leanr-mobile-app` admin screen `src/app/(admin)/shadow.tsx` + `src/lib/data/admin-shadow.ts`. Web reference: `src/app/admin/shadow-coverage/page.tsx`, `src/components/admin/ShadowCoverageQueueClient.tsx`, `src/components/admin/ShadowCoachAssignModal.tsx`, `src/lib/actions/admin-shadow-coach.actions.ts`, `src/lib/services/scheduling.service.ts`. Backend mechanics (`assignShadowCoach()`, `runLeaveApprovalCascade()`, the `scoreShadowCandidate` scoring formula) were already confirmed WORKING CORRECTLY by `mobile-app-reference/audit/05-admin-coach-crossdeps-navigation.md` findings A5/A9/ADM-008 — not re-audited here. This pass covers only the admin-facing screen surface those findings didn't check.

---

## SHD-001: Manual "Assign shadow coach" flow — blind picker vs. scored/availability-aware preview

**Web** (`ShadowCoachAssignModal.tsx`): two-step preview-then-confirm. Admin picks a date range (defaults today–today) and optional reason, clicks "Find Coverage" → `previewShadowAssignmentPlanAction` runs the exact same per-occurrence scoring algorithm as the auto-cascade (`scoreShadowCandidate`: specialization/language/rating/utilization, filtered to only coaches actually free for that specific occurrence) and returns a plan that can span **different shadow coaches on different dates** plus an explicit **"No coach free on: ..."** list for occurrences nobody could cover. Only after reviewing this plan does the admin click "Confirm Assignment(s)", which fires one `assign_shadow_coach` RPC per (coach, date-range) group.

**Mobile, before this fix** (`shadow.tsx`, old `GapCard`): rendered a flat chip grid of *every* active coach (minus the primary), with no availability check, no scoring, no per-date splitting, and no indication of which occurrences (if any) had no free coach. An admin could pick a coach who is fully booked, on leave, or has zero specialization match for the whole gap window, and the RPC would still execute — the availability/conflict check web performs before ever showing a coach as assignable simply didn't run on mobile.

**Root cause**: `admin-shadow.ts` already contained a full, verbatim-scored, availability-aware matcher (`buildCandidatePool`, `isCoachFreeAt`, `scoreShadowCandidate`, `pickTopForOccurrence`, `groupOccurrenceAssignments`) — but it was private, wired only into `runLeaveApprovalCascade` (the automatic cascade on leave approval). The manual on-screen flow never called it.

**Fix implemented**:
- `src/lib/data/admin-shadow.ts`: added `previewShadowAssignmentPlan(clientId, primaryCoachId, startsOn, endsOn)` (exported, new `ShadowAssignmentPlan`/`ShadowAssignmentPlanItem` types), reusing the existing private helpers — mirrors `previewShadowAssignmentPlanAction` exactly (fetches the client's upcoming bookings with that coach in range, builds the same candidate pool excluding the primary coach, scores + groups per occurrence, returns `{ assignments, uncoveredDates }`). Does not require an approved `coach_leave` row, matching web's "manual path for a coach who never applied for leave" design intent.
- `src/app/(admin)/shadow.tsx`: replaced the chip-grid picker with a "Find coverage" → plan review (assignment groups + uncovered-dates warning + optional reason field) → "Confirm assignment(s)" flow, looping `assignShadowCoach()` once per group exactly like web's `confirmShadowAssignmentPlanAction`.

**Status: FIXED** (was NOT IMPLEMENTED relative to web's actual matching behavior — the mobile screen technically had *an* assign action, but it skipped the availability/scoring logic that is the entire point of the feature, which is a functional gap, not a cosmetic one).

---

## SHD-002: No ad-hoc (no-leave-record) manual assignment entry point on mobile

Web's manual assign flow is reachable from **two** places: (1) the shadow-coverage queue → client detail page, where the client already has an active gap tied to an *approved* `coach_leave` row, and (2) directly from the client detail page's "Assign Shadow Coach" button at any time, independent of any leave record — the code comment in `admin-shadow-coach.actions.ts` calls this "the one legitimate manual path... for a coach who never applied for leave in the system" (e.g. an undocumented sick day).

Mobile's `shadow.tsx` only ever lists gaps derived from `getShadowCoverageGaps()`, which strictly requires an `approved` `coach_leave` row (`admin-shadow.ts:146-150`). There is no equivalent trigger point anywhere in the mobile admin app for assigning shadow coverage when no leave record exists — the "Assign Shadow Coach" button lives on web's client-detail page, which is a different screen/file (`admin-clients/[id].tsx`) than this task owns.

**Status: NOT IMPLEMENTED, cross-cutting — flagged, not fixed here.** The new `previewShadowAssignmentPlan()` function added in SHD-001 already provides exactly the reusable logic this would need (it takes an arbitrary `startsOn`/`endsOn`, not a leave window) — a future pass on the Clients-module detail screen (`admin-clients/[id].tsx`, owned by a different task in this sweep) can add an "Assign Shadow Coach" button there that opens a date-range + reason picker and calls `previewShadowAssignmentPlan` / `assignShadowCoach` from `admin-shadow.ts`, the same way web's `ShadowCoachAssignModal` does. Logged as a **cross-module follow-up**, not implemented in this pass since it requires editing a file outside this task's scope.

---

## SHD-003: Queue list itself — filters, grouping, empty state

Web's queue page (`ShadowCoverageQueueClient.tsx`) has no filters/sort/pagination — it's a flat list of gaps with an "All covered" empty state, one card per (client, leave) pair, each linking out to the client detail page. Mobile's queue (`getShadowCoverageGaps()` + the list render in `shadow.tsx`) matches this exactly: same flat list, same one-card-per-gap grouping, same "no filters" behavior, equivalent empty state ("No coverage gaps right now."). Both compute the gap set the same way (approved leave + still-`upcoming` bookings still pointed at the leaving coach).

**Status: WORKING CORRECTLY.**

---

## Requires product/schema decision

None — both SHD-001 (fixed) and SHD-002 (flagged) are implementable with existing schema/RPCs; SHD-002 just needs work in a file this task doesn't own.

---

## Matrix Rows

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Root Cause | Frontend | Backend/API | Database | Dependencies | Severity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SHD-001 | Admin shadow coverage | Manual assign from queue | Scored, availability-aware preview-then-confirm plan | `src/lib/data/admin-shadow.ts` (new `previewShadowAssignmentPlan`), `src/app/(admin)/shadow.tsx` | Fixed: now computes per-occurrence best-match plan with uncovered-dates warning before confirming | Same as web `ShadowCoachAssignModal` (web §10) | FIXED | Existing scoring/availability matcher was private to the auto-cascade only | Admin app | Direct Supabase reads + `assign_shadow_coach` RPC | `bookings`, `coach_profiles`, `coach_leave`, `coach_shifts`, `coach_availability`, `coach_utilization_view` | Reuses SHD-001 helpers already used by ADM-008 (05.md) | High |
| SHD-002 | Admin shadow coverage | Ad-hoc assignment without a leave record | Manual coverage entry point independent of `coach_leave` | N/A on mobile — web: `AdminClientDetailClient.tsx` "Assign Shadow Coach" button + `ShadowCoachAssignModal.tsx` | No trigger point anywhere in mobile admin app | Available from client detail page at any time (web §10) | NOT IMPLEMENTED (cross-module, flagged not fixed) | Feature lives on a screen (`admin-clients/[id].tsx`) outside this task's scope | Admin app | `previewShadowAssignmentPlan` (new, ready to reuse) | — | Needs Clients-module task to add the button | Medium |
| SHD-003 | Admin shadow coverage | Queue list | Gap listing, grouping, empty state | `src/lib/data/admin-shadow.ts:143-179`, `src/app/(admin)/shadow.tsx` | Matches web exactly | web §10 | WORKING CORRECTLY | — | Admin app | — | `coach_leave`, `bookings` | — | Info |
