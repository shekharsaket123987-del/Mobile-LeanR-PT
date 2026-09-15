# Audit Section 8: Admin Sessions & Scheduling — Web vs App Parity

Scope: `leanr-mobile-app` Admin "Sessions" (`admin-sessions.tsx`, `admin-sessions/[id].tsx`, `admin-sessions.ts`) and "Scheduling" (`scheduling.tsx`, `admin-scheduling.ts`) vs web `src/app/admin/sessions/*`, `src/app/admin/scheduling/page.tsx`. Prior audit `05-admin-coach-crossdeps-navigation.md` §A8 rated the cancel/reschedule cutoff-bypass mechanics WORKING CORRECTLY at the data layer; this pass does the screen-level field/filter/behavior diff that pass didn't do.

---

## Sessions — List

| Web (`AdminSessionsClient.tsx`) | Mobile (`admin-sessions.tsx`, before fix) | Verdict |
|---|---|---|
| Coach filter (dropdown), Status filter (dropdown: all/upcoming/completed/cancelled/missed), fixed sort date-desc, no pagination | Coach filter (free-text search), same 5 status chips, same sort | WORKING CORRECTLY (dropdown→search-box is an acceptable mobile UI adaptation, same filter semantics) |
| `listAllBookings()` — **unbounded** query | `.limit(200)` hard cap | **BROKEN** — SES-001, fixed |
| Type column: Assessment (+ amount paid) / Regular badge | Not shown at all | **NOT IMPLEMENTED** — SES-002, fixed |
| Reschedule modal: date+time inputs, no duration field → passes `undefined` duration to the action, which the RPC coalesces to the booking's existing `duration_minutes` | Reschedule passed a hardcoded `45` for every session regardless of its actual duration | **BROKEN** — SES-003, fixed (highest severity: was silently corrupting session length data on every admin reschedule, e.g. a 60-min session rescheduled by an admin would be shortened to 45 min) |
| Cancel: no confirmation dialog | Same | WORKING CORRECTLY (intentional, not a mobile oversight) |

### SES-001 — Sessions list capped at 200 rows (FIXED)
`admin-sessions.ts` `listAdminSessions()` had `.limit(200)`; web's `listAllBookings()` (`bookings.service.ts:144-153`) has no limit at all. On a platform with >200 total sessions ever booked, admins would silently stop seeing older sessions with no indication of truncation. Removed the `.limit()`.

### SES-002 — Session type/amount-paid not shown on list (FIXED)
Web shows an "Assessment" badge with `amountPaid` or a "Regular" badge per row (`AdminSessionsClient.tsx:108`, using `bookings.amount_paid`, migration `0027_add_bookings_amount_paid.sql` — confirmed a real shared-DB column). Mobile's card showed only date/time, status, client·coach — no type/amount. Added a `session_type`/`amount_paid` line to each card. `amount_paid` and other admin-detail-only columns (`technical_issue`, `coach_on_leave`, `escalation_id`) weren't in the shared `Booking` type (`src/lib/data/types.ts`) — added them as a local intersection type in `admin-sessions.ts` rather than widening the shared type (confirmed real columns via web migrations 0018/0027, not guessed).

### SES-003 — Reschedule hardcoded duration to 45 minutes (FIXED, highest severity)
`reschedule_booking()` (migration `0018_timeline_escalations_performance.sql:98-130`) does `new_duration := coalesce(p_new_duration_minutes, b.duration_minutes)` — i.e. omitting the duration preserves the session's original length. Web's admin UI never collects a duration for reschedule, so it always passes `undefined`/`null`, correctly preserving duration. Mobile's `rescheduleSessionAsAdmin(id, newStart, 45)` call site (`admin-sessions.tsx`, old code) passed a hardcoded `45` unconditionally — every admin-rescheduled session, regardless of whether it was originally 30/45/60 minutes, would be silently truncated/extended to exactly 45 minutes. Fixed: `rescheduleSessionAsAdmin`'s duration param is now optional and defaults to `null` (preserve), and the screen no longer passes a hardcoded value.

---

## Sessions — Detail

Web (`src/app/admin/sessions/[id]/page.tsx` + `admin-session-detail.actions.ts`) renders: Basic Information (Session ID, Client, Coach, **Coach Employee Code**, Duration, Type, Source), Outcome Detail (originally scheduled, no-show party, **technical issue**, **coach on leave**, cancel reason), Attendance (client/coach **joined AND left**), Coaching Notes (notes, homework), **Weekly Progress Snapshot** (client's most recent pre-session measurement: weight/body-fat%/muscle%/waist/chest/hip/arms/thigh), **Linked Escalation** (if the session has one).

Mobile's `admin-sessions/[id].tsx` (before fix) had Basic Information (no employee code), Outcome Detail (no technical-issue/coach-on-leave), Attendance (**joined only, no "left" times** despite the data already being fetched via `getAdminSessionAttendance`'s `select('*')`), Coaching Notes (present, actually a superset — also shows `exercises_performed`/`performance_rating`, which web's detail page doesn't surface; harmless, left as-is) — and **entirely missing** the Weekly Progress Snapshot and Linked Escalation sections.

### SES-004 — Missing Coach Employee Code (FIXED)
Added `employee_code` to the `coach_profiles` select and a `Coach Employee Code` row.

### SES-005 — Attendance "left" timestamps fetched but never rendered (FIXED)
`getAdminSessionAttendance()` already does `select('*')`, so `client_left_at`/`coach_left_at` were already in the returned data — just not rendered. Added the two rows.

### SES-006 — Technical Issue / Coach on Leave outcome flags missing (FIXED)
Confirmed real columns (migration `0018`, `alter table bookings add column technical_issue boolean ... coach_on_leave boolean ...`). Added to the local `AdminSessionRow` type and rendered conditionally in Outcome Detail, matching web.

### SES-007 — Weekly Progress Snapshot section entirely missing (FIXED)
Web's `getLatestProgressLogBefore(clientId, scheduledStart)` finds the client's most recent `progress_logs` row before the session. Added `getAdminSessionProgressSnapshot()` to `admin-sessions.ts` (same table/columns already used by `progress.ts` for the client app — `weight, body_fat_pct, muscle_pct, waist, chest, hip, arms, thigh, logged_at`, `.lt('logged_at', beforeIso).order(desc).limit(1)`), and rendered the full 8-field grid + "As of" date, matching web's layout.

### SES-008 — Linked Escalation section entirely missing (FIXED)
`bookings.escalation_id` is a real column (migration `0018`). Added `getAdminSessionEscalation(escalationId)` (reads `escalations.reason`/`status` directly — no need for the fuller `getEscalationById` used elsewhere) and a conditionally-rendered card.

---

## Scheduling

Web (`admin-scheduling.actions.ts`) — 6 sections, **fully read-only, no per-row navigation** (`AdminSchedulingPage`'s `Section` component renders plain `<Card>`s, not links): Today's Changes, Cancelled, Rescheduled, Manual Sessions Created, Demo Sessions, Shadow Sessions. Each row shows client·coach, type badge, status badge, date/time, and a bucket-specific **note** (cancel reason / "From {old time}" / "Covering {primary coach} through {end date}").

Mobile's `scheduling.tsx`/`admin-scheduling.ts` (before fix) had the same 6 sections but:

### SES-009 — "Today's Changes" used a much broader definition than web (FIXED)
Web's predicate (`admin-scheduling.actions.ts:70-73`): `(status==='cancelled' && updated today) || (was_rescheduled && updated today) || created today`. Mobile's old query was simply `.gte('updated_at', todayIso)` — i.e. **any** booking touched today for **any** reason (attendance marked, notes added, etc.) would appear, which is a materially different and noisier definition than web's. Fixed by fetching today's update/create candidates and applying web's exact three-way predicate client-side (Postgrest can't express this compound condition server-side in one filter).

### SES-010 — "Shadow Sessions" bucket had different semantics than web (FIXED)
Web lists the raw `shadow_coach_assignments` rows directly (`id` = assignment id, `date` = `starts_on`, one row per assignment) — it does **not** cross-reference actual booking rows. Mobile's old implementation instead tried to derive matching *booking* rows within each assignment's date window (a more complex, differently-scoped computation with a different row count and different `id` semantics — clicking through, on mobile, would go to a real session; that click-through doesn't exist on web at all). Rewrote `getAdminScheduling()`'s shadow bucket to query `shadow_coach_assignments` directly (same shape web uses: `client`, `primary_coach`, `shadow_coach`, `starts_on`, `ends_on`, `status`), matching web's `id`/`note` semantics exactly.

### SES-011 — Rows had no type badge, status badge, or context note (FIXED)
Mobile's card only showed date/time + client·coach. Added `session_type` badge, `LightStatusBadge`, and the bucket-specific `note` field (now threaded through `withNames()` per bucket, mirroring web's `toEntry(b, note)`).

### SES-012 — Rows were tappable, navigating to session detail (FIXED)
Web's scheduling rows are **not** clickable at all (no `<Link>`/`onClick` in `Section`). Mobile wrapped every row in a `Pressable` routing to `/admin-sessions/[id]`. This was already semantically broken for the shadow bucket even before SES-010 (a booking-derived match, not the assignment itself) and is inconsistent with web's read-only presentation everywhere. Removed navigation from all 6 sections' rows, matching web.

### Requires product/schema decision
- **Preview cap differs (not fixed):** web fetches each bucket **unbounded** and shows the *true* total count in the section header while only rendering the first 10 rows (`entries.slice(0, 10)`); mobile caps each bucket's *query* at 30 rows (`todaysChanges` now 100 after SES-009's fix, others still 30), so its count badge understates the real total once a bucket exceeds the cap. This is a reasonable mobile-bandwidth tradeoff (mobile's cap is more generous per screen than web's 10-row preview), not a functional break, but it does mean the "N SESSIONS" eyebrow can silently under-report. Left as-is — matching web exactly would require a separate unbounded `count`-only query per bucket purely for the header number, which felt like scope creep for a cosmetic count; flagging for a product call on whether that's worth the extra queries.

---

## Matrix Rows

| ID | Area | Functionality | Location | Web Behavior | App Behavior (before) | Status | Severity |
|---|---|---|---|---|---|---|---|
| SES-001 | Sessions list | Row limit | `admin-sessions.ts` `listAdminSessions()` | Unbounded | `.limit(200)` | FIXED | Medium |
| SES-002 | Sessions list | Type/amount-paid display | `admin-sessions.tsx` card | Assessment(+amount)/Regular badge | Not shown | FIXED | Low |
| SES-003 | Sessions list | Reschedule duration | `admin-sessions.ts` `rescheduleSessionAsAdmin` | Preserves original duration | Hardcoded to 45 min | FIXED | High |
| SES-004 | Session detail | Coach Employee Code | `admin-sessions/[id].tsx` | Shown | Missing | FIXED | Low |
| SES-005 | Session detail | Attendance left-times | `admin-sessions/[id].tsx` | Joined+Left shown | Left times fetched but not rendered | FIXED | Low |
| SES-006 | Session detail | Technical issue / coach on leave | `admin-sessions/[id].tsx` | Shown | Missing | FIXED | Medium |
| SES-007 | Session detail | Weekly Progress Snapshot | `admin-sessions/[id].tsx` | Full 8-field snapshot | Entirely missing | FIXED | Medium |
| SES-008 | Session detail | Linked Escalation | `admin-sessions/[id].tsx` | Shown if linked | Entirely missing | FIXED | Medium |
| SES-009 | Scheduling | "Today's Changes" definition | `admin-scheduling.ts` | 3-way precise predicate | Any row updated today | FIXED | Medium |
| SES-010 | Scheduling | Shadow bucket data source | `admin-scheduling.ts` | Raw assignment rows | Derived booking matches | FIXED | Medium |
| SES-011 | Scheduling | Row badges/note | `scheduling.tsx` | Type/status badge + note | Date/time + client·coach only | FIXED | Low |
| SES-012 | Scheduling | Row navigation | `scheduling.tsx` | Read-only, no navigation | Tappable → session detail | FIXED | Low |
| SES-013 | Scheduling | Per-bucket true-total count | `scheduling.tsx` | Unbounded fetch, true count shown, 10-row preview | 30(/100)-row query cap, count reflects cap not truth | Requires product decision | Low |
