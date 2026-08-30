# LEANR PT — Web-to-Mobile Conversion PRD

**Status:** Documentation only. Derived entirely from a read-only analysis of the existing LeanR PT web application in this repository. Nothing in the web app was modified to produce this document.

**Purpose:** This is the implementation-ready specification for building **Android and iOS mobile applications** that replicate the existing LeanR PT web application's functionality. It is intended to be copied into a **new, separate project** and used by another AI/developer as the fixed source of truth for that build. The existing web application (this repository) remains the canonical reference implementation and must not be changed as a result of this document.

**Sourcing discipline:** Every claim below is drawn directly from the actual code (Next.js pages/components, Server Actions, Supabase services, and 49 SQL migrations). Nothing is invented. Anything ambiguous or not verifiable from the code is explicitly marked **OPEN QUESTION**. A consolidated list of all open questions is in §32.

---

## 1. Product Overview

**LEANR by Fitelo** ("LEANR" is the product/brand name; "Fitelo" is the parent company, shown as a sub-lockup "By Fitelo" under the wordmark) is a **live, online 1:1 Personal Training (PT) platform**. A client purchases a session package, is assigned a personal coach, sets up a recurring weekly training schedule (or books ad-hoc/one-off sessions), and attends live video sessions over Zoom. Coaches manage their availability, run sessions, record attendance and workout notes. Admin operations staff manage the coach roster, client roster, scheduling oversight, escalations, renewals, sales, and platform settings.

The product has **three portals**, each a distinct authenticated area of the same Next.js app, gated by role:
- **Client Portal** (`/client/*`) — the paying customer
- **Coach Portal** (`/coach/*`) — the personal trainer delivering sessions
- **Admin Portal** (`/admin/*`) — internal operations staff

This is **not** a UX prototype despite some legacy scaffolding remnants (see §2) — it is a real, working application backed by a real Supabase Postgres database (49 migrations), real Razorpay payments, and real Zoom meeting provisioning.

**Terminology that must be preserved verbatim in the mobile app** (see §23 for full glossary):
- "Portal" (e.g. "Client Portal"), "PT" (Personal Training), "Coach" (never "Trainer" as a role name), "Assessment" (demo/trial session type), "My Concerns" (client-facing) vs. "Escalations" (coach/admin-facing — same underlying feature, different label per role), "My Schedule" (recurring plan) vs. "Book a Session" (ad-hoc booking), "Renewal Opportunities".

---

## 2. Existing Product Scope

### What is real and implemented
- Full Supabase Auth (email/password + Google OAuth) with 3-role model (client/coach/admin)
- 27 database tables, 20 enums, 21 database functions, 6 views, full RLS policy set, 4 storage buckets
- Complete booking/scheduling engine: recurring weekly patterns, one-off bookings, temporary-hold-then-confirm concurrency-safe booking, conflict detection via a hard DB exclusion constraint
- Reschedule (with substitute-coach support) and cancellation flows with cutoff-hour business rules
- Real Zoom Server-to-Server OAuth integration — meetings are actually created via the Zoom API
- Real Razorpay payment integration — orders created and payment signatures cryptographically verified server-side
- Coach leave requests + automatic shadow-coach coverage assignment
- Client-coach real-time chat (Supabase Realtime) with attachments and read receipts
- Escalation (support ticket) system with a gated resolution workflow
- Client journey timeline (permanent, append-only audit trail) and a separate generic audit log (DB-trigger-driven)
- Admin reporting (CSV/PDF export), sales ledger, platform settings, package/plan CRUD

### What is explicitly NOT implemented (do not add to the mobile app unless separately requested)
- **No push/email/SMS/WhatsApp notification dispatch.** Notifications are DB rows only (`notifications` table), displayed in-app. The `channels` jsonb column exists as a placeholder but nothing writes to it. **This is a deliberate, documented Phase-1 boundary**, not a bug.
- **No real refund/payment-gateway-triggered money movement.** "Log Refund Request" (admin) only writes an audit-log/timeline entry; a human must action the actual refund in Razorpay's dashboard separately.
- **No password-reset flow.** The "Forgot password?" link on the login form has no handler — it is visually present but non-functional.
- **No session recording.** The Zoom integration explicitly does not enable recording.
- **No cron/scheduled jobs.** All "sweep" operations (expiring holds, flagging overdue attendance/notes, marking missed sessions) run opportunistically as a side effect of other DB function calls or page loads — there is no timer-based backend job.
- `src/lib/types.ts` and `src/lib/mock-data.ts` are **legacy prototype scaffolding** predating the real Supabase backend (used only by the landing page's testimonials section, which is still mock data). **Do not treat these as the source of truth** — the SQL migrations and services are authoritative.

---

## 3. User Roles

Exactly three roles exist, stored in a single `user_role` enum column (`admin | coach | client`) on the `profiles` table. There is no custom-claims/JWT role system — every authorization check (middleware, service layer, RLS) ultimately reads this column.

### CLIENT
- **Login:** Email/password or Google OAuth, at `/login/client`. Self-serve signup at `/signup` (client role only — this is the only role the public can self-register as).
- **Dashboard:** `/client/dashboard` — journey-stage-driven home screen (see §15 Journey Gate).
- **Permissions:** Full CRUD on own profile/progress/bookings/concerns/chat; read-only on assigned coach's public profile; no cross-client visibility.
- **Accessible screens:** Dashboard, Book a Session, My Schedule, My Sessions, Subscription & Payments, Choose Your Plan, Book Free Demo, Profile, My Concerns, My Coach, My Chats, Progress, Renewal Check-in, Onboarding, Activate Plan, Notifications.
- **Restricted:** Cannot see other clients' data, cannot see coach-internal data (availability management, performance metrics of other coaches), cannot resolve escalations or coach-change requests (can only raise/request them).
- **APIs used:** All client-scoped Server Actions in `src/lib/actions/client-*.actions.ts`, `schedule.actions.ts`, `payments.actions.ts`, `renewals.actions.ts` (client subset), `chat.actions.ts` (client side).
- **DB entities accessed:** `profiles` (own), `client_profiles` (own), `client_onboarding` (own), `subscriptions` (own), `bookings` (own), `recurring_slots` (own), `progress_logs` (own), `escalations` (own), `coach_change_requests` (own), `conversations`/`messages` (own), `notifications` (own), `payments` (own, read-only), `coach_profiles`/`coach_availability` (read-only, any — needed for booking).

### COACH / PT
- **Login:** Email/password or Google OAuth, at `/login/coach`. **No self-serve signup** — coach accounts are ops-provisioned only (created by an admin via the Add Coach flow, which creates the Supabase Auth user directly).
- **Dashboard:** `/coach/dashboard` — day-at-a-glance stats + Today's Tasks / Pending Tasks / Upcoming widgets.
- **Permissions:** Full read/write on own profile (partial — see below), own availability (read-only — admin sets working hours), own leave requests, own clients' session data (attendance, notes), read-only global client search (any client, not just own roster), read-only escalations for own clients (cannot resolve — admin-only).
- **Accessible screens:** Dashboard, Availability (view + leave request), Schedule, Clients (roster + detail), Session Detail (in-session workflow), Escalations (read-only), Notifications, Performance, Profile, Renewals (read-only variant), Search (global), Chats.
- **Restricted:** Cannot edit own working hours (admin-only since migration 0045), cannot resolve escalations, cannot approve/reject own leave requests, cannot see billing/progress detail for non-assigned clients found via Global Search (read-only banner shown).
- **APIs used:** `coach-portal.actions.ts`, `coach-profile.actions.ts`, `schedule.actions.ts` (coach subset), `chat.actions.ts` (coach side), `renewals.actions.ts` (coach subset).
- **DB entities accessed:** `profiles`/`coach_profiles` (own, partial write), `coach_availability`/`coach_shifts` (read-only), `coach_leave` (own, insert-only), `bookings` (own, as coach), `attendance`/`workout_notes` (own bookings, write), `client_profiles`/`profiles` (linked clients full, any client via search read-only-widened), `escalations` (linked, read-only), `shadow_coach_assignments` (own), `conversations`/`messages` (own).

### ADMIN
- **Login:** Email/password or Google OAuth, at `/login/admin`. **No self-serve signup** — admin accounts must be manually created/promoted; **no migration or seed script creates an admin account** — this is an out-of-band operational step. **OPEN QUESTION:** exact first-admin provisioning process is not present anywhere in the codebase.
- **Dashboard:** `/admin/dashboard` — platform-wide KPIs (clients, sessions, revenue, utilization).
- **Permissions:** Full read access to everything (RLS grants `is_admin()` full access on every table); full write access to coach/client management, scheduling overrides, escalation resolution, leave approval, settings, packages, refund logging (audit-only).
- **Accessible screens:** Dashboard, Availability Check, Coaches (list/new/detail), Clients (list/detail), Scheduling (oversight), Sessions (master list/detail), Shadow Coverage, Activity Log, Coach Change Requests, Escalations (list/detail — full resolution workflow), Leave Requests, Notifications, Renewals, Reports, Sales, Search, Settings.
- **Restricted:** Nothing functionally restricted within the app — admin is the superuser role.
- **APIs used:** All `admin-*.actions.ts` files (19 files — see §11).
- **DB entities accessed:** Everything, generally via `supabaseAdmin` (service-role client, bypasses RLS) for cross-tenant operations, or the RLS-scoped client where `is_admin()` policies apply.

---

## 4. Application Architecture

### Stack (existing web app)
Next.js 14 (App Router) + TypeScript + Tailwind CSS + Recharts, backed by **Supabase** (Postgres + Auth + Storage + Realtime). Deployed to both Netlify and Vercel.

### Critical architectural fact: there is NO REST/GraphQL API layer
Every mutation and most reads go through **Next.js Server Actions** — `"use server"` functions in `src/lib/actions/*.actions.ts` — called directly from Server/Client Components as RPC-like calls. There are **no files under `src/app/api/`**. Every Server Action:
1. Resolves the caller's access token (`getAccessToken()` from `src/lib/supabase/server-client.ts`, cookie-based).
2. Delegates to a function in `src/lib/services/*.service.ts`.
3. That service function calls `getCallerContext(accessToken)` (`src/lib/services/_auth.ts`) — resolves `auth.getUser()` + a `profiles` lookup (role/name/photo), memoized via React `cache()`.
4. Calls `requireRole(ctx, [...])` — throws `Forbidden` if the caller's role isn't allowed. This is the **application-layer authorization**, layered on top of (not instead of) Postgres RLS.
5. Queries Supabase through a **request-scoped client** (`src/lib/supabase/request-client.ts`, built fresh per call from the bearer token, so RLS sees the correct `auth.uid()`) — or, for privileged/cross-tenant operations, through `src/lib/supabase/admin-client.ts` (service-role key, bypasses RLS entirely, marked `server-only`).
6. Returns `ActionResult<T>` = `{ok:true, data}` or `{ok:false, error:{message}}`.

**This has a major consequence for the mobile app that the new AI must resolve explicitly (see §27):** Server Actions are a Next.js-specific RPC mechanism (same-origin, framework-coupled) and are **not directly callable from a native mobile app** the way a REST/GraphQL endpoint would be. The mobile app cannot simply "call the same API" — it must either (a) talk to Supabase directly (Auth + Postgres + RPC functions + Storage + Realtime) and reimplement the TypeScript business-rule logic currently living in `src/lib/services/*.ts` client-side, or (b) a thin HTTP API layer needs to be stood up in front of the existing service functions. This is the single most important technical decision for the new project — see §27.

### Three-layer authorization (defense in depth)
1. **Middleware** (`src/middleware.ts`) — matches `/client/:path*`, `/coach/:path*`, `/admin/:path*`; derives required role from the URL's first path segment; redirects to `/login/{role}` if no session or `profiles.role` mismatch. First real enforcement layer.
2. **Service-layer `requireRole()`** — throws inside the Server Action even if middleware were somehow bypassed.
3. **Postgres RLS** — the last-resort DB-level guarantee, using `auth.uid()` from the JWT. Even a buggy or malicious client cannot read/write rows it shouldn't, because RLS is enforced by Postgres itself, not application code.

**The mobile app must replicate all three layers conceptually**: client-side route guarding (UX), a business-logic layer enforcing the same rules server-side (wherever that ends up living), and RLS (unchanged, since the same Supabase project/schema should be reused).

### Three Supabase client wrappers
| Wrapper | Purpose |
|---|---|
| `server-client.ts` | Cookie-aware client for reading the current session (RSC/Server Actions only) |
| `admin-client.ts` | Service-role key, bypasses RLS — privileged/system operations only, never client-exposed |
| `request-client.ts` | Request-scoped client built from an explicit bearer token — what the service layer actually queries through, so RLS applies correctly |

### Directory map (for cross-reference during mobile build)
```
src/app/{client,coach,admin}/**   — route pages (Server Components)
src/app/{login,signup}/**         — auth pages
src/app/auth/callback             — OAuth callback route handler
src/components/{client,coach,admin,shared,ui,auth,landing,chat}/** — React components
src/lib/actions/*.actions.ts      — 33 Server Action files (the de facto "API")
src/lib/services/*.service.ts     — 26 service files (business logic + DB access)
src/lib/supabase/*.ts             — 3 Supabase client wrappers
src/lib/constants/*.ts            — shared constants (pricing, scheduling, coach tags, concern categories)
src/middleware.ts                 — role-based route protection
supabase/migrations/0001–0049.sql — full DB schema history (source of truth for schema)
```

---

## 5. Screen Inventory

### CLIENT PORTAL (18 pages)

| Screen | Route | Purpose | Entry Point | Data Loaded | Main Actions | Server Action(s) | Next Screen |
|---|---|---|---|---|---|---|---|
| Client Root | `/client` | Redirect only | login | — | — | — | `/client/dashboard` |
| Dashboard | `/client/dashboard` | Home; journey stage, next session, progress deltas, recent sessions | Login/nav | `getClientDashboardAction`, `getMyJourneyStateAction`, `getMyProgressAction` | Join next session; "Update now" | — | Varies by journey stage |
| Book a Session | `/client/book` | One-off/first booking wizard | Nav (hidden once recurring plan exists) | `getBookingOptionsAction`, journey state, measurement status | Continue → pick slot → Confirm | `confirmBookingAction` | `/client/sessions` or dashboard |
| My Schedule | `/client/schedule` | Set up/change recurring weekly pattern | Nav; renewal/demo redirects | `getScheduleSetupOptionsAction`, journey state | Pick pattern → Check Availability → Confirm | `matchScheduleAction`, `confirmScheduleAction`/`changeScheduleAction`, `keepRenewalScheduleAction`, `reportScheduleUnmatchedAction` | Dashboard |
| My Sessions | `/client/sessions` | Full session history, 5 tabs (Upcoming/Completed/Cancelled/Missed/Rescheduled) | Nav | `getClientSessionsAction`, scheduling rules, shadow notice | Reschedule, Cancel, Rate Session | `cancelSessionAction`, `rateSessionAction`, `markNotificationReadAction`, `rescheduleSessionAction` (via modal) | Stays (in-place update) |
| Subscription & Payments | `/client/subscription` | Plan usage + payment ledger (read-only) | Nav | `getMySubscriptionAction`, journey state | — | — | `/client/plans` |
| Choose Your Plan | `/client/plans` | Purchase packages | Nav; redirected here from many stages | `listMarketingPlansAction` | Purchase Plan (Razorpay) | `createPackagePurchaseOrderAction` → Checkout.js → `verifyPaymentAction` | Dashboard |
| Book Free Demo | `/client/demo-booking` | Free 1:1 demo, auto-matched coach | Nav/plans/dashboard CTA | Measurement status | Book Free Demo Session | `bookDemoSessionAction` | Confirmation → dashboard |
| Profile | `/client/profile` | Edit personal info/photo/password | Nav | `getMyProfileAction` | Edit, upload photo, save, change password | `updateMyProfileAction` | Stays |
| My Concerns | `/client/concerns` | Raise/track support tickets | Nav | `listMyConcernsAction` | Raise a Concern | `raiseConcernAction` | Stays |
| My Coach | `/client/coach` | View coach; request/complete coach change | Nav | `getMyCoachAction`, coach-change request | Request Change; pick days/time → Confirm | `requestCoachChangeAction`, `findCoachChangeOptionsAction`, `completeCoachChangeAction` | Stays |
| My Chats | `/client/chats` | Message assigned coach | Nav (shown only if a chat has ever existed) | `getMyChatsAsClientAction` | Send message | `sendChatMessageAction` | Stays |
| Progress | `/client/progress` | Weekly measurement log + charts | Nav | `getMyProgressAction`, sessions | Log This Week's Update | `submitMyProgressAction` | Stays |
| Renewal Check-in | `/client/renewal-checkin` | One-time post-renewal baseline | Auto-redirect (stage=`renewal_checkin`) | Journey state, prior logs | Continue | `submitRenewalCheckinAction` | Dashboard |
| Onboarding | `/client/onboarding` | First-time intake form | Auto-redirect (stage=`onboarding`) | — | Complete Assessment | `submitOnboardingAction` | Dashboard |
| Activate Plan | `/client/activate` | Pick plan start date | Auto-redirect (stage=`awaiting_activation`) | Journey state | Confirm Start Date | `activatePlanAction` | Dashboard |
| Notifications | `/client/notifications` | Notification inbox | Nav | `listMyNotificationsAction` | Mark read | `markNotificationReadAction` | Stays |

### COACH PORTAL (11 pages)

| Screen | Route | Purpose | Entry Point | Data Loaded | Main Actions | Server Action(s) | Next Screen |
|---|---|---|---|---|---|---|---|
| Dashboard | `/coach/dashboard` | Stats + Today/Pending/Upcoming session lists | Login/nav | 6 parallel actions | Mark attendance/join inline | (TaskRow actions) | Session detail, client detail |
| Availability | `/coach/availability` | View working-hours template (read-only) + leave requests | Nav | `getCoachAvailabilityAction` | Request Leave | `requestLeaveAction` | Stays |
| Schedule | `/coach/schedule` | Day/Week toggle of bookings | Nav | `getCoachScheduleAction`, today's tasks | Click day → modal → session | — | Session detail |
| Clients (roster) | `/coach/clients` | Assigned clients, filters | Nav | `getCoachClientsAction` | Search/filter, click row | — | Client detail |
| Client Detail | `/coach/clients/[id]` | Full client profile (read-only) | Roster/search/session sidebar | `getCoachClientDetailAction` | — | — | — |
| Session Detail | `/coach/session/[id]` | Live session workflow | Dashboard/schedule/pending tasks | `getCoachSessionDetailAction` | Join → Present/Late/Absent → Notes → Complete | `markSessionJoinedAction`, `markAttendanceAction`, `submitSessionNotesAction` | Dashboard |
| Escalations | `/coach/escalations` | Read-only concerns view | Nav | `getCoachEscalationsAction` | — (read-only) | — | — |
| Notifications | `/coach/notifications` | Assignments, leave, escalations, schedule changes | Nav | `listMyNotificationsAction` | Mark read | — | — |
| Performance | `/coach/performance` | Personal KPIs + activity timeline | Nav | `getMyPerformanceAction`, `getMyActivityAction` | — (read-only) | — | — |
| Profile | `/coach/profile` | Edit contact info/photo/password/skills | Nav | `getMyCoachProfileAction` | Edit contact, add skill, change password | `updateMyCoachProfileAction`, `addMySkillAction` | Stays |
| Renewals | `/coach/renewals` | Clients low on sessions/renewed (shared, read-only for coach) | Nav | `getRenewalOpportunitiesAction` | — | — | — |
| Search | `/coach/search` | Global client lookup | Nav | `searchAllClientsAction` | Type-ahead | — | Client detail (read-only if not own) |
| Chats | `/coach/chats` | Messaging, tabbed by relationship state | Nav | `getMyChatsAsCoachAction` | Send message | (shared chat actions) | — |

### ADMIN PORTAL — Operational (11 pages)

| Screen | Route | Purpose | Main Actions | Server Action(s) | Next Screen |
|---|---|---|---|---|---|
| Dashboard | `/admin/dashboard` | Platform KPIs | — (read-only) | `getAdminDashboardAction` | — |
| Availability Check | `/admin/availability?date=` | Every coach's slots for one day | Date nav, filter tabs | `getAvailabilityCheckAction` | Client detail |
| Coaches List | `/admin/coaches` | Coach roster | Search, "+ Add Coach" | `listAdminCoachesAction` | Add Coach / Coach Detail |
| Add Coach | `/admin/coaches/new` | Create coach account | Fill form → Create Coach | `createCoachAction` | Coaches list |
| Coach Detail | `/admin/coaches/[id]` | Profile, performance, hours, calendar | Edit, Save Skills, Save Hours, Block Slot, Reassign Clients, Disable | `updateCoachAction`, `updateCoachSkillsAction`, `setCoachAvailabilityAction`, `blockCoachSlotAction`, `reassignCoachClientsAction`, `disableCoachAction` | Stays |
| Clients List | `/admin/clients` | All clients | Search, status filter | `listAdminClientsAction` | Client Detail |
| Client Detail | `/admin/clients/[id]` | Full client management | Adjust sessions, pause-days, transfer coach, shadow assign, pause sub, log measurement/escalation/refund, resolve escalation | `adjustClientSessionsAction`, `adjustPauseDaysAction`, `transferClientCoachAction`, `pauseClientSubscriptionAction`, `logRefundRequestAction`, `logMeasurementAction`, `logEscalationAction`, `resolveEscalationAction` | Stays |
| Scheduling | `/admin/scheduling` | Grouped oversight (today's changes/cancelled/rescheduled/manual/demo/shadow) | — (read-only) | `getAdminSchedulingViewAction` | — |
| Sessions | `/admin/sessions` | Every session, filterable | Filter, inline Reschedule/Cancel | `listAdminSessionsAction`, `rescheduleSessionAction`, `cancelSessionAction` | Session Detail |
| Session Detail | `/admin/sessions/[id]` | Full read-only session record | — | `getAdminSessionDetailAction` | — |
| Shadow Coverage | `/admin/shadow-coverage` | Uncovered leave-affected sessions | "Assign shadow coach" → nav | `listShadowCoverageGapsAction` | Client Detail |

### ADMIN PORTAL — Business Ops (10 pages)

| Screen | Route | Purpose | Main Actions | Server Action(s) | Next Screen |
|---|---|---|---|---|---|
| Activity Log | `/admin/activity-log` | Every DB mutation on core tables | Filter by entity type | `getAuditLogAction` | — |
| Coach Change Requests | `/admin/coach-change-requests` | Approve/reject | Approve (± pick coach), Reject | `resolveCoachChangeRequestAction` | Stays |
| Escalations (list) | `/admin/escalations` | Global concerns queue | Tab Active/Resolved, click row | `listAllEscalationsAction` | Escalation Detail |
| Escalation Detail | `/admin/escalations/[id]` | Gated resolution workflow | Confirm Called → Save Assessment → Add Note → In Progress → Resolve | `confirmCalledClientAction`, `updateEscalationDetailsAction`, `addEscalationNoteAction`, `markEscalationInProgressAction`, `resolveEscalationAction` | Stays |
| Leave Requests | `/admin/leave-requests` | Approve/reject coach leave | Approve, Reject | `resolveLeaveAction` | Stays (shows shadow-coverage summary) |
| Notifications | `/admin/notifications` | Admin's own alerts | Mark read | `listMyNotificationsAction` | Varies |
| Renewals | `/admin/renewals` | Every client low/expired platform-wide | — (view) | `getRenewalOpportunitiesAction` | — |
| Reports | `/admin/reports` | CSV/PDF exports (5 reports) | Download CSV/PDF ×5 | `generateClientReportAction`, `generateCoachReportAction`, `generateMonthlyReportAction`, `generateRevenueReportAction`, `generateCancellationReportAction` | File download |
| Sales | `/admin/sales` | Transaction ledger | Search | `listSalesAction` | Client Detail |
| Search | `/admin/search` | Global client lookup | Type-ahead | `searchAdminClientsAction` | Client Detail |
| Settings | `/admin/settings` | Business rules + package CRUD | Add/Edit/Delete package, adjust sliders, Save | `getAdminSettingsAction`, `updateSettingAction`, `createPackageAction`, `updatePackageAction`, `deletePackageAction` | Stays |

### AUTH / PUBLIC (7 pages)

| Screen | Route | Purpose | Next Screen |
|---|---|---|---|
| Landing | `/` | Marketing page: hero, trust bar, coach carousel, how-it-works, pricing, testimonials, footer | `/signup`, `/login/*` |
| Client Login | `/login/client` | Email/password or Google | `/client/dashboard` |
| Coach Login | `/login/coach` | Email/password or Google | `/coach/dashboard` |
| Admin Login | `/login/admin` | Email/password or Google | `/admin/dashboard` |
| Signup | `/signup` | Client-only self-serve registration | `/client/plans` (or email-confirm screen) |
| OAuth Callback | `/auth/callback` | Exchanges code, routes by actual DB role | Role-appropriate dashboard |

---

## 6. Feature Inventory

This section lists every distinct feature implemented, organized by portal. Each entry follows: Purpose → Role → Access → User Action → Frontend → Server Action → Backend → DB → Validation → Success/Failure → Connected Features. Full detail for each is in the per-portal analyses folded into §5, §8, §10, §15–§20. Below is the master feature list; see cross-referenced sections for full technical detail.

**Client-side (14 features):** Book a Session (ad-hoc), Recurring Schedule Setup/Change, Reschedule Session, Cancel Session, Rate Session/Feedback, Purchase Plan/Package (Razorpay), Book Free Demo Session, Activate Plan, Onboarding (Initial Assessment), Renewal Check-in, Weekly Progress/Measurements Log, My Coach/Request Coach Change, Raise a Concern (Escalation), Chat with Coach, Notifications, Subscription & Payment History.

**Coach-side (13 features):** Set Availability (view-only)/Request Leave, Coach Dashboard Stats, Today's Tasks/Pending Tasks/Upcoming widgets, Client Roster & Detail, In-Session Workflow (Join→Attendance→Notes→Complete), Global Client Search, Coach Performance Dashboard, Client Escalations (read-only), Coach Profile (self-service subset)/Password Change, Renewal Opportunities (view), Chat with Clients, Notifications.

**Admin-side (18 features):** Platform Dashboard/KPI Overview, Availability Check, Coach Roster Management (List+Detail+Create), Client Roster Management (List+Detail), Scheduling Oversight, Sessions Master List + Inline Reschedule/Cancel, Session Detail (forensics), Shadow Coach Coverage (gap queue+assignment), Coach Performance Panel, Activity Log/Audit Trail, Coach Change Request Resolution, Escalation Resolution Workflow, Coach Leave Approval + Automatic Shadow Coverage, Reports Export, Sales Ledger, Global Client Search, Platform Settings & Package Management, Notifications.

**Cross-cutting (used by 2+ roles):** Authentication (login/signup/OAuth), Notifications, Chat, Audit/Timeline logging, Zoom live session integration, Razorpay payments, Escalation raising vs. resolution, Coach-change request/resolution, Shadow-coach coverage.

---

## 7. User Flows

### 7a. New client acquisition (marketing → active)
```
Signup/Login
 ↓
Client Dashboard (journeyStage = "marketing")
 ↓
[Book Free Demo]  or  [Choose Your Plan]
 ↓ (demo path)
Demo Booking form → bookDemoSessionAction → auto-matched coach + slot
 ↓
Dashboard (stage "demo_booked") → session time passes → (stage "demo_completed")
 ↓
Demo Feedback Gate (rate or skip) → Choose Your Plan
 ↓ (plan path, from either route)
Plans page → Purchase Plan → Razorpay Checkout → verifyPaymentAction (server-verified)
 ↓
Congratulations modal → Dashboard (stage "awaiting_activation")
 ↓
Activate Plan (pick start date) → activatePlanAction
 ↓
Dashboard (stage "onboarding") → Onboarding form (Day 1 baseline) → submitOnboardingAction
 ↓
Dashboard (stage "slot_selection") → My Schedule (setup mode) → matchScheduleAction → confirmScheduleAction
 ↓
Dashboard (stage "active") — recurring bookings now exist
```
**This journey-stage state machine is the master driver of client navigation.** Stages: `marketing → demo_booked → demo_completed → awaiting_activation → onboarding → renewal_checkin → renewal_scheduling → slot_selection → active`, computed server-side on every load by `getMyJourneyStateAction`.

### 7b. Ad-hoc / first session booking
```
Book a Session nav → intro (assessment badge if first session) → Continue
 ↓
Pick open slot (assigned coach, next 14 days) → Confirm Schedule
 ↓
Review & Confirm → confirmBookingAction (measurement check, coach check, subscription check if regular)
 ↓
Booking created → confirmation → My Sessions / Dashboard
```

### 7c. Reschedule
```
My Sessions → Reschedule (only if outside cutoff)
 ↓
RescheduleModal → own-coach open slots (30d) + "Fastest Available" per active coach
 ↓
EITHER: pick listed slot → Confirm → rescheduleSessionAction
 OR: "Book This" on Fastest Available → rescheduleSessionAction / rescheduleSessionToSubstituteAction
 OR: specific date/time → Check This Time → checkRescheduleTimeAction
       → free with own coach → Confirm This Time → rescheduleSessionAction
       → not free → pick substitute → Assign & Reschedule → rescheduleSessionToSubstituteAction
 ↓
scheduled_start updated, was_rescheduled=true, original_scheduled_start preserved
 ↓
My Sessions list + reschedule-count updated in place
```

### 7d. Cancellation
```
My Sessions → Cancel (only if outside cutoff)
 ↓
ConfirmDialog → Cancel Session → cancelSessionAction → bookings.status='cancelled'
 ↓
If booking was from a recurring slot: next occurrence auto-regenerated
 ↓
Session moves Upcoming → Cancelled tab (local state patch)
```

### 7e. Coach change
```
My Coach → Request Coach Change → reason (+ optional ratings) → Submit
 ↓
requestCoachChangeAction → status "pending" → [Admin reviews]
 ↓ (admin approves, no coach picked)
My Coach shows "pick your new schedule" → select days+time → Find Available Coach
 ↓
findCoachChangeOptionsAction → shows match → Confirm {coachName}
 ↓
completeCoachChangeAction → coach changed, schedule updated
```
(Admin can alternatively pick the new coach directly during approval — see §7h.)

### 7f. Live session join (client)
```
Dashboard NextSessionCard → soonest upcoming booking
 ↓
Join link lazily fetched: tryEnsureZoomJoinUrl → ensureZoomMeetingForBooking (creates Zoom meeting on first request)
 ↓
Join button enabled only when: within join window AND zoomJoinUrl exists AND measurements not stale
 ↓
Click Join → opens Zoom URL in new tab (external)
```

### 7g. Coach in-session workflow
```
Coach Login → Dashboard
 ↓
[If pending tasks] soft nudge modal
 ↓
Today's Tasks widget → "Join" → Zoom opens + coach_joined_at set
 ↓
[Session happens externally in Zoom]
 ↓
Session ends → Present/Late/Absent buttons unlock
 ↓
   ├─ Absent (+optional remark) → booking closed ('missed'), no notes phase
   └─ Present/Late → Session Notes form unlocks → coach fills + submits → booking closed ('completed')
```

### 7h. Coach leave → automatic shadow coverage
```
Coach: Request Leave (full/partial) → requestLeaveAction (≥24h notice enforced)
 ↓
coach_leave row created (status='pending')
 ↓
[Admin] Approve → resolveLeaveAction
 ↓
Notify coach; find every active client whose recurring pattern falls in leave window
 ↓
Match shadow coaches per occurrence → assign_shadow_coach RPC per group
 ↓
   ├─ Covered → summary shown, client+shadow coach notified
   └─ Uncovered → flagged for manual admin assignment (/admin/shadow-coverage)
 ↓
(if leave ≥14 days) advisory nudge: consider permanent coach change
```

### 7i. Escalation (concern) lifecycle
```
Client raises concern (My Concerns) OR Admin logs on client's behalf
 ↓
escalations row created, status='open' (+ notify coach if linked)
 ↓
Admin → Escalations list → Active tab → click → Escalation Detail
 ↓
GATE: Confirm I've Called the Client (hard server-side requirement for everything below)
 ↓
Save Assessment (issue type/fault/summary) [repeatable]
 ↓
Add Progress Notes [repeatable, client-visible]
 ↓
Mark In Progress (optional)
 ↓
Mark Resolved & Close → resolution_notes set, timeline event logged
```

### 7j. Purchase → activation → renewal
```
Plans page → Purchase Plan → Razorpay Checkout → server-verified payment
 ↓
subscriptions row created, status='awaiting_activation'
 ↓
Activate Plan (pick start date, ≥tomorrow, one-time) → status='active'
 ↓
[If renewal] any prior 'active' subscription flips to 'inactive'
 ↓
checkRenewalStage: renewal_checkin (fresh measurement) → renewal_scheduling (keep or change pattern)
```

---

## 8. Feature → Operation Mapping

### 8a. Confirm Booking (client, ad-hoc)
```
USER ACTION: client clicks "Confirm Booking"
    ↓
UI COMPONENT: BookSessionClient (3-step wizard, final step)
    ↓
FRONTEND FUNCTION: confirmBookingAction({slotStart, durationMinutes, sessionType})
    ↓
SERVER ACTION: client-portal.actions.ts (or schedule.actions.ts) → confirmBookingAction
    ↓
SERVICE: bookings.service.ts::createBooking → holdSlot() then confirmHold()
    ↓
BUSINESS LOGIC: re-check measurement staleness server-side; resolve client's assigned coach;
                if sessionType='regular' require an active subscription
    ↓
DATABASE OPERATION: RPC create_temporary_booking() → INSERT temporary_bookings (held);
                     RPC confirm_booking() → INSERT bookings (status='upcoming'),
                     UPDATE temporary_bookings.status='confirmed'
    ↓
RESPONSE: ActionResult<{bookingId}>
    ↓
FRONTEND STATE UPDATE: wizard shows success screen
    ↓
USER SEES RESULT: booking appears in "Upcoming Sessions"
```

### 8b. Mark Attendance → Present (coach)
```
USER ACTION: coach clicks "Present" (Session Detail or TaskRow)
    ↓
UI COMPONENT: CoachSessionClient.markPresent() / TaskRow.mark("present")
    ↓
FRONTEND FUNCTION: markAttendanceAction(bookingId, "present")
    ↓
SERVER ACTION: coach-portal.actions.ts::markAttendanceAction
    ↓
SERVICE: bookings.service.ts::markAttendance(token, bookingId, "present")
    ↓
BUSINESS LOGIC: assert now >= scheduled_start+duration; assert (not today) OR coach_joined_at set
    ↓
DATABASE OPERATION: UPSERT attendance(status='present', checked_in_at=scheduled_start, checked_out_at=null);
                     UPDATE bookings SET attendance_overdue=false;
                     INSERT timeline event 'attendance_marked_present'
    ↓
RESPONSE: ActionResult<null> success
    ↓
FRONTEND STATE UPDATE: setAttendance("present") — Session Notes form unlocks
    ↓
USER SEES RESULT: Session Notes form appears
```

### 8c. Submit Session Notes → Complete (coach)
```
USER ACTION: coach fills notes, clicks "Mark Completed"
    ↓
FRONTEND FUNCTION: submitSessionNotesAction(bookingId, {summary, exercisesPerformed, performance, improvements[], homework, additionalRemarks})
    ↓
SERVICE: bookings.service.ts::submitSessionNotes
    ↓
BUSINESS LOGIC: assert booking.status==='upcoming'; assert attendance IN ('present','late')
    ↓
DATABASE OPERATION: INSERT workout_notes; UPDATE bookings SET status='completed';
                     INSERT timeline 'coach_notes_uploaded' then 'session_completed'
    ↓
RESPONSE: success
    ↓
FRONTEND STATE UPDATE: form becomes read-only, "Back to Dashboard" shown
    ↓
USER SEES RESULT: "Session Completed" header
```

### 8d. Mark Absent (coach)
```
USER ACTION: coach clicks "Absent" (+ optional remark)
    ↓
FRONTEND FUNCTION: markAttendanceAction(id, "absent", remark)
    ↓
SERVICE: markAttendance() — same time/join gates as Present
    ↓
DATABASE: UPSERT attendance(status='absent', checked_out_at=now);
          UPDATE bookings SET status='missed', no_show_party='client';
          INSERT timeline 'session_missed' (description=remark)
    ↓
RESPONSE: success
    ↓
USER SEES RESULT: "Client Absent" screen, "This session is closed. No notes required." (notes phase skipped)
```

### 8e. Reschedule (client, own coach)
```
USER ACTION: client picks a new slot in RescheduleModal
    ↓
FRONTEND FUNCTION: rescheduleSessionAction(bookingId, newSlotStart)
    ↓
SERVICE: bookings.service.ts::rescheduleBooking
    ↓
BUSINESS LOGIC: status must be 'upcoming'; cutoff (1h) unless admin; forward window ≤30 days;
                weekly cap ≤2 reschedules; no double-booking same IST date
    ↓
RPC reschedule_booking(booking_id, new_start, new_duration, enforce_cutoff, new_coach_id=null)
    ↓
DATABASE: re-validates working hours + conflict; UPDATE bookings SET scheduled_start=new_start,
          was_rescheduled=true, original_scheduled_start=coalesce(original, old_start)
    ↓
SIDE EFFECTS: cleanupZoomMeeting() (deletes old meeting); logTimelineEvent('session_rescheduled');
              notify coach (session_rescheduled_by_client) + notifyAdmins
    ↓
RESPONSE: success
    ↓
USER SEES RESULT: My Sessions list updates in place, reschedule counter increments
```

### 8f. Cancel Session (client)
```
USER ACTION: client confirms cancel in ConfirmDialog
    ↓
FRONTEND FUNCTION: cancelSessionAction(bookingId)
    ↓
SERVICE: bookings.service.ts::cancelBooking
    ↓
BUSINESS LOGIC: status must be 'upcoming'; cutoff (12h) unless admin
    ↓
RPC cancel_booking(booking_id, cancelled_by, reason, enforce_cutoff)
    ↓
DATABASE: UPDATE bookings SET status='cancelled', cancelled_by, cancel_reason;
          IF recurring_slot_id set → RPC generate_bookings_from_recurring_slot(slot_id, 1) [regenerate next occurrence]
    ↓
SIDE EFFECTS: cleanupZoomMeeting(); logTimelineEvent('session_cancelled');
              notify coach (session_cancelled_by_client) + notifyAdmins
    ↓
RESPONSE: success
    ↓
USER SEES RESULT: session moves Upcoming → Cancelled tab
```

### 8g. Purchase Plan (Razorpay)
```
USER ACTION: client clicks "Purchase Plan"
    ↓
FRONTEND FUNCTION: createPackagePurchaseOrderAction(packageId)
    ↓
SERVICE: payments.service.ts::createPackagePurchaseOrder
    ↓
VALIDATION: client must not already have active/awaiting_activation subscription
    ↓
createRazorpayOrder(price, receipt) → Razorpay API; INSERT payments row (status='created')
    ↓
RESPONSE: {orderId, amountPaise, currency, keyId} → Razorpay Checkout.js opens (client SDK)
    ↓
USER ACTION: completes payment in Razorpay UI
    ↓
FRONTEND FUNCTION: verifyPaymentAction(orderId, paymentId, signature)
    ↓
SERVICE: payments.service.ts::verifyAndFulfillPayment
    ↓
BACKEND: verifyRazorpaySignature() [HMAC-SHA256, crypto.timingSafeEqual] — ONLY trusted proof of payment
    ↓
ON SUCCESS: purchaseMyPlan(packageId) → INSERT subscriptions (status='awaiting_activation')
    ↓
DATABASE: UPDATE payments SET status='paid', paid_at, subscription_id
    ↓
ON FULFILLMENT FAILURE: UPDATE payments SET status='paid_unfulfilled' (money safe, flagged for support — never silently dropped)
    ↓
USER SEES RESULT: "Congratulations!" modal → dashboard (stage becomes awaiting_activation)
```

### 8h. Escalation resolution (admin, gated)
```
USER ACTION: admin clicks "Confirm I've Called the Client"
    ↓
FRONTEND FUNCTION: confirmCalledClientAction(escalationId)
    ↓
SERVICE: escalations.service.ts::confirmCalledClient
    ↓
DATABASE: UPDATE escalations SET called_client_at=now(), called_by=admin_id
    ↓
[Gate lifts] — every subsequent mutation (Save Assessment, Add Note, Mark In Progress, Resolve)
              re-checks requireCalledClient() server-side, throwing if not yet called — this is
              a hard backend rule, replicated regardless of what the mobile client does
    ↓
USER ACTION: admin clicks "Mark Resolved & Close"
    ↓
FRONTEND FUNCTION: resolveEscalationAction(id, resolutionNotes?)
    ↓
DATABASE: UPDATE escalations SET status='resolved', resolved_by, resolved_at, resolution_notes;
          logTimelineEvent(client_id, 'escalation_resolved', ...)
    ↓
USER SEES RESULT: green "Resolved" summary card, all editing controls disappear
```

---

## 9. Feature Dependency Map

```
Authentication (Supabase Auth + profiles.role)
      ↓
Role-based Portal Access (middleware + requireRole + RLS)
      ↓
Profile (profiles + coach_profiles/client_profiles)
      ↓
   ┌──────────────────────────┴──────────────────────────┐
   ▼ (coach)                                              ▼ (client)
Coach Availability                                  Client Onboarding (one-time)
(coach_availability, admin-set)                            ↓
   ↓                                                Subscription (Purchase → Activate)
Coach Leave ──→ Admin Approval ──→ Shadow Coach            ↓
   Assignment ◀──────────────────────────────────┘  Recurring Schedule Setup
   ↓                                                        ↓
Client Assignment (admin-set coach_id) ◀───────────────────┘
      ↓
Bookings (created via recurring generation OR ad-hoc hold→confirm)
      ↓
   ┌──────────────────────┬─────────────────────────┐
   ▼                       ▼                          ▼
Reschedule              Cancellation              Live Session (Zoom)
(cutoff/window/cap        (cutoff, auto-              ↓
 rules)                    regenerate)            Coach Join → Attendance
                                                        ↓
                                              ┌─────────┴─────────┐
                                              ▼                   ▼
                                         Absent→Missed      Present/Late→Notes→Completed
                                                                   ↓
                                                        Client Rating/Feedback
                                                                   ↓
                                          Session History / Coach Performance / Client Timeline
                                                                   ↓
                                                          Renewal Opportunities

Escalations (raised by Client) ──→ visible read-only to Coach ──→ resolved by Admin only (gated workflow)
Coach Change Requests (raised by Client) ──→ resolved by Admin ──→ triggers Chat conversation close/reopen
Chat (auto-created on coach assignment) ──→ closes on coach reassignment, reopens with new coach
Notifications ←── fed by: bookings, leave, escalations, coach changes, chat messages, overdue sweeps
Payments (Razorpay) ──→ gates Subscription creation ──→ gates Recurring Schedule / Booking
```

**Build-order implication (see §28 for the full phased roadmap):** Auth → Profiles → Coach Availability data model → Client Onboarding/Subscription → Recurring Schedule/Booking engine → Live Session (Zoom) → Attendance/Notes → Reschedule/Cancel → Escalations/Coach-Change → Chat/Notifications → Admin oversight screens → Reports.

---

## 10. Button/Action Mapping

The most important screens are documented button-by-button below (condensed from the full per-portal analysis). Every button not listed here follows the same `ActionResult` success/failure pattern described in §4.

### Screen: Book a Session (client)
| Button | Action | API (Server Action) | Backend/DB | Result | Next State |
|---|---|---|---|---|---|
| Confirm Booking | commit booking | `confirmBookingAction` | measurement/coach/subscription checks; INSERT bookings | booking created | success screen |

### Screen: My Sessions (client)
| Button | Action | API | Backend/DB | Result | Next State |
|---|---|---|---|---|---|
| Reschedule (enabled if outside 1h cutoff) | open modal | `getRescheduleOptionsAction` | reads booking, slots, weekly count | modal shows options | — |
| Cancel (enabled if outside 12h cutoff) | confirm dialog | `cancelSessionAction` | `bookings.status='cancelled'` | cancelled | tab change |
| Rate Session (completed, unrated) | open modal | `rateSessionAction` | `bookings.quality_rating/trainer_rating/rating_note` | rating saved | modal closes |

### Screen: My Coach (client)
| Button | Action | API | Backend/DB | Result | Next State |
|---|---|---|---|---|---|
| Request Coach Change | submit reason (+ratings) | `requestCoachChangeAction` | INSERT coach_change_requests (pending) | request created | modal closes |
| Find Available Coach | search match | `findCoachChangeOptionsAction` | matches new coach | shows match | — |
| Confirm {coachName} | finalize | `completeCoachChangeAction` | updates coach + schedule | coach changed | refresh |

### Screen: Session Detail (coach) — CORE WORKFLOW
| Button | Action | API | Backend/DB | Result | Next State |
|---|---|---|---|---|---|
| Join Zoom Meeting | mark joined, open Zoom | `markSessionJoinedAction` | `coach_joined_at=now()` (idempotent) | joined | "Reopen Zoom" available |
| Present | mark attendance | `markAttendanceAction(id,"present")` | UPSERT attendance; clears overdue flag | present | notes form unlocks |
| Late | mark attendance | `markAttendanceAction(id,"late")` | same, status='late' | late | notes form unlocks |
| Absent | mark + close | `markAttendanceAction(id,"absent",remark)` | attendance=absent; booking.status='missed' | closed | terminal, no notes |
| Mark Completed | submit notes | `submitSessionNotesAction` | INSERT workout_notes; booking.status='completed' | completed | terminal |

### Screen: Coach Availability
| Button | Action | API | Backend/DB | Result |
|---|---|---|---|---|
| Submit Request (leave) | create leave request | `requestLeaveAction` | validates 24h notice; INSERT coach_leave (pending) | pending row appended |

### Screen: Coach Detail (admin)
| Button | Action | API | Backend/DB | Result |
|---|---|---|---|---|
| Save Changes | update profile | `updateCoachAction` | UPDATE coach profile | card updates |
| Save Skills | update skills | `updateCoachSkillsAction` | UPDATE coach.skills | saved |
| Override/Block Slots | block a date | `blockCoachSlotAction` | INSERT one-day leave override | unavailable that date |
| Reassign Clients | bulk move all clients | `reassignCoachClientsAction` | per-client `reassignClientCoach` loop | count + failures shown |
| Disable Coach | deactivate | `disableCoachAction` | `coach.status='inactive'` | no new bookings (existing NOT auto-moved) |
| Save Working Hours | set weekly template | `setCoachAvailabilityAction` | replaces availability window rows | used by slot engine going forward |

### Screen: Client Detail (admin)
| Button | Action | API | Backend/DB | Result |
|---|---|---|---|---|
| Adjust Package/Sessions | change session total | `adjustClientSessionsAction` | `subscription.sessions_total` UPDATE | updates everywhere |
| Grant Pause-Days | adjust allowance | `adjustPauseDaysAction` | `pause_days_allowed` UPDATE | — |
| Transfer to Another Coach | reassign (single) | `transferClientCoachAction` (± `force`) | `reassignClientCoach` | coach card updates |
| Assign Shadow Coach | open modal → Find Coverage → Confirm | `previewShadowAssignmentPlanAction`, `confirmShadowAssignmentPlanAction` | INSERT shadow_coach_assignments per group | coverage assigned |
| Pause Subscription | pause | `pauseClientSubscriptionAction` | `subscription.status='paused'` | badge updates |
| Log Measurement | add progress entry | `logMeasurementAction` | INSERT progress_logs | chart updates |
| Log Escalation | create concern on behalf of client | `logEscalationAction` | INSERT escalations | appears on timeline |
| Log Refund Request | audit-only, no real payment | `logRefundRequestAction` | INSERT audit/refund entry | **no money moves** |

### Screen: Escalation Detail (admin) — GATED WORKFLOW
| Button | Action | API | Backend/DB | Result |
|---|---|---|---|---|
| Confirm I've Called the Client | unlock form | `confirmCalledClientAction` | `called_client_at=now()` | gate lifts |
| Save Assessment | classify | `updateEscalationDetailsAction` | requires call confirmed | saved |
| Add (note) | client-visible progress note | `addEscalationNoteAction` | requires call confirmed | INSERT escalation_notes |
| Mark In Progress | advance status | `markEscalationInProgressAction` | requires call confirmed | status updates |
| Mark Resolved & Close | close case | `resolveEscalationAction` | requires call confirmed | terminal, timeline logged |

### Screen: Leave Requests (admin)
| Button | Action | API | Backend/DB | Result |
|---|---|---|---|---|
| Approve | approve + auto-shadow-assign | `resolveLeaveAction(id,"approved")` | UPDATE coach_leave; auto shadow assignment cascade | summary shown |
| Reject | reject | `resolveLeaveAction(id,"rejected")` | UPDATE coach_leave | row removed from pending |

### Screen: Settings (admin)
| Button | Action | API | Backend/DB | Result |
|---|---|---|---|---|
| Save Settings | persist 4 numeric rules | `updateSettingAction` ×4 | UPDATE system_settings | governs cutoffs platform-wide |
| Delete (package, confirm) | soft-delete | `deletePackageAction` | `is_active=false` (never a real DELETE) | disappears from active list |

---

## 11. API Documentation

**There is no REST/GraphQL API in the existing app.** The functional equivalent is the set of **Next.js Server Actions**, each a typed async function callable only from within the Next.js app. For the mobile app, treat each Server Action below as the contract to reimplement (either by exposing it over HTTP from a new thin backend, or by reimplementing its logic directly against Supabase — see §27).

Every action: authenticates via bearer/session token → `requireRole([...])` → calls a service function → returns `ActionResult<T>`.

### Action files (33 total) and their primary responsibility

| File | Portal | Responsibility |
|---|---|---|
| `client-portal.actions.ts` | Client | Dashboard, booking options |
| `client-journey.actions.ts` | Client | Journey stage state machine |
| `client-coach.actions.ts` | Client | My Coach view |
| `client-coach-change.actions.ts` | Client | Coach change request/completion |
| `client-concerns.actions.ts` | Client | Raise/list concerns |
| `client-notifications.actions.ts` | Client (+ shared) | List/mark notifications |
| `client-profile.actions.ts` | Client | Profile edit |
| `client-progress.actions.ts` | Client | Progress log CRUD |
| `schedule.actions.ts` | Client (+ shared) | Recurring schedule + booking + reschedule |
| `payments.actions.ts` | Client | Razorpay order creation + verification |
| `renewals.actions.ts` | Client, Coach, Admin | Renewal opportunities + check-in |
| `chat.actions.ts` | Client, Coach, Admin | Messaging |
| `coach-portal.actions.ts` | Coach | Dashboard, tasks, session workflow |
| `coach-profile.actions.ts` | Coach | Profile edit, skills |
| `admin-audit.actions.ts` | Admin | Activity log |
| `admin-availability.actions.ts` | Admin | Availability check, working hours |
| `admin-clients.actions.ts` | Admin | Client list/detail/search |
| `admin-coach.actions.ts` | Admin | Coach CRUD |
| `admin-coach-change.actions.ts` | Admin | Coach-change resolution |
| `admin-coach-performance.actions.ts` | Admin | Coach performance panel |
| `admin-dashboard.actions.ts` | Admin | KPI overview |
| `admin-escalations.actions.ts` | Admin | Escalation resolution workflow |
| `admin-leave.actions.ts` | Admin | Leave approval |
| `admin-progress.actions.ts` | Admin | Log measurement on client's behalf |
| `admin-reports.actions.ts` | Admin | CSV/PDF report generation |
| `admin-sales.actions.ts` | Admin | Sales ledger |
| `admin-scheduling.actions.ts` | Admin | Scheduling oversight |
| `admin-session-detail.actions.ts` | Admin | Session forensics view |
| `admin-sessions.actions.ts` | Admin | Sessions master list + inline reschedule/cancel |
| `admin-settings.actions.ts` | Admin | Platform settings + packages |
| `admin-shadow-coach.actions.ts` | Admin | Shadow coverage queue + assignment |
| `admin-timeline.actions.ts` | Admin | Client timeline read |
| `action-result.ts` | — | Shared `ActionResult<T>` type + `isFailure()` guard |

### Service files (26 total) — the actual business logic

| File | Responsibility |
|---|---|
| `_auth.ts` | `getCallerContext()`, `requireRole()` |
| `adminDashboard.service.ts` | KPI aggregation |
| `audit.service.ts` | `writeAuditLog`, `listAuditLogs`, `logRefundRequest` |
| `availability.service.ts` | `setCoachAvailability`, `requestLeave`, `resolveLeave`, `createOneDayLeave` |
| `bookings.service.ts` | `createBooking`, `cancelBooking`, `rescheduleBooking`, `markAttendance`, `submitSessionNotes`, `rateBooking`, `ensureZoomMeetingForBooking`, sweeps |
| `chat.service.ts` | Conversation lifecycle, messaging, read receipts |
| `clients.service.ts` | Client CRUD, `reassignClientCoach`, search |
| `coachChange.service.ts` | Coach-change matching + completion, shadow assignment |
| `coaches.service.ts` | Coach CRUD |
| `coachPerformance.service.ts` | `computePerformance()` |
| `demoBooking.service.ts` | `findDemoSlots`, `confirmDemoBooking` |
| `escalations.service.ts` | Full escalation resolution workflow |
| `notifications.service.ts` | `createFromTemplate`, `notifyAdmins`, `listMyNotifications`, `markNotificationRead` |
| `onboarding.service.ts` | Onboarding submission |
| `packages.service.ts` | Package tier CRUD |
| `payments.service.ts` | Razorpay order + fulfillment |
| `planPurchase.service.ts` | `purchaseMyPlan`, `activateMyPlan`, `checkRenewalStage` |
| `profiles.service.ts` | Profile read/update |
| `progressLogs.service.ts` | Measurement log CRUD, staleness check |
| `razorpay.service.ts` | Order creation + signature verification |
| `renewals.service.ts` | Renewal opportunity derivation |
| `sales.service.ts` | Sales view read |
| `scheduling.service.ts` | **Core engine**: slot generation, IST conversions, pattern matching, shadow-coach matching |
| `settings.service.ts` | `system_settings` read/write |
| `subscriptions.service.ts` | Subscription lifecycle (pause/resume/adjust) |
| `timeline.service.ts` | `logTimelineEvent`, `listClientTimeline` |
| `zoom.service.ts` | Zoom Server-to-Server OAuth meeting create/delete |

### Underlying "true" API surface: Postgres RPC functions
Because the scheduling engine's hard guarantees live in the database (not just TypeScript), a mobile-native reimplementation **must** call these same Postgres RPC functions (via `supabase.rpc(...)`) rather than reinvent conflict-checking logic client-side:

`create_temporary_booking`, `confirm_booking`, `cancel_booking`, `reschedule_booking`, `generate_bookings_from_recurring_slot`, `assign_shadow_coach`, `reassign_shadow_coverage`, `has_scheduling_conflict`, `is_slot_within_working_hours`, `expire_temporary_bookings`, `mark_missed_bookings`, `flag_overdue_attendance`, `flag_overdue_notes`, `append_coach_skill`, `handle_new_user` (trigger, not directly called), `get_setting_int`, `is_admin`, `my_role`, `my_coach_id`, `my_client_id`, `coach_client_linked`, `set_updated_at` (trigger).

---

## 12. Database Mapping

Full schema derived from all 49 migrations (`supabase/migrations/0001–0049.sql`). **Treat this SQL as the absolute source of truth** — `src/lib/types.ts` is stale prototype scaffolding and contradicts the real schema in places (e.g., it has one combined `rating` field where the DB has split `quality_rating`/`trainer_rating`).

### Core tables (27 total)

| Table | Purpose | Key fields |
|---|---|---|
| `profiles` | Base identity, 1:1 with `auth.users` | `id (PK/FK auth.users)`, `role`, `full_name`, `phone`, `photo_url`, `account_status`, `emergency_contact` |
| `coach_profiles` | Coach extension | `profile_id (FK unique)`, `specialization`, `years_experience`, `bio`, `certifications[]`, `languages[]`, `rating`, `status`, `employee_code (unique)`, `max_capacity`, `gender`, `skills[]` |
| `client_profiles` | Client extension | `profile_id (FK unique)`, `medical_notes`, `equipment[]`, `goals[]`, `status`, `client_code (unique, e.g. "CL1025")` |
| `package_tiers` | Purchasable plan catalog | `name`, `category`, `sessions_count`, `price`, `default_pause_days`, `is_active` |
| `subscriptions` | Client's plan purchase | `client_id (FK)`, `package_id (FK)`, `sessions_total`, `status`, `activated_at`, `pause_days_allowed` |
| `coach_availability` | Weekly recurring template | `coach_id (FK)`, `day_of_week`, `start_time`, `end_time`, `is_active` |
| `coach_shifts` | Date-specific override | `coach_id (FK)`, `shift_date`, `start_time`, `end_time`, `source` |
| `coach_leave` | Leave requests | `coach_id (FK)`, `starts_on`, `ends_on`, `status`, `leave_type`, `partial_start_time`, `partial_end_time` |
| `recurring_slots` | Client's weekly pattern | `client_id`, `coach_id`, `subscription_id`, `day_of_week`, `start_time`, `duration_minutes`, `status` |
| `temporary_bookings` | Short-lived slot hold | `client_id`, `coach_id`, `slot_start`, `expires_at`, `status` |
| `assessment_sessions` | Prospect demo (pre-auth) | `prospect_name/email/phone`, `assigned_coach_id`, `scheduled_start`, `status`, `converted_client_id` |
| `bookings` | **Central entity** | `client_id`, `coach_id`, `subscription_id`, `recurring_slot_id`, `assessment_session_id`, `scheduled_start`, `duration_minutes`, `session_type`, `status`, `cancelled_by`, `cancel_reason`, `escalation_id`, `no_show_party`, `was_rescheduled`, `original_scheduled_start`, `attendance_overdue`, `notes_overdue`, `amount_paid`, `quality_rating`, `trainer_rating`, `rating_note`, `zoom_meeting_id`, `zoom_join_url`, `zoom_start_url`, `coach_joined_at` |
| `shadow_coach_assignments` | Temp coverage | `client_id`, `primary_coach_id`, `shadow_coach_id`, `starts_on`, `ends_on`, `status` |
| `coach_change_requests` | Coach switch requests | `client_id`, `current_coach_id`, `new_coach_id`, `reason`, `status`, `resolved_by`, `overall_experience`, `coach_rating` |
| `attendance` | 1:1 with bookings | `booking_id (unique FK)`, `status`, `checked_in_at`, `checked_out_at`, `client/coach_joined_at/left_at` |
| `workout_notes` | 1:1 with bookings | `booking_id (unique FK)`, `notes`, `homework`, `exercises_performed`, `performance_rating`, `improvements[]`, `additional_remarks` |
| `progress_logs` | Body measurements | `client_id`, `logged_at`, `weight`, `body_fat_pct`, `muscle_pct`, `waist/chest/hip/arms/thigh`, `streak_count`, `photo_url` |
| `notification_templates` | Notification copy templates | `key (unique)`, `type`, `title_template`, `body_template` |
| `notifications` | In-app notification rows | `user_id`, `template_key`, `type`, `title`, `message`, `related_entity_type/id`, `read`, `channels (jsonb, unused)` |
| `audit_logs` | Generic before/after change log | `actor_id`, `action`, `entity_type`, `entity_id`, `old_data/new_data (jsonb)` — DB-trigger-written |
| `system_settings` | Global config KV | `key (PK)`, `value (jsonb)` — see §13 for all keys |
| `client_onboarding` | One-time intake | `client_id (unique FK)`, `age`, `gender`, `height_cm`, `weight_kg`, `medical_conditions`, `fitness_goal` |
| `escalations` | Support tickets | `client_id`, `coach_id`, `raised_by`, `reason`, `description`, `status`, `category`, `admin_issue_type`, `fault`, `admin_summary`, `called_client_at`, `called_by`, `resolved_by/at`, `resolution_notes` |
| `escalation_notes` | Append-only progress log | `escalation_id (FK)`, `author_id`, `note` |
| `client_timeline_events` | Permanent client journey log | `client_id`, `event_type`, `title`, `description`, `metadata (jsonb)`, `actor_id` |
| `payments` | Razorpay financial ledger | `client_id`, `purpose`, `package_id`, `demo_coach_id`, `amount`, `currency`, `razorpay_order_id (unique)`, `razorpay_payment_id/signature`, `status`, `subscription_id`, `booking_id` |
| `conversations` | Client↔coach chat threads | `client_id`, `coach_id`, `status ('active'/'closed')` — unique: one active per client |
| `messages` | Chat messages | `conversation_id`, `sender_role`, `sender_profile_id`, `body`, `attachment_url`, `read_at` |

### Entity Relationship Map
```
auth.users (Supabase Auth)
    │ (trigger handle_new_user)
    ▼
profiles (role: admin|coach|client)
    │
    ├──(coach)──▶ coach_profiles ──┬─▶ coach_availability
    │                              ├─▶ coach_shifts
    │                              └─▶ coach_leave
    │
    └──(client)─▶ client_profiles ─┬─▶ client_onboarding
                                    ├─▶ subscriptions ──▶ package_tiers
                                    │        └─▶ recurring_slots
                                    ├─▶ payments (Razorpay) ─┬─▶ subscriptions
                                    │                         └─▶ bookings
                                    ├─▶ temporary_bookings
                                    ├─▶ bookings ◀── coach_profiles
                                    │      ├─▶ attendance (1:1)
                                    │      └─▶ workout_notes (1:1)
                                    ├─▶ progress_logs
                                    ├─▶ escalations ──▶ escalation_notes
                                    ├─▶ coach_change_requests
                                    ├─▶ shadow_coach_assignments
                                    ├─▶ client_timeline_events
                                    └─▶ conversations ──▶ messages

assessment_sessions (prospect, no account) ──(on conversion)──▶ client_profiles
notifications ──▶ profiles, notification_templates
audit_logs ──▶ profiles (system-written)
system_settings (global config, no FK)
```

### Key database functions
See §11 for the full RPC list. The two most critical for correctness:
- **`has_scheduling_conflict()`** — checks overlapping `upcoming` bookings + `held` temporary holds for a coach; also the de facto sweep chokepoint (calls `expire_temporary_bookings()` + `mark_missed_bookings()` every invocation).
- **`bookings_no_coach_overlap`** — a **hard GiST exclusion constraint** on the `bookings` table itself: a coach can never have two overlapping `upcoming` rows, enforced by Postgres regardless of application bugs. **The mobile app's backend must never bypass this by writing directly around the RPC functions.**

### RLS summary
`is_admin()` gets full access everywhere. Key non-admin patterns: any authenticated user can read `coach_availability`/`coach_shifts`/`package_tiers`/booking *existence* (needed for the booking flow to check global conflicts) — but session *content* (notes, attendance, medical data) stays strictly scoped to admin/owning coach/owning client. `payments` and `client_timeline_events` have **no client/coach write policy at all** — writes only via `supabaseAdmin` after server-side validation. Full per-table policy detail is in the source db-schema analysis; replicate the same RLS policies unchanged in the mobile app's backend (same Supabase project).

### Storage buckets
| Bucket | Public? | Access |
|---|---|---|
| `avatars` | public read | Owner (path segment 1 = `auth.uid()`) writes |
| `progress-photos` | private | Owner + linked coach (read) + admin |
| `coach-certifications` | private | Owner (coach) + admin |
| `chat-attachments` | public read | Any conversation participant, under that conversation's folder |

---

## 13. Business Logic

All rules below are enforced **server-side** (RPC function or service-layer check), not merely UI-disabled — the mobile app must replicate the same validation, not just copy the disabled-button behavior.

1. **No same-day booking (any type).** Earliest bookable date is always tomorrow, IST.
2. **No double-booking a coach.** `has_scheduling_conflict()` + hard DB exclusion constraint.
3. **Coach must be within working hours.** `is_slot_within_working_hours()`: leave → shift override → weekly template, in that priority order.
4. **Temporary hold expiry.** Hold must be `status='held'` and unexpired at confirm time (default 10-minute hold, `temporary_booking_hold_minutes` setting).
5. **Cancellation cutoff.** ≥12 hours before `scheduled_start` (`cancellation_cutoff_hours` setting), unless admin.
6. **Reschedule cutoff.** ≥1 hour before `scheduled_start` (`reschedule_cutoff_hours` setting), unless admin. **Different cutoff value than cancellation — do not conflate.**
7. **Reschedule forward window (client only).** New time within next 30 days (`RESCHEDULE_WINDOW_DAYS`), not in the past.
8. **Reschedule weekly cap (client only).** Max 2 reschedules per Monday-start calendar week (`MAX_RESCHEDULES_PER_WEEK`).
9. **No two sessions same day (client reschedule only).** Target IST date must not already have another `upcoming` booking.
10. **Cancelling a recurring occurrence regenerates the next one.** Preserves ongoing weekly capacity.
11. **Leave requires 24h notice.** No admin bypass — undocumented absences go through manual shadow-coach assignment instead.
12. **Partial-day leave is single-day only.** `starts_on = ends_on`, both partial times required, end > start.
13. **Attendance can only be marked after session end**, and (for today's sessions only) only after the coach joined. Backlog (prior-day) bookings skip the join requirement.
14. **Notes require attendance = present/late first.**
15. **Rating: once per week, only on completed sessions.**
16. **One active/awaiting plan at a time**, with a renewal exception when `sessions_remaining <= 5` (`SESSIONS_LOW_THRESHOLD`).
17. **Plan activation: no same-day start, one-time only** (`activated_at` locked once set).
18. **Recurring-pattern setup excludes Sunday, caps custom days at 2–5.**
19. **Recurring collision check against other clients' patterns is leave-agnostic** — leave is handled per-occurrence at generation time, not allowed to block permanent pattern setup.
20. **Zoom meeting lazily created, best-effort deleted** — creation only when someone needs to join; deletion failures never fail the parent operation (cancel/reschedule still succeed).
21. **Coach rating recomputed live** from all non-null `trainer_rating` values on their bookings after every new rating — not a stored/incrementally-maintained field.
22. **Escalation resolution gate** — no field on an escalation (issue type, fault, summary, notes, status) can be edited until `called_client_at` is set. Enforced in `escalations.service.ts::requireCalledClient()`, checked on every mutating call.
23. **Package deletion is soft-delete only** (`is_active=false`) — historical subscriptions referencing it remain valid.
24. **Coach reassignment failure is per-client, not batch-blocking** — bulk "Reassign Clients" tries each client independently; a target coach lacking availability on one client's day doesn't block the others.
25. **Long-leave nudge** (≥14 days) is advisory only — never forces a permanent coach change.
26. **Refund requests never move money** — audit/timeline entry only; a human actions the real refund in Razorpay separately.

### system_settings keys (global, admin-editable via Settings screen)
`reschedule_cutoff_hours` (1), `cancellation_cutoff_hours` (12), `join_window_minutes` (10), `default_session_duration_minutes` (45), `assessment_session_duration_minutes` (60), `inactivity_threshold_days` (30), `temporary_booking_hold_minutes` (10), `booking_window_start_hour` (5), `booking_window_end_hour` (22). Only 4 of these are exposed on the admin Settings UI (session duration, cancellation cutoff, reschedule cutoff, inactivity threshold) — the rest are DB-level defaults not currently admin-editable through any screen.

---

## 14. Status/State Management

### `booking_status`: `upcoming` → terminal `completed | cancelled | missed`
- `upcoming`: default on creation. Only status from which cancel/reschedule/attendance/notes/join are allowed.
- `completed`: set only by `submitSessionNotes()` after attendance was present/late.
- `cancelled`: set only by `cancel_booking()` RPC.
- `missed`: set two ways — (a) silent sweep (`mark_missed_bookings()`, window elapsed with no attendance ever marked) or (b) explicit coach action (`markAttendance('absent')`, `no_show_party='client'`).

### `temporary_booking_status`: `held → confirmed | expired` (`released` exists in the enum but is never set by any function — likely dead/reserved, **OPEN QUESTION**)

### `recurring_slot_status`: `active → cancelled` (via `changeMyRecurringSchedule`) or `paused`

### `subscription` status: `awaiting_activation → active → (paused ⇄ active) → inactive` (superseded by renewal). No explicit "exhausted" status exists when `sessions_remaining` hits 0 — **OPEN QUESTION**, flagged in source.

### `payments.status`: `created → paid | failed | paid_unfulfilled`

### `attendance.status`: `present | absent | late` (no "pending" value — absence of a row IS the unmarked state)

### `coach_leave.status`: `pending → approved | rejected`

### `escalation_status`: `open → in_progress → resolved` (`in_progress` optional/skippable; `resolved` is terminal, no reopen control found)

### `coach_change_status`: `pending → approved | rejected` (terminal, no reopen)

### `coach_status`: `active | inactive | on-leave`

### `client_status` (raw DB) vs. **derived** admin-facing status
Raw DB values: `active | inactive | paused`. Admin UI computes a richer derived status (`deriveAdminClientStatus()`): `paused` if raw is paused; else `active` if an active subscription exists; else `expired` if the client has ever had a subscription but none active now; else the raw status. **"Expired" is not a stored value — compute it the same way in mobile.**

### Coach-portal-visible attendance/session state machine
```
booking.status: 'upcoming'
   │ [scheduled_start + duration reached]
   ├─ coach clicks Join → coach_joined_at set (status stays 'upcoming')
   ├─ markAttendance('present'|'late') → attendance upserted, status stays 'upcoming'
   │      └─ submitSessionNotes(...) → workout_notes inserted → status='completed' (terminal)
   └─ markAttendance('absent', remark?) → status='missed' (terminal, no notes phase)
```
`attendance_overdue`/`notes_overdue` are separate boolean flags set by sweep functions (2h post-session-end threshold per code comments) — they drive urgency UI, not the state machine itself, and clear the moment the corresponding action succeeds.

---

## 15. Booking System

### Availability data model
- **Weekly template** (`coach_availability`) — admin-managed only (coaches cannot self-edit since migration 0045).
- **Date-specific override** (`coach_shifts`) — if present for a date, fully overrides the template for that date (no merge/fallback).
- **Leave** (`coach_leave`) — full-day or partial-day (single date only), blocks the covered window.
- **Priority order** (`is_slot_within_working_hours`): leave check → shift override (if exists, authoritative) → weekly template fallback.

### Slot generation
Only whole-hour slots exist platform-wide (`hourlyGrid()`, default 05:00–21:00 via `booking_window_start_hour`/`_end_hour` settings). `getOpenSlots()` is an advisory client-facing read; the actual reservation always re-validates server-side, so a stale client view can never over-book.

### Two booking mechanisms
1. **Recurring pattern** (ongoing weekly slot): `matchRecurringPattern()` fallback ladder → `createRecurringSlots()` → `generate_bookings_from_recurring_slot()` RPC creates the first 4 real bookings.
2. **One-off hold→confirm** (ad-hoc, demo, reschedule-target): `create_temporary_booking()` RPC (10-minute hold) → `confirm_booking()` RPC (re-validates, creates the real booking). **This two-step pattern is what makes concurrent booking attempts safe** — the mobile app must replicate both RPC calls, not skip straight to inserting a booking row.

### Recurring pattern matching fallback ladder
Patterns: `mwf` (Mon/Wed/Fri), `tts` (Tue/Thu/Sat), `sixday` (Mon–Sat). Sunday is always off; custom day selections must be 2–5 days, never including Sunday. Order tried: (1) requested pattern @ requested time exact → (2) requested pattern @ any grid time → (3) same-trio 2-day pairs @ requested time → (4) same-trio pairs @ any grid time. Returns `null` if nothing fits → offer custom days or `reportScheduleUnmatchedAction` (notifies admins).

### Coach matching (first assignment / "new trainer" request)
Filters active coaches (optional gender filter), sorts by **lowest utilization first** to spread load, tests whole-pattern availability, returns first fit.

### Demo/assessment booking
`findDemoSlots()` — searches ALL active coaches (client never picks), sorted by utilization, over the hourly grid; `confirmDemoBooking()` uses the identical hold→confirm path with `sessionType:'assessment'`, `amountPaid:0`. A separate **anonymous/public entry point** `createAssessmentBooking()` exists for prospects with no account yet, writing to `assessment_sessions` (not `bookings`) — a pure lead-capture record.

---

## 16. Availability System

Covered in detail in §15. Key mobile-relevant points:
- Coaches are **read-only** on their own working hours in the app — only admins set `coach_availability`. The mobile coach app must not offer an "edit my hours" control; only a "Request Leave" control.
- Leave requires ≥24h notice, no exceptions, no admin bypass in the request flow (admin can separately force-block via `createOneDayLeave`, a distinct pre-approved insert).
- All availability computation must happen in **IST** (Asia/Kolkata) — the codebase has fixed multiple timezone bugs (migration 0026) around this; the mobile app must convert device-local time to IST explicitly for all slot displays and must never assume device timezone == business timezone.

---

## 17. Session System

### Live session (Zoom) integration
- **Provider**: Zoom, Server-to-Server OAuth, **one single business Zoom account hosts every meeting** — not per-coach OAuth. Env vars: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_HOST_EMAIL`.
- **Creation is lazy** — `ensureZoomMeetingForBooking()` only creates a meeting the first time someone needs to join (idempotent thereafter). Not created at booking time.
- Meeting settings: `type:2` (scheduled), `timezone:"Asia/Kolkata"`, `join_before_host:true`, `waiting_room:false`, `approval_type:2`, `mute_upon_entry:true`. **No recording enabled.**
- Deletion (on cancel/reschedule) is best-effort; failures are logged but never block the parent operation.

### Coach join gate
`coach_joined_at` records when the coach actually opened the session. **Real behavioral gate**: `markAttendance()` requires the session end time to have passed, AND — only if the session is **today** — `coach_joined_at` must be set first. This join requirement is explicitly skipped for backlog (prior-day) bookings.

### Client join
No explicit server-side gate beyond booking being `upcoming` and a Zoom link existing. **OPEN QUESTION**: exact client-side join-button enable/disable timing (minutes-before-start) lives in a UI component (`useJoinCountdown`) not read in full detail by this analysis — replicate a reasonable "Join in Nm" / "Live now" / "Session ended" countdown pattern (see §23 terminology).

### Post-session coach workflow (2-step, both server-enforced)
1. `markAttendance(present|absent|late, remark?)` — see §14/§8 state machine.
2. `submitSessionNotes({summary(required), exercisesPerformed, performance(single-select: excellent/good/average/needs_improvement), improvements[], homework, additionalRemarks})` — requires attendance already present/late.

### Overdue sweeps (opportunistic, no cron)
- `flag_overdue_attendance()` — flags bookings 2h+ past end with no attendance row; notifies coach.
- `flag_overdue_notes()` — flags bookings 2h+ past end with attendance present/late but no notes; notifies coach.
- `mark_missed_bookings()` — flips fully-elapsed `upcoming` bookings with no attendance at all to `missed`; runs as a side effect of nearly every scheduling DB call.

**Mobile implication**: since there is no cron, these sweeps must be triggered from somewhere. In the web app they piggyback on `has_scheduling_conflict()` calls and dashboard loads. The mobile backend (whatever form it takes — see §27) needs an equivalent opportunistic-trigger point, or a real scheduled job, to keep these flags accurate.

---

## 18. Rescheduling

Full flow and business rules are documented in §7c, §8e, §13 (rules 6–9). Key facts to re-emphasize for the mobile build:
- **Same booking row is updated in place** (not cancel+recreate) — this preserves `workout_notes`/`attendance` FK relationships. The mobile app must never implement reschedule as delete-then-insert.
- **Substitute-coach reschedule** is one-off: only this booking moves to the substitute; the client's underlying recurring pattern (`recurring_slot_id`) is left untouched, so future auto-generated occurrences keep going to the original coach.
- **Admin reschedule bypasses the cutoff** entirely (`enforceCutoff = ctx.role !== "admin"`) but still re-validates working hours + conflict.
- Old Zoom meeting is deleted (best-effort); a new one is lazily created for the new time on next join attempt.

---

## 19. Cancellation

Full flow documented in §7d, §8f, §13 (rule 5, 10). Key facts:
- **12-hour cutoff**, distinct from reschedule's 1-hour cutoff — do not conflate the two settings in the mobile implementation.
- **Slot release is automatic** — because the DB exclusion constraint only applies `where status='upcoming'`, cancelling a booking immediately frees that coach/time slot for conflict-checking purposes. No separate "release" step exists or is needed.
- **Recurring-slot cancellations self-heal**: if `recurring_slot_id` is set, the next occurrence is auto-regenerated immediately, preserving the client's ongoing weekly capacity.
- No coach notification exists for an **admin-initiated** cancellation in the code read (only client-initiated cancellations notify the coach) — **OPEN QUESTION**, flag for product decision on whether the mobile app should add this.

---

## 20. Notifications

**Critical constraint: notifications are in-app/database only.** There is no push, email, SMS, or WhatsApp dispatch anywhere in the existing codebase — this is documented as a deliberate Phase-1 boundary, not a gap to silently work around. **The mobile app REQUIRES real push notifications to be a meaningful mobile experience**, so this is the single largest net-new backend capability the new project must build (see §26).

### Existing mechanism (to be preserved/extended, not replaced)
- `notification_templates` table — ~22 template keys, `{{var}}` placeholder interpolation.
- `notifications` table — one row per user per notification, `read` boolean, polymorphic `related_entity_type`/`related_entity_id` link, unused `channels` jsonb placeholder.
- `createFromTemplate(templateKey, userId, vars)` — called as a side effect from other services after privileged mutations.
- `notifyAdmins(templateKey, vars)` — fans out to every admin profile, used when an automated flow needs human follow-up.

### Full template catalog (22 keys)
`booking_confirmed`, `booking_cancelled`, `session_reminder`, `coach_change_approved`, `shadow_coach_assigned`, `inactivity_warning`, `assessment_reminder`, `admin_alert`, `recurring_schedule_unmatched`, `session_cancelled_by_client`, `session_rescheduled_by_client`, `attendance_overdue`, `leave_approved`, `leave_rejected`, `new_client_assigned`, `client_transferred`, `escalation_raised_to_coach`, `client_progress_updated`, `admin_changed_schedule`, `shadow_assignment_for_coach`, `new_chat_message`, `notes_overdue`.

### Chat has a separate, parallel unread system
Chat messages are **not** rows in `notifications`. `new_chat_message` is a best-effort parallel notice; the source of truth for chat unread badges is `messages.read_at` and per-conversation unread counts (see below).

### Chat system detail
- **One active conversation per client** (unique partial index). A coach change **closes** the old conversation (frozen, read-only forever) and **opens** a fresh one — history is never merged or deleted.
- Realtime delivery via Supabase Realtime (`postgres_changes` on `messages`).
- Attachments: images only, uploaded to `chat-attachments` storage bucket, public read.
- Read receipts: WhatsApp-style single-check (sent, unread) → double-check (read), driven by `read_at` timestamp, updated live via Realtime `UPDATE` events.
- Coach inbox categorization: `active | old | expired | pause`, derived from conversation status + the client's latest subscription status (not stored, computed at read time).

---

## 21. Authentication

- **Provider**: Supabase Auth — email/password AND Google OAuth (the only OAuth provider implemented).
- **Role model**: single `user_role` enum on `profiles`, not JWT custom claims.
- **Auto-provisioning**: `handle_new_user()` DB trigger fires on every `auth.users` INSERT — creates a `profiles` row (role from `raw_user_meta_data`, default `client`) plus a matching `coach_profiles`/`client_profiles` row.
- **Self-serve signup is client-only.** The `SignupForm` always sends `role:"client"`. Coach/admin accounts must be provisioned by ops directly (coach: via the Admin "Add Coach" flow, which creates the Supabase Auth user server-side with a generated temp password shown once; admin: **no path found in the codebase at all — OPEN QUESTION**, manual/out-of-band).
- **Login flow**: `supabase.auth.signInWithPassword()` (or Google OAuth) directly from the client, no custom Server Action wraps sign-in itself. After sign-in, the app re-queries `profiles.role` and, if it doesn't match the login page's expected role, calls `signOut()` and shows an error — a UX safety net; **real enforcement is `middleware.ts`**.
- **OAuth callback** (`/auth/callback`, route handler): exchanges the code for a session, looks up the actual DB role, and routes to the correct dashboard **by role, not by which login page the user started from**.
- **Password reset is non-functional** — "Forgot password?" has no handler in the web app. Must be built for mobile (Supabase Auth supports this natively — `resetPasswordForEmail`).
- **Middleware route protection**: `/client/*`, `/coach/*`, `/admin/*` — no session or role mismatch → redirect to `/login/{role}`.

---

## 22. Role Permissions

Summarized from §3 and §4. The three-layer model (middleware/route-guard → service-layer `requireRole()` → Postgres RLS) must be conceptually replicated in mobile:
1. **Client-side route guarding** in the mobile app (don't render admin screens for a client token) — UX only, not security.
2. **A business-logic layer that enforces the same role checks server-side** — wherever this ends up living (see §27), it must reject unauthorized calls, not merely hide buttons.
3. **RLS is unchanged** if the mobile app reuses the same Supabase project — this is the real security boundary regardless of what the client does.

Full per-table RLS policy summary is in §12. Full per-role screen/action access is in §3 and §5.

---

## 23. Design System

Source of truth: `tailwind.config.ts`, `src/app/globals.css`, `src/components/ui/*`, `src/components/shared/PortalShell.tsx`. **The mobile app must use this as its design source, adapted for mobile layout conventions — not a new visual identity.**

**Correction (re-verified directly against current source):** everything in this section was rewritten after checking the live files — the values below replace an earlier pass of this document that assumed a light theme (`#FAFAFA` background, `#F5E400` yellow, Oswald display font). None of that matches the shipped app. The product is **dark-only, with no light-mode variant**: `html { background:#060606; color-scheme:dark; }` is hardcoded in `globals.css`, and there is no theme toggle or `prefers-color-scheme` branch anywhere in the codebase.

### Colors
| Token | Hex | Usage |
|---|---|---|
| `bg.DEFAULT` | `#060606` | app background — forced on `<body>` everywhere |
| `bg.elevated` | `#0c0c0c` | slightly raised surfaces |
| `bg.soft` | `#141414` | further-raised surfaces |
| `brand.black` | `#000000` | pure black accents |
| `brand.charcoal` | `#111111` | dark surface fill |
| `brand.charcoal2` | `#1A1A1A` | secondary surface / native form-input background (see note below) |
| `brand.yellow` / `yellow.DEFAULT` | `#F5D90A` | primary accent — CTAs, active nav, focus rings, glow effects |
| `brand.yellow2` / `yellow.bright` | `#FFE94D` | primary button hover, gradient end |
| `yellow.dim` | `#B8A400` | de-emphasized yellow (rarely used) |
| `muted.DEFAULT` | `#9a9a95` | secondary text (config token; components mostly use `white/40–60` instead) |
| `muted.2` | `#6f6f6b` | tertiary text |

There is no white/light card surface anywhere. `Card` (`src/components/ui/Card.tsx`) renders either `.glass` (default) or `.glass-yellow` (`dark` prop — despite the name, this is the *accent* variant, not a light one). "Card (light/dark)" in an earlier pass of this document was wrong; both variants are translucent-dark, and text on cards is white/near-white throughout — there is no dark-text-on-light-card state to replicate on mobile.

**Native `<input>`/`<textarea>`/`<select>` quirk worth preserving:** every real form field (not the hand-styled ones in auth/booking flows) gets a hard-coded `#1A1A1A` background with `#F5D90A` (yellow) text and yellow-tinted placeholders, set globally in `globals.css` — including autofill state, forced yellow-on-dark via `-webkit-text-fill-color`. This was a deliberate fix for illegible white-on-white native controls, not a stray override; mobile native inputs should default to this same dark/yellow treatment rather than the OS default.

Semantic (Tailwind default, not tokenized): `emerald-*` (success), `red-*` (destructive/error), `white/[opacity]` (muted text, hairline borders — e.g. `white/60`, `white/[0.09]`). Note the flip from an earlier pass of this document: hairlines and muted text are white-on-dark (`white/...`) everywhere, never `black/...`.

### Typography
- **Display**: **Anton** — not Oswald — a single static weight (400), loaded via `next/font/google` as `--font-display`. Bold and italic are both **CSS-synthesized** on top of that one weight (`font-weight:700` + `font-style:italic` applied to a font with no matching bold/italic face) — the browser fakes both, which is also exactly how production actually renders it. Still always used bold + italic together for headings/titles/big numbers.
- **Body**: Manrope, weights 400/500/600/700/800, loaded via `next/font/google` as `--font-body`, applied globally.
- `.text-display` utility: `letter-spacing: -0.01em`.
- `.text-glow` utility: `text-shadow: 0 0 30px rgba(245,217,10,.35)` — used on hero/emphasis yellow text.
- `.brand-gradient-text` utility: yellow → bright-yellow gradient text-fill, used sparingly for emphasis words.

### Shape & elevation
- Radius: **buttons are `rounded-full` (pill-shaped) in every variant** — not `rounded-xl` as an earlier pass of this document claimed; see `Button.tsx`. Inputs/cards use `rounded-xl` (16px); modals and glass panels use `rounded-2xl` (20px). Badges/avatars `rounded-full`.
- Shadows (`tailwind.config.ts`, calibrated for a dark ground — noticeably heavier than a light-theme shadow): `shadow-soft` (`0 4px 24px rgba(0,0,0,0.4)`), `shadow-card` (`0 2px 12px rgba(0,0,0,0.35)`), `shadow-glow` (`0 0 40px rgba(245,217,10,0.3)`). The primary `Button` additionally carries its own bespoke yellow glow rather than the `shadow-glow` token: `0 0 40px -8px rgba(245,217,10,0.6)`, brightening to `0 0 55px -6px rgba(245,217,10,0.85)` on hover.

### Glassmorphism system (`globals.css`) — not covered in an earlier pass of this document
Real, pervasive utility classes, not a one-off effect:
- `.glass` — `linear-gradient(155deg, rgba(255,255,255,.07), rgba(255,255,255,.02))` + `backdrop-filter: blur(20px) saturate(140%)` + hairline border + layered inset/drop shadow. Default `Card` background.
- `.glass-strong` — heavier blur/opacity variant, for modals and prominent panels.
- `.glass-faint` — subtle variant for chips/rows nested inside an already-glass card.
- `.glass-yellow` — yellow-tinted glass; `Card`'s `dark` (accent) variant.
- `.glow-yellow` (ambient box-shadow glow) and `.noise` (a fixed, low-opacity SVG fractal-noise overlay used on hero/dark surfaces for texture).

Mobile should reproduce blur+translucency (e.g. `UIVisualEffectView`/`BackdropFilter` equivalents), not flatten these to solid fills — glass is a core part of the brand's visual identity, on par with the yellow accent.

### Component inventory (`src/components/ui/*`)
Button (variants: primary/secondary/outline/ghost/destructive/destructive-outline; sizes sm/md/lg — all pill-shaped), Card (`.glass`/`.glass-yellow` via `dark` prop), GlassCard, GlassSectionPanel, Badge (yellow/black/green/red/gray/outline-yellow + purpose-built `AssessmentBadge`/`SessionStatusBadge`), Modal, ConfirmDialog, Avatar (with optional yellow ring), EmptyState, ProgressRing (SVG circular stat), Skeleton (+ CardSkeleton/TableRowSkeleton), StatCard, TagEditor. **No dedicated Input/Select/Checkbox primitive** — forms hand-style inline inputs (`rounded-xl border border-white/15 bg-white/5 py-3 pl-10 pr-4 text-sm` with a leading icon).

### Navigation pattern (to inform §25 Mobile Navigation)
Single `PortalShell` component parameterized by role. Desktop: fixed 288px sidebar, always visible. Mobile web: sticky top bar + off-canvas drawer. Nav item lists per role (exact order, reuse as the mobile bottom-nav/drawer source):
- **Client**: Dashboard, My Sessions, Book a Session*, My Schedule, My Chats*, My Coach, Subscription, Progress, My Concerns, Notifications, Profile. (*conditionally hidden)
- **Coach**: Dashboard, Schedule, Clients, Renewal Opportunities, My Chats, Search, Escalations, Performance, Availability, Notifications, Profile.
- **Admin**: Dashboard, Search, Clients, Renewal Opportunities, Coaches, Sessions, Sales, Scheduling, Availability Check, Coach Change Requests, Leave Requests, Shadow Coverage, Escalations, Notifications, Activity Log, Reports, Settings.

Red numeric badges appear on "My Chats"/"Coach Chats" (unread count) and "My Concerns"/"Escalations" (unresolved count).

### Terminology glossary (preserve verbatim — see §1)
Session status labels exactly as shown: Upcoming, Completed, Cancelled, Missed, Active, Inactive, Paused, Pending, Approved, Rejected, On Leave.

### Assets
**Correction:** a real logo file exists — `public/01_LeanR_by_Fitelo_logo.png` (400×376), rendered via `src/components/shared/Logo.tsx` with `mix-blend-mode: screen`. The PNG has a solid black background; screen-blending it onto the app's near-black (`#060606`) canvas makes that background disappear, leaving only the yellow "LEANR" wordmark and white "By Fitelo" sub-lockup visible — a deliberate technique in place of an alpha-transparent asset. Use this file as the mobile logo/icon source. It will show a visible black box on any non-dark background, so either keep it composited over dark surfaces via the same blend trick, or get an alpha-transparent export from design before using it anywhere light (native app icon on light OS chrome, light system UI, etc. — still an **OPEN QUESTION** for those specific placements, since no such export exists in the repo).

**Repo link (logo):** https://github.com/shekharsaket123987-del/LeanR-PT/blob/master/public/01_LeanR_by_Fitelo_logo.png

**Real photography used on the landing page** — also not documented in an earlier pass of this section. These are the actual, currently-live image assets (not placeholders) and should be reused as-is in the mobile app rather than re-sourced:

| File | Used in | Repo link |
|---|---|---|
| `ChatGPT Image Aug 22, 2026, 01_43_26 PM.png` | `Hero.tsx` — `HERO_PHOTO` | https://github.com/shekharsaket123987-del/LeanR-PT/blob/master/public/ChatGPT%20Image%20Aug%2022%2C%202026%2C%2001_43_26%20PM.png |
| `ChatGPT Image Aug 22, 2026, 02_04_47 PM.png` | `Hero.tsx` — `COACH_PHOTO` | https://github.com/shekharsaket123987-del/LeanR-PT/blob/master/public/ChatGPT%20Image%20Aug%2022%2C%202026%2C%2002_04_47%20PM.png |
| `ChatGPT Image Aug 22, 2026, 02_18_13 PM.png` | `CoachingShowsUp.tsx` | https://github.com/shekharsaket123987-del/LeanR-PT/blob/master/public/ChatGPT%20Image%20Aug%2022%2C%202026%2C%2002_18_13%20PM.png |
| `ChatGPT Image Aug 22, 2026, 03_57_24 PM.png` | `CoachingShowsUp.tsx` | https://github.com/shekharsaket123987-del/LeanR-PT/blob/master/public/ChatGPT%20Image%20Aug%2022%2C%202026%2C%2003_57_24%20PM.png |
| `ChatGPT Image Aug 22, 2026, 04_02_06 PM.png` | `CoachingShowsUp.tsx` | https://github.com/shekharsaket123987-del/LeanR-PT/blob/master/public/ChatGPT%20Image%20Aug%2022%2C%202026%2C%2004_02_06%20PM.png |
| `ChatGPT Image Aug 22, 2026, 04_11_22 PM.png` | `Coaches.tsx` **and** `ReadyWhenYouAre.tsx` (`COACH_PHOTO`, reused in both) | https://github.com/shekharsaket123987-del/LeanR-PT/blob/master/public/ChatGPT%20Image%20Aug%2022%2C%202026%2C%2004_11_22%20PM.png |

All six are AI-generated (filenames are literally ChatGPT export timestamps), not a licensed stock/photo-shoot source — worth knowing if a real photo shoot ever needs to replace them, but they are the genuine current production assets and should be treated as such, not as placeholders. Contrast with `AuthLayout.tsx`'s login-page photo panel, which is **not** a real asset — it calls `picsum.photos/seed/${imageSeed}/1200/1400`, a placeholder image service, live at request time. That one specific spot has no real asset to copy; everywhere else in the table above does.

**Repository:** https://github.com/shekharsaket123987-del/LeanR-PT (branch `master`) — clone or browse this directly to pull the logo and photo files above byte-for-byte rather than re-generating or re-sourcing them.

---

## 24. Web → Mobile Screen Mapping

| Existing Web Screen | Mobile Screen | Same Functionality | Mobile UI Adaptation | Dependencies |
|---|---|---|---|---|
| `/client/dashboard` | Client Home tab | Yes | Card stack instead of wide grid; journey-stage banner pinned to top | Auth, journey state |
| `/client/book` | Book Session flow (modal/stack) | Yes | Full-screen step wizard instead of inline steps | Coach availability, subscription |
| `/client/schedule` | My Schedule tab | Yes | Native date/day picker chips | Recurring slots engine |
| `/client/sessions` | My Sessions tab (segmented control for tabs) | Yes | Swipeable tabs instead of desktop tab bar; reschedule/cancel as bottom sheets | Booking engine |
| `/client/subscription` | Subscription tab (read-only) | Yes | Same | Subscriptions, payments |
| `/client/plans` | Plans screen | Yes | Razorpay mobile SDK instead of Checkout.js | Payments |
| `/client/demo-booking` | Demo Booking screen | Yes | Native date picker | Scheduling |
| `/client/profile` | Profile tab | Yes | Native image picker for photo upload | Storage |
| `/client/concerns` | My Concerns screen | Yes | Same | Escalations |
| `/client/coach` | My Coach screen | Yes | Same | Coach change |
| `/client/chats` | Chat screen (native) | Yes | Native chat UI, push notification integration, native image picker | Realtime, storage |
| `/client/progress` | Progress tab | Yes | Native charts (equivalent to Recharts) | Progress logs |
| `/client/renewal-checkin`, `/onboarding`, `/activate` | Guided full-screen flows | Yes | Same, gated by journey stage | Journey state |
| `/client/notifications` | Notifications tab | Yes | + real push notification integration | Notifications (extended, §26) |
| `/coach/dashboard` | Coach Home tab | Yes | Same widgets, touch-optimized TaskRow | Bookings, sweeps |
| `/coach/availability` | Availability tab (read-only + leave request) | Yes | Same | Coach leave |
| `/coach/schedule` | Schedule tab (Day/Week toggle) | Yes | Native calendar component | Bookings |
| `/coach/clients`, `/clients/[id]` | Clients tab + detail stack | Yes | List → detail push navigation | Clients |
| `/coach/session/[id]` | Session workflow screen | Yes | Full-screen in-session flow, native Zoom SDK or deep link instead of new-tab | Zoom, attendance |
| `/coach/escalations` | Escalations tab (read-only) | Yes | Same | Escalations |
| `/coach/performance` | Performance tab | Yes | Native charts | Coach performance |
| `/coach/profile` | Profile tab | Yes | Native image picker | Profile |
| `/coach/search` | Search tab | Yes | Same | Clients |
| `/coach/chats` | Chat screen | Yes | Same as client chat, categorized tabs | Chat |
| `/admin/*` (18 screens) | Admin app (likely tablet-first or deprioritized for phase 1 — see §26) | Yes | Data-dense tables become card lists; CSV/PDF export needs native share-sheet integration | All admin services |
| `/login/*`, `/signup` | Native auth screens | Yes | Native biometric unlock option (new), same Google OAuth via native SDK | Supabase Auth |
| `/` (landing) | Marketing screen or deep-link-only (app store listing replaces most of this) | Partial | Simplify — app stores already do discovery; keep pricing/how-it-works as in-app content | Public data reads |

---

## 25. Mobile Navigation

Derived directly from `PortalShell`'s per-role nav lists (§23) — do not invent new navigation items.

### Client app — bottom tab bar (primary nav, 5 slots + "More")
```
[Home/Dashboard] [My Sessions] [My Schedule] [My Coach] [More ▾]
                                                            │
                                                            ├─ Subscription
                                                            ├─ Progress
                                                            ├─ My Concerns
                                                            ├─ Notifications
                                                            └─ Profile
```
Conditional entries: "Book a Session" surfaces as a prominent action (FAB or Home CTA) only while no recurring schedule exists; "My Chats" surfaces once any conversation has ever existed (push into bottom tabs or "More" once unlocked).

**Stack navigation** (push/pop within a tab):
```
My Sessions ──(tap session)──▶ Session Detail (bottom sheet: Reschedule/Cancel/Rate)
My Coach ──(Request Change)──▶ Change Request Modal ──▶ Find Coach Modal
Book a Session ──▶ Step 1 (intro) ──▶ Step 2 (pick slot) ──▶ Step 3 (confirm) ──▶ Success
Plans ──▶ Package Detail ──▶ Razorpay native checkout (modal/native SDK) ──▶ Success
```
**Modal screens**: Reschedule (RescheduleModal), Cancel confirm, Rate Session, Raise a Concern, Request Coach Change, Log This Week's Update, Change Photo/Password.

**Guided/gated full-screen flows** (no back button, journey-stage-driven, replacing the web's auto-redirect pattern): Onboarding, Activate Plan, Renewal Check-in — presented as an unskippable stack pushed on top of Home when the journey stage requires it.

### Coach app — bottom tab bar
```
[Home/Dashboard] [Schedule] [Clients] [Chats] [More ▾]
                                                  │
                                                  ├─ Availability
                                                  ├─ Escalations
                                                  ├─ Performance
                                                  ├─ Search
                                                  ├─ Renewals
                                                  ├─ Notifications
                                                  └─ Profile
```
**Stack**: Clients ──▶ Client Detail. Schedule/Dashboard ──▶ Session Detail (full-screen in-session workflow: Join → Attendance → Notes → Complete, one linear flow, not a modal — matches the web's dedicated page).

### Admin app
Given 18 distinct admin screens and heavy data-table usage, recommend either (a) a **tablet-optimized** layout with a persistent side drawer (closer to the web's sidebar pattern) rather than a 5-tab bottom bar, or (b) deprioritizing full admin parity for phase 1 mobile (see §26/§28) since admin work is operationally desk-bound. If built: group into a drawer with sections mirroring the sidebar order in §23.

### Auth navigation
```
App Launch → [has valid session?]
   ├─ Yes → route by profiles.role → respective dashboard
   └─ No → Role-selection or single unified Login screen (email/password + "Continue with Google")
              → [wrong-role account?] → inline error, same UX safety net as web
Signup (client only) → Plans (skips dashboard, matches web behavior) OR email-confirm screen
```

---

## 26. Mobile-Specific Adaptation

Only changes required **because** the app is moving from web to mobile — do not change business functionality otherwise.

- **Push notifications (net-new capability).** The web app has zero push/email/SMS dispatch — this is the single biggest new backend requirement. Recommend: extend `notifications.service.ts`'s `createFromTemplate()` call sites to also trigger a push (e.g., via Expo Push / FCM / APNs) using the existing `notification_templates` catalog as message content, and use the existing `channels` jsonb column (currently unused) to track delivery status per channel as originally scaffolded for.
- **Native date/time pickers** replacing the web's custom slot-grid/calendar components, while preserving the same **whole-hour grid + IST semantics** (§15/§16) — never let device-local timezone leak into slot computation.
- **Native Razorpay mobile SDK** (Razorpay offers dedicated iOS/Android SDKs) instead of Checkout.js — same order-creation/signature-verification contract (§8g), just a different client-side checkout surface.
- **Zoom join**: web opens `zoom_join_url` in a new browser tab. Mobile should deep-link into the native Zoom app (or use the Zoom Meeting SDK for an in-app experience) — same lazily-created URL from `ensureZoomMeetingForBooking()`.
- **Secure token storage**: Supabase session tokens must go into Keychain (iOS) / Keystore (Android) via a secure storage library, not plain AsyncStorage/localStorage-equivalent.
- **Deep links**: notification taps should deep-link to the relevant screen using `notifications.related_entity_type`/`related_entity_id` (already present in the schema, currently unused by the web UI beyond display — mobile should actually route on it).
- **App lifecycle**: handle background/foreground transitions for the join-countdown timer and chat Realtime subscription (reconnect on foreground).
- **Native image picker** replacing the web's `<input type=file>` for avatar/progress-photo/chat-attachment uploads — same Supabase Storage bucket targets and path conventions (§12).
- **Biometric app unlock** (Face ID/fingerprint) as an additive convenience layer on top of the existing Supabase session — not a replacement for the auth model.
- **Offline/poor-connectivity handling**: the web app assumes an always-on connection (no offline queueing observed anywhere). Mobile should at minimum handle graceful error states for the booking hold→confirm flow (a hold can expire while offline) — do not attempt to build full offline-first sync unless separately scoped.
- **Touch target sizing**: web buttons/badges were sized for mouse/desktop in places (e.g., dense admin tables); mobile equivalents need ≥44pt touch targets, converting dense tables to card lists (see §24).

---

## 27. Technical Architecture Recommendation

### The central decision: how does the mobile app talk to the backend?
As established in §4/§11, the web app's "API" is Next.js Server Actions — not callable from a native mobile client. Three options exist for the new project:

**Option A — Direct-to-Supabase (client reimplements service logic).** The mobile app uses the Supabase client SDK directly for Auth/Postgres/Storage/Realtime, and calls the same Postgres RPC functions (§11) for booking/scheduling operations (these are already framework-agnostic SQL functions, callable from any Supabase client). **However**, a meaningful slice of business logic currently lives in TypeScript in `src/lib/services/*.ts` — not in RPC functions — e.g., the reschedule weekly-cap count, the recurring-pattern fallback ladder, Razorpay order creation/signature verification, Zoom meeting creation, notification template interpolation, escalation-gate enforcement for fields not covered by RLS. Under Option A, **all of this must be reimplemented mobile-side or moved into new RPC functions/Edge Functions**, which risks logic drift between web and mobile over time.

**Option B — Thin HTTP API layer fronting the existing services (recommended).** Stand up a small set of HTTP endpoints (e.g., Next.js Route Handlers added to *this same* Next.js app, or a separate lightweight Node/Deno service) that call the **existing, unmodified** `src/lib/services/*.ts` functions directly (they're already framework-agnostic TypeScript, not React-coupled) and expose them over authenticated REST/JSON. The mobile app talks to these endpoints instead of Server Actions. This reuses 100% of the existing, tested business logic verbatim — no reimplementation, no drift risk — and keeps Postgres RPC calls, Zoom/Razorpay integration code, and notification logic in exactly one place. **This is the recommended approach** because it directly satisfies the task's own goal ("reuse existing backend APIs wherever possible") and minimizes the surface area for new bugs.
  - Concretely: for each Server Action file in §11, wrap its underlying service call in a corresponding Route Handler (`src/app/api/mobile/.../route.ts`) that does the same auth-token-extraction + role-check + service-call + JSON-response pattern the Server Action already does — this is a thin, mechanical translation layer, not new business logic.
  - **This does touch the existing web project** (adding new files under `src/app/api/`) — which conflicts with this PRD's "do not modify the existing project" constraint for the *documentation* phase, but is explicitly the implementation-phase recommendation for the *separate new mobile project's* backend. The new project's setup should either (a) fork/extend this repo to add the API layer, or (b) import `src/lib/services/*.ts` as a shared package into a new minimal API project pointing at the same Supabase instance. Flag this decision explicitly to the user/stakeholder before implementation begins — it is a **build-time choice for the new project**, not something this documentation task should decide unilaterally.

**Option C — Supabase Edge Functions.** Port each service function to a Supabase Edge Function (Deno/TypeScript, same language). Similar benefit to Option B (single source of truth) but requires porting away from Next.js-specific request/cookie handling; more infrastructure change than Option B.

**Recommendation: Option B** (or C as a close second) — reuse existing services, add a thin HTTP layer, keep RLS/RPC functions untouched. Avoid Option A except for pure-read/pure-RPC operations where no extra business logic exists (e.g., a direct `has_scheduling_conflict` check for UI-only slot previews is fine to call directly).

### Mobile framework recommendation: React Native
Reasoning, based on this specific codebase:
- **Language continuity**: the entire business logic layer (`src/lib/services/*.ts`, ~26 files) is TypeScript. React Native lets the mobile team read, port, or in some cases directly `import` shared types/constants (`src/lib/constants/*.ts`, `src/lib/types.ts` caveat noted in §2) with zero translation cost. A Flutter (Dart) or native (Swift/Kotlin) rewrite would require re-deriving every business rule in a new language from scratch, doubling the risk of subtly diverging from the rules documented in §13.
- **Supabase SDK parity**: `@supabase/supabase-js` (already a dependency) has first-class React Native support (`@supabase/supabase-js` + AsyncStorage/SecureStore adapter) — Auth, Postgres, RPC, Storage, and Realtime all work identically to the web usage patterns already in this codebase.
- **Team velocity**: existing team already knows React/Next.js patterns (Server/Client Component split, hooks); React Native's component model is close enough that the same team can be productive quickly, vs. ramping up Flutter/Dart or two native codebases from zero.
- **Single codebase for iOS + Android**: satisfies both target platforms (§29 App Store target) without maintaining two native codebases.
- **Ecosystem fit for the specific integrations needed**: Razorpay (`react-native-razorpay`), Zoom (Zoom Video/Meeting SDK has RN wrappers or deep-link fallback), push notifications (Expo Notifications or `@react-native-firebase/messaging`), Recharts-equivalent charting (e.g. `react-native-svg`-based chart libs) — all have mature React Native support.

**Do not** default to Flutter or native Android/iOS unless the team has a strong existing Flutter/native skillset that outweighs the TypeScript-reuse advantage above — that would be a legitimate reason to override this recommendation, but nothing in the codebase itself argues for it.

---

## 28. Implementation Roadmap

Phased by actual dependency order derived from §9's Feature Dependency Map. Each phase lists what must exist before the next can be meaningfully tested.

### Build status (audited against the `leanr-mobile-app` repo + git history, 2026-08-28)

This PRD is written as a fixed spec, but the phases below are no longer purely aspirational — a real Expo/React Native build already exists in this repository (`leanr-mobile-app/`) and has worked through most of this roadmap. Status per phase, derived from the actual route tree (`src/app/(auth|client|coach|admin)/**`), data layer (`src/lib/data/*.ts`), and commit history — not re-derived from scratch each time this doc is read:

| Phase | Status | Notes |
|---|---|---|
| 1 — Foundation | ✅ Done | Expo Router app, Supabase SDK, AES-encrypted session storage (`large-secure-store.ts`). Theme tokens were built against a stale pre-correction palette until this pass — now fixed to match §23 (dark-only `#060606`/`#F5D90A`, Anton + Manrope, real logo asset at `assets/images/leanr-by-fitelo-logo.png`). |
| 2 — Authentication | ✅ Done, fully live | Email/password login, an email-OTP flow (`(auth)/otp.tsx`), password reset (`forgot-password.tsx`/`reset-password.tsx`, deep-link-driven recovery session per `auth-context.tsx`), and Google OAuth (`signInWithGoogle`, Supabase's web-based OAuth pattern via `expo-web-browser` — no client-side Google credential needed, GoTrue holds it) are all implemented. **Google OAuth verified live 2026-08-30**: the Google provider is enabled in the Supabase dashboard with a real Google Cloud OAuth client; confirmed by hitting `GET /auth/v1/authorize?provider=google` directly and getting a genuine `302` to `accounts.google.com` (real `client_id`, correct `redirect_uri`) rather than a "provider not enabled" error. No external dependency remains for auth. |
| 3 — Navigation Shell | ✅ Done | Route groups `(client)/(coach)/(admin)` with per-role `_layout.tsx` and "More" screens, matching §25. |
| 4 — Availability (read-only) | ✅ Done | `coach-availability.ts` + `(coach)/availability.tsx`. |
| 5 — Booking Engine | ✅ Done | Ad-hoc wizard, recurring schedule setup, demo booking — each built and commit-verified against the live RPC bodies (`create_temporary_booking`/`confirm_booking`), per §15. |
| 6 — Session Management | ✅ Done | `(coach)/session/[id].tsx`, `zoom.ts` — real Zoom meeting join. |
| 7 — Reschedule & Cancellation | ✅ Done | `(client)/reschedule/[id].tsx`, schema-verified against live RPC bodies. |
| 8 — Payments & Subscriptions | ✅ Done | Real Razorpay checkout (`react-native-razorpay`) + `payments.ts`, `plans.tsx`. |
| 9 — Coach Change, Escalations, Chat | ✅ Done | `coach-change.ts`, `concerns.tsx`, realtime chat (`chat.ts`/`coach-chat.ts`) with image attachments. |
| 10 — Push Notifications | ✅ Done, and ahead of spec | Implemented as a `pg_net` DB trigger + `send-push` Supabase Edge Function (`supabase/functions/send-push`, `supabase/migrations/20260819120000_push_tokens_and_send_trigger.sql`) — a real scheduled-dispatch path, not just the client-side registration scaffold §26 anticipated. |
| 11 — Coach Portal Completion | ✅ Done | Performance, Renewals, Search, Chats all built. |
| 12 — Admin Portal | ✅ Done, scoped as recommended | Deliberately built as the reduced "on-call ops" subset this section itself suggests — Escalations, Leave Requests, Shadow Coverage (`(admin)/escalation/[id].tsx`, `leave.tsx`, `shadow.tsx`) — not full 18-screen parity. Matches the scope decision this document asked to have flagged before starting. |
| 13 — Testing | 🟡 Started | A real Jest suite (`jest-expo`) now exists — 4 suites / 40 tests covering pure business-rule logic per §29's "business rule regression suite" and "timezone correctness" asks: IST calendar/label math + reschedule cutoff (`booking-wizard.test.ts`), the leave-agnostic hour-matching core of recurring schedule setup (`recurring-schedule.test.ts`), the password-recovery/OAuth deep-link parser (`auth-callback-parsing.test.ts`), and role routing (`role-routing.test.ts`). What's still missing needs a live device/simulator or real backend, not more unit-testable logic: payment/Zoom/Realtime/push integration tests, RLS boundary tests, and all manual device testing — see `leanr-mobile-app/README.md`'s "Testing" section. |
| 14 — Store Release | 🟡 Scaffolding + real branding | ESLint + EAS build/submit profiles exist (`eas.json`, remote app-version-source, auto-incrementing production builds). The app icon/adaptive-icon/favicon are now generated from the real logo (`assets/images/leanr-by-fitelo-logo.png` / the square lockup) instead of Expo's default — a genuine, usable icon, not a placeholder, though still the full wordmark rather than an icon-only monogram (see §23 Assets). No evidence of an actual TestFlight/Play internal build yet — `eas build`/`eas submit` need a real EAS account, Apple Developer Program membership, and Google Play Console access this environment doesn't have. |

**Net effect:** the roadmap in this section is ~90%+ executed for client + coach portals, auth, and push infra — auth (Phase 2) is now fully live with no outstanding external dependency, Google OAuth included. Admin parity was intentionally capped (§Phase 12), not deferred by accident. Testing has a real but partial start (unit-level business rules only); everything requiring a live device/backend remains open. Store release now has a real branded icon; the remaining gate is external accounts (EAS/Apple), not more app code.

### PHASE 1 — Project Foundation
- New React Native project (Expo recommended for push-notification/OTA convenience, or bare RN if native Zoom SDK integration demands it).
- Supabase client SDK wired to the **same Supabase project** as the web app (do not create a new schema — reuse it as-is).
- Decide and stand up the backend-access strategy from §27 (Option B recommended) before writing any screen that needs a mutation.
- Design system port: colors/fonts/radius/shadow tokens (§23) into a shared theme file; port the `ui/*` component inventory (Button, Card, Badge, Modal, Avatar, EmptyState, StatCard, etc.) as React Native equivalents.
- **Completion criteria**: app builds on iOS + Android simulators; a themed placeholder screen renders correctly in light/dark.

### PHASE 2 — Authentication
- Login (client/coach/admin — or unified with role-detection, per §25), Signup (client-only), Google OAuth (native SDK flow), OAuth callback equivalent, secure token storage, middleware-equivalent role routing.
- Password reset (net-new — Supabase Auth supports it; the web app lacks it, but §2 flags this as worth adding for mobile since a broken/missing reset flow is a much bigger problem on mobile app-store review).
- **Completion criteria**: a real test account (from the dev seed data — Arjun Mehta/Priya Nair as coaches, Saket Shekhar/Ananya Rao as clients, per §12's seed data note) can log in and land on the correct role's home screen; wrong-role login is rejected.

### PHASE 3 — User Roles & Navigation Shell
- Bottom-tab/drawer navigation structure per §25, gated by role.
- Profile screens (view/edit) for all three roles.
- **Completion criteria**: navigating between all top-level tabs works for a client, a coach, and an admin test account.

### PHASE 4 — Availability & Scheduling Data (read-only first)
- Coach availability view (client-facing: what slots exist), coach's own availability view (read-only, admin-managed), admin's coach/client list screens.
- **Completion criteria**: a client can see their assigned coach's real open slots for the next 14 days, matching what the web app would show for the same account.

### PHASE 5 — Booking Engine
- Recurring schedule setup/change (§15), ad-hoc booking wizard, demo booking — all calling the same `create_temporary_booking`/`confirm_booking` RPC pair.
- **Completion criteria**: a booking created in the mobile app appears correctly in the web app's My Sessions / Coach Schedule, and vice versa (proves shared-backend correctness).

### PHASE 6 — Session Management (Live Session + Attendance + Notes)
- Zoom join (client + coach), coach join-gate, attendance marking, session notes submission, session completion.
- **Completion criteria**: a full session lifecycle (book → join → mark attendance → submit notes → completed) works end-to-end on a real Zoom test account.

### PHASE 7 — Reschedule & Cancellation
- Full RescheduleModal-equivalent flow (own coach slots, fastest-available, substitute coach), cancellation with cutoff enforcement.
- **Completion criteria**: cutoff rules (1h reschedule / 12h cancel), weekly reschedule cap, and same-day-double-booking prevention all correctly reject invalid attempts with the same error semantics as web.

### PHASE 8 — Payments & Subscriptions
- Razorpay native checkout, plan purchase → activation → renewal state machine, subscription/pause-days display.
- **Completion criteria**: a real (test-mode) Razorpay payment results in a correctly fulfilled subscription, matching §8g's flow exactly including the `paid_unfulfilled` failure path.

### PHASE 9 — Coach Change, Escalations, Chat
- My Coach/coach-change request flow, My Concerns/escalation raising (client) + read-only view (coach) + full gated resolution workflow (admin), real-time chat with attachments/read-receipts.
- **Completion criteria**: an escalation raised on mobile is resolvable through the same gated workflow on the web admin portal (proves shared-backend correctness); a chat message sent on mobile appears in real time on web and vice versa.

### PHASE 10 — Notifications (push, net-new)
- Wire push notification delivery into the existing `notifications.service.ts` template system (§20/§26) — this is new backend work, not a port.
- **Completion criteria**: every one of the 22 existing notification template triggers (§20) also produces a real push notification on the recipient's device.

### PHASE 11 — Coach Portal Completion
- Performance dashboard, renewals view, global search, remaining coach screens not yet covered.

### PHASE 12 — Admin Portal (scope decision required — see §25)
- Either full admin parity or a deliberately reduced "on-call ops" subset (e.g., escalation resolution + leave approval + shadow coverage, the time-sensitive ones) — **flag this scope decision to the user before starting**, since admin is inherently desk-bound work and full parity may not be worth mobile investment.

### PHASE 13 — Testing
See §29.

### PHASE 14 — Android + iOS Store Release
App Store / Play Store listing (new logo/icon asset required — §23 OPEN QUESTION must be resolved before this phase), TestFlight/internal-track beta, staged rollout.

---

## 29. Testing Requirements

- **Cross-platform data integrity tests**: every write path (booking, reschedule, cancel, attendance, notes, payment, chat message) must be verified to produce identical database state whether performed from mobile or web — since both clients share one Supabase backend, this is the primary regression risk.
- **Business rule regression suite**: automate every rule in §13 (cutoffs, weekly caps, same-day restrictions, escalation gate, one-active-subscription rule, etc.) as integration tests against the real RPC functions/service layer — not mocked, since the DB-level exclusion constraint and RLS are part of correctness.
- **Timezone correctness tests**: explicitly test slot display/booking from devices set to non-IST timezones — this class of bug has recurred multiple times in the web app's history (migration 0026 fixed several).
- **Payment integration tests**: Razorpay test-mode end-to-end, including the `paid_unfulfilled` recovery path (simulate a fulfillment failure after successful payment capture).
- **Zoom integration tests**: meeting creation, join-gate enforcement (today vs. backlog bookings), best-effort deletion on cancel/reschedule.
- **Realtime tests**: chat message delivery and read-receipt propagation under flaky/backgrounded network conditions.
- **Push notification delivery tests**: every template trigger in §20 fires a real device notification, with correct deep-link routing.
- **Role/permission boundary tests**: attempt every cross-role action (e.g., client attempting an admin-only mutation) and confirm rejection at the RLS layer even if a client-side bug bypassed the app's own guard.
- **Manual device testing**: golden-path + edge cases on both iOS and Android physical devices before each phase's sign-off (per this org's general engineering practice of verifying UI changes in a live environment, not just automated tests).

---

## 30. Feature Completion Criteria

A feature is not "done" merely because its UI renders. Applying the same standard the web app implicitly follows (every mutation flows through the full stack):
```
UI
 ↓
User Action
 ↓
Frontend Logic (validation matching §13's rules, not just happy-path)
 ↓
API layer (per §27's chosen architecture)
 ↓
Backend service (reused from src/lib/services, or a faithful port)
 ↓
Database operation (same RPC functions / same tables as web)
 ↓
Response (success AND documented failure modes from this PRD)
 ↓
UI update (matching the "Result"/"Next State" columns in §10)
```
A feature is complete only when: (1) it produces identical database state to the equivalent web action, (2) it enforces the same business rules server-side (not just client-side), (3) its failure modes match what's documented in §8/§10/§13, (4) it is reachable via the navigation structure in §25, (5) it visually matches the design system in §23.

---

## 31. Known Limitations

Carried forward from the existing web app — these are **existing product limitations**, not mobile-specific gaps, and should not be silently "fixed" by the mobile app without a separate product decision:
- No push/email/SMS notification dispatch (see §20/§26 — mobile will need to add push as new capability, but should not assume email/SMS are coming along with it unless separately scoped).
- No real refund/payment-gateway money movement — refund requests are audit-log-only.
- No password reset flow on web (mobile should add this — see §28 Phase 2 rationale).
- No session recording.
- No cron/scheduled jobs — all sweeps are opportunistic, triggered by other operations.
- No admin-provisioning flow in the codebase (admin accounts are created out-of-band).
- Testimonials on the landing page are mock/placeholder data, not backed by a real reviews table.
- The login page's photo panel (`AuthLayout.tsx`) calls a placeholder image service (`picsum.photos`) at request time rather than using a real asset — see §23 Assets for the real assets that exist elsewhere (logo, landing-page photography) and should be reused instead of re-sourced.
- Inconsistent confirmation-dialog usage on some destructive admin actions (e.g., Sessions list's Cancel has no confirm dialog while other destructive actions do) — worth normalizing in the new build rather than copying the inconsistency, but flag this decision rather than silently picking one.
- `temporary_booking_status = 'released'` enum value exists but is never set by any function — dead/reserved, do not build UI around it without confirming intent.

---

## 32. Open Questions

Consolidated from all source analyses. These require either a source-code deep-dive beyond this pass's scope, or a product/stakeholder decision, before the mobile team should treat the related area as fully specified.

1. **First-admin provisioning**: no migration, seed script, or application code creates an admin-role account. Exact production process is undocumented in this codebase.
2. **`temporary_booking_status = 'released'`**: exists in the enum, never set by any function found — likely dead/reserved, or an unimplemented client-initiated pre-confirm cancel.
3. ~~**Cancellation session-credit refund**~~ — **Resolved 2026-08-28** (revised same day after a closer read of `confirm_booking()` uncovered a second, stricter count — see below), confirmed live via direct `pg_proc` introspection. There are **two distinct "sessions remaining" concepts**, not one:
   - **Display/progress count** (`subscription.ts`, the web's renewal-eligibility check): `sessions_total - count(bookings where status='completed')`. This is what a client sees as their remaining balance/progress — deliberately generous, since an upcoming (not-yet-happened) session isn't "used" yet from a progress standpoint.
   - **Booking-gate count** (`confirm_booking()`'s actual hard limit, the one that can really block a purchase): `sessions_total - count(bookings where status in ('upcoming','completed'))` — throws `'No sessions remaining on this package'` if the committed count already meets the total. This is intentionally stricter: it must count already-reserved-but-not-yet-happened sessions too, or a client could book far more sessions than they paid for before any of them complete.
   - **So does cancelling "refund" a credit?** Not via any explicit refund/credit-restoration code (`cancel_booking()` still never touches `subscriptions` directly, confirmed) — but functionally, yes, for the booking gate specifically: cancelling flips a booking's status to `'cancelled'`, which falls outside `('upcoming','completed')`, so the very next `confirm_booking()` call recomputes a lower committed count and allows a new booking. The "refund" is an emergent property of the gate being recomputed live from current booking statuses each time, not a stored/decremented counter. `subscriptions` has no stored `sessions_remaining` column at all (confirmed via `information_schema.columns` — only `sessions_total` is stored), consistent with this. **Mobile implication**: the mobile app's own `subscription.ts` correctly matches the *display* count (completed-only) for showing progress, but if mobile ever needs to pre-check "can this client book another session" client-side (rather than just letting `confirm_booking()`'s server-side gate throw), it must use the *booking-gate* count (`upcoming + completed`), not the display count — using the wrong one would let the UI show a bookable slot that the RPC then rejects.
4. **Paid-demo-session Razorpay path**: `createDemoSessionOrderAction`/`DEMO_SESSION_FEE` (₹700) code exists in `payments.service.ts` but the live demo-booking flow actually books demos for free (`amountPaid: 0`). Confirm whether the paid path is dead code or reachable from some UI not covered in this pass.
5. **Exact client-side Zoom "Join" button enable/disable timing** (`useJoinCountdown`) — not read at the source-component level in this pass; likely a simple minutes-before-start window, replicate a sensible default and confirm against the actual component if precision matters.
6. **Subscription "exhausted" status**: no explicit status transition found when `sessions_remaining` hits 0 — confirm whether new bookings are blocked some other way or the plan just becomes non-renewable-looking without a formal terminal state.
7. **Admin-initiated cancellation coach notification**: no notification path found for admin-cancelled bookings (only client-cancelled bookings notify the coach) — confirm intentional.
8. **`reassignClientCoach()` internals** (`clients.service.ts`): exact mechanics of "same day/time, new coach" repointing, and which tables besides recurring_slots/bookings are touched, weren't read in full in this pass.
9. **`fn_audit_trigger()` internals** (migration 0009): confirmed only which tables it's attached to and what it captures at a high level; exact trigger body wasn't read.
10. **Escalation/coach-change "reopen" controls**: no reopen path found for a `resolved` escalation or a `rejected`/`approved` coach-change request — confirm these are intentionally permanent terminal states.
11. **Leave request partial approval**: code only supports whole-request approve/reject — confirmed no per-day partial approval exists.
12. **Sessions list Cancel button** (admin) has no confirmation dialog, inconsistent with other destructive admin actions — flag for the new build to decide whether to normalize.
13. **`getRevenueTrendRaw()` internals** (`adminDashboard.service.ts`) — not confirmed whether raw SQL, RPC, or view-based.
14. ~~**`notification_type` enum's complete value set**~~ — **Resolved 2026-08-28**, confirmed live via direct `pg_enum` introspection of the "LeanR PT" Supabase project: `booking`, `reminder`, `feedback`, `system` (4 values — the previously-unconfirmed 4th is `feedback`).
15. **Which action file exposes generic `listMyNotifications`/`markNotificationRead`** per role — inferred but not confirmed file-by-file (likely `client-notifications.actions.ts`-equivalent per portal).
16. **Exact SQL thresholds inside `flag_overdue_attendance`/`flag_overdue_notes`** — code comments say "2 hours post-session-end"; should be confirmed directly against migrations 0032/0048 if the mobile app needs to display a countdown to this threshold.
17. **`font-script` Tailwind class** referenced in `Logo.tsx` has no matching font-family definition in `tailwind.config.ts` — likely an unfinished/unintentional style; do not port as-is without checking whether a script font was actually intended for the "By Fitelo" sub-lockup.
18. **RN vs. thin-API-layer build sequencing** (§27, Option B): adding an HTTP API layer touches the existing web project's `src/app/api/` — this documentation task was scoped as read-only, so the actual decision of *where* that layer lives (fork this repo vs. a new project importing shared services) is explicitly left as a stakeholder decision, not resolved here.

---

*End of PRD. This document was produced by read-only analysis of the LeanR PT web application; no files in the existing web project were modified.*
