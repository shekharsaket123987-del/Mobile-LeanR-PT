# Audit Section 13: Admin Renewals Module Parity

Scope: `leanr-mobile-app` Admin "Renewal Opportunities" screen vs web `src/app/admin/renewals/page.tsx`. Reference for tone/format: `mobile-app-reference/audit/05-admin-coach-crossdeps-navigation.md` finding A6/ADM-011, which first flagged the threshold bug this doc confirms and fixes in full, plus does the screen-level field diff that prior pass didn't attempt. All line numbers as of this audit pass (2026-09-14).

---

## REN-001: Staff renewal threshold — CONFIRMED AND FIXED

Web: `src/lib/services/renewals.service.ts:7` — `export const RENEWAL_OPPORTUNITY_THRESHOLD = 10`, with its own header comment explicitly stating this is "deliberately wider than the client's own `SESSIONS_LOW_THRESHOLD` (5) so staff see it coming before the client's self-serve renewal window even opens." Confirmed live (not just cited) by reading the file directly — 10 is correct, not a stale doc claim.

Mobile before fix: `src/lib/data/admin-renewals.ts:11` and `src/lib/data/coach-renewals.ts:20` both hardcoded `SESSIONS_LOW_THRESHOLD = 5` and filtered on it — same threshold as the client's own gate, giving staff zero extra warning window.

**Fix applied:**
- `admin-renewals.ts` — added `RENEWAL_OPPORTUNITY_THRESHOLD = 10`, filter now uses it (`sessionsRemaining <= RENEWAL_OPPORTUNITY_THRESHOLD`), `SESSIONS_LOW_THRESHOLD` kept only as a citation constant, no longer used for filtering.
- `coach-renewals.ts` — same fix, threshold-only (did not touch this file's return shape or its screen, `(coach)/renewals.tsx` — out of scope for this admin-focused pass; see "Follow-up" below).

**Status: FIXED.**

---

## REN-002: "Expired" category — NOT IMPLEMENTED → FIXED

Web (`renewals.service.ts:33-43`) flags a client under one of two categories:
- `opportunity`: has an active subscription with `sessionsRemaining <= 10`.
- `expired`: has **no** active subscription but `hasEverSubscribed` is true (derived from `clients.service.ts:114`, any subscription row of any status ever). A client who never purchased at all is excluded from both.

The web UI (`RenewalOpportunitiesClient.tsx:12-16,24-41`) renders these as two tabs, "Renewal Opportunities" and "Expired", each with a live count in its label, backed by the same `rows` array split by `category`.

Mobile before fix: `admin-renewals.ts`'s only query was `supabase.from('subscriptions')...eq('status','active')` (old `:24`) — clients with **zero** active subscriptions were never fetched at all, so a client who fully lapsed (no active plan, but purchased before) was invisible on this screen. The screen's own tabs (`admin-renewals.tsx` old `:18-22`) were `all/due_soon/overdue` — a mobile-invented bucketing of the *opportunity* data only, with no "Expired" concept anywhere, matching the missing data.

**Fix applied:** `admin-renewals.ts` now queries every `client_profiles` row, cross-references *all* subscriptions per client (not just active), and classifies each client `opportunity` / `expired` / (excluded) exactly per web's rule above. `admin-renewals.tsx` now renders the same two-tab structure as web ("Opportunities" / "Expired", with counts), replacing the invented `due_soon`/`overdue` split — that distinction wasn't a web concept and the underlying data gap (no expired clients at all) was the real defect.

**Status: FIXED.**

---

## REN-003: Missing columns — Plan, client code, Converted badge — NOT IMPLEMENTED → FIXED

Web's table (`RenewalOpportunitiesClient.tsx:50-88`) shows, per row: client photo, name, client code, Plan (package name), Coach (admin only), Sessions Left, and a Converted/Not Converted badge (`converted` = client has purchased more than one subscription ever — `renewals.service.ts:18-22,66`).

Mobile before fix (`admin-renewals.tsx` old card, `:49-64`): name, sessions remaining/total, coach name, and a due-soon/overdue subtext only. No photo, no client code, no package/plan name, no converted indicator.

**Fix applied:** `admin-renewals.ts` now also returns `clientCode`, `clientPhoto`, `packageName`, and `converted` (computed identically to web: `subsForClient.length > 1`). `admin-renewals.tsx` now renders `LightAvatar` (photo+initials fallback, same component used by `admin-clients.tsx`), client code under the name, Plan name, and a Converted/Not Converted pill badge matching web's semantics.

**Status: FIXED.**

---

## REN-004: Navigation target — WORKING CORRECTLY

Web: each row links to `/${role}/clients/${clientId}` (`RenewalOpportunitiesClient.tsx:64`). Mobile: `router.push({ pathname: '/admin-clients/[id]', params: { id: o.clientId } })` (`admin-renewals.tsx`, both before and after this fix) — same destination, just mobile's routing idiom. **No gap.**

---

## REN-005: `sessionsRemaining` derivation — informational, not fixed (out of scope)

Web computes `sessionsRemaining` via a dedicated `subscription_usage_view` Postgres view (`clients.service.ts:91`). Mobile computes it in-line as `sessions_total - count(completed bookings)` — this is an app-wide pattern used identically in every mobile file that needs it (explicitly documented in `coach-renewals.ts`'s own header comment as confirmed-correct against the real schema), not something specific to the Renewals screen. Changing it here alone would make Renewals inconsistent with every other screen in the app rather than more consistent with web; a from-view vs. computed-in-JS reconciliation (if the two ever diverge) is a cross-cutting concern belonging to a dedicated `sessionsRemaining` audit, not this module pass. **Not flagged as a defect of this module; noted for awareness only.**

---

## Follow-up — outside this task's scope

- **Coach-side Renewals screen** (`(coach)/renewals.tsx`) still uses the old `all/due_soon/overdue` UI and `coach-renewals.ts`'s current (unenriched) row shape — only its *threshold* was fixed here (REN-001). It would need the same category/packageName/clientCode/converted enrichment and tab-structure change as REN-002/REN-003 to reach full parity with web's shared `RenewalOpportunitiesClient`. Left alone because this pass's directive scope was the **Admin** Renewals module; the coach-portal screen belongs to a coach-portal parity pass.

---

## Matrix Rows

| ID | Area | Workflow | Functionality | Location | Current Behavior (post-fix) | Expected/Intended Behavior | Status | Root Cause | Frontend | Backend/API | Database | Dependencies | Severity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| REN-001 | Admin/Coach renewals | Staff early-warning threshold | Renewal-opportunity flag bar | `src/lib/data/admin-renewals.ts`, `src/lib/data/coach-renewals.ts` | Now filters on `RENEWAL_OPPORTUNITY_THRESHOLD=10`, matching web exactly | web `renewals.service.ts:7` | FIXED | Mobile PRD used client-facing threshold instead of the wider staff one | Admin + Coach app | Direct Supabase reads | `subscriptions`, `bookings` | — | Medium (pre-fix) |
| REN-002 | Admin renewals | "Expired" client bucket | Clients with no active subscription but a purchase history | `src/lib/data/admin-renewals.ts`, `src/app/(admin)/admin-renewals.tsx` | Now queries all clients, classifies opportunity/expired, renders two-tab UI matching web | web `renewals.service.ts:33-43`, `RenewalOpportunitiesClient.tsx:12-16` | FIXED | Data layer only ever queried active subscriptions; screen had an invented tab structure with no expired concept | Admin app | Direct Supabase reads | `client_profiles`, `subscriptions` | — | High (pre-fix — whole category invisible) |
| REN-003 | Admin renewals | Row columns (photo, code, plan, converted) | Full row parity with web's table | `src/lib/data/admin-renewals.ts`, `src/app/(admin)/admin-renewals.tsx` | Now includes clientPhoto/clientCode/packageName/converted, rendered via LightAvatar + Converted badge | web `RenewalOpportunitiesClient.tsx:50-88` | FIXED | Fields never fetched/rendered | Admin app | Direct Supabase reads | `client_profiles`, `subscriptions`, `package_tiers` | — | Low-Medium (pre-fix) |
| REN-004 | Admin renewals | Row tap → client detail | Navigation target | `src/app/(admin)/admin-renewals.tsx` | `router.push` to admin client detail, same target as web | web `RenewalOpportunitiesClient.tsx:62-64` | WORKING CORRECTLY | — | Admin app | — | — | — | Info |
| REN-005 | Admin/Coach renewals | sessionsRemaining derivation | View-based (web) vs computed-in-JS (mobile) | `src/lib/services/clients.service.ts:91` (web) vs `admin-renewals.ts`/`coach-renewals.ts` (mobile) | Different implementation strategy, same app-wide mobile pattern everywhere else | Not a per-module gap | NOT APPLICABLE (informational) | Architectural difference, not a defect | Full app | — | `subscription_usage_view` (web only) | — | Info |

---

## Requires product/schema decision

None — all confirmed gaps were fixable within existing schema/RLS using data already available to the admin/coach roles.
