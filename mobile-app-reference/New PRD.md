# Web Application – Complete Functional & Technical Master Documentation

## LEANR by Fitelo — Source of Truth for Mobile Application Development

**Status of this document:** Produced by an independent, code-only audit of the live web application source (`LeanR-PT-main`, Next.js 14 + Supabase), conducted as a fresh pass separate from any prior documentation in this repository. Every claim is traced to a specific file, function, migration, or component. Per the requester's own analysis rules, anything that could not be conclusively determined from the code is explicitly marked **Needs Verification** rather than guessed. Claims are further tagged where useful: **[Confirmed]** (directly observed in code), **[Inferred]** (derived from code but not 100% certain of intent), **[Needs Verification]** (could not be determined from source alone).

**Audit method:** Eight independent deep-read passes — database (all 57 migrations), three backend domains (payments/booking/scheduling; coach lifecycle/escalations/leave/shadow-coverage/renewals; client/admin operations/auth/settings/notifications), and four frontend domains (client portal, coach portal, admin portal, public/marketing/auth/design system) — each instructed to read actual source rather than infer behavior from naming, and each producing forms/validation catalogs, search/filter catalogs, and step-by-step data-flow chains in addition to standard screen/function documentation.

---

## Table of Contents

1. Project Overview · 2. Complete User/Role System · 3. Complete Application Workflow · 4. Screen-by-Screen Documentation · 5. Feature Inventory · 6. Business Logic · 7. Database Documentation · 8. Data Flow · 9. API Documentation · 10. Authentication & Authorization · 11. Status & State Machines · 12. Payments · 13. Zoom/Video Integration · 14. Notifications · 15. Files & Media · 16. Forms & Validation · 17. Search/Filter/Sort Logic · 18. Error Handling · 19. Edge Cases · 20. Mobile App Requirements · 21. Mobile Navigation Architecture · 22. API/Backend Reuse Strategy · 23. Third-Party Integrations · 24. Security · 25. Analytics & Logging · 26. Cron Jobs/Background Processes · 27. Admin/Configuration System · 28. Feature Dependency Map · 29. Mobile Development Backlog · 30. Functional Parity Checklist · 31. Testing Requirements · 32. Final Source-of-Truth Summary

---

# 1. Project Overview

**Application name:** LEANR by Fitelo (repository: `LeanR-PT-main`).

**Purpose:** An online 1:1 personal-training marketplace. A client purchases a fixed-size session package, is matched to a coach (algorithmically, not by browsing), sets up a recurring weekly video-training schedule, and trains live over Zoom for the life of the package, tracking progress and renewing when sessions run low.

**Main business objective [Inferred]:** Deliver live, coach-continuity-first personal training at scale, with heavy automation of the operational back office (scheduling, leave coverage, renewals) so a small admin/ops team can run a large roster of coaches and clients.

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS | Server Components + Server Actions dominant pattern; `framer-motion` + `@react-three/fiber` + `lenis` for the marketing site's animation/3D/smooth-scroll layer (never loaded in authenticated portals) |
| Backend | Next.js Server Actions (`src/lib/actions/*.ts`, 34 files) calling a service layer (`src/lib/services/*.ts`, 35 files) | **No conventional REST/GraphQL API exists** — see §9 |
| Database | Supabase Postgres — 57 sequential SQL migrations, ~28-30 tables, RLS on every table, ~13 custom RPC functions, 6 views, audit triggers | See §7 for full schema |
| Authentication | Supabase Auth — email/password + Google OAuth; JWT sessions with a Custom Access Token Hook embedding role; phone OTP (MSG91) as a secondary, currently-bypassable verification step | See §10 |
| File/storage | Supabase Storage — 4 buckets (`avatars`, `chat-attachments` public; `progress-photos`, `coach-certifications` private) | 2 of the 4 buckets (`progress-photos`, `coach-certifications`) are schema-only, never referenced by any application code — see §15 |
| Payment gateway | Razorpay — raw REST + HMAC signature verification, no SDK | See §12 |
| Video/meeting | Zoom — Server-to-Server OAuth, one shared business account (no per-coach OAuth) | See §13 |
| Notifications | In-app (`notifications` table) + Email (Resend) + SMS (MSG91, client-only, DLT-templated). **No push notifications exist on any platform today.** | See §14 |
| Hosting/deployment | **Two deployment configs present simultaneously**: `vercel.json` (minimal — only specifies `regions: ["syd1"]`, no cron config) and `netlify.toml` (build command + `@netlify/plugin-nextjs`). **Needs Verification: which is the actual production target** — the app references a `leanr-pt.vercel.app` URL in its GitHub Actions workflow, suggesting Vercel is live, but this is inferred, not confirmed by any explicit "this is production" marker in the repo. |
| Background jobs | **One** time-based job, triggered by a GitHub Actions workflow (`.github/workflows/session-reminders.yml`, `cron: "*/15 * * * *"`) calling `GET /api/cron/session-reminders` with a shared `CRON_SECRET` — **not** a Vercel Cron entry, despite the route's own code comment claiming otherwise (a documentation-drift bug — see §26). All other background-style behavior is "opportunistic sweeps" run inline on ordinary page loads, not scheduled at all. |
| Environment configuration | Env vars confirmed in use: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_HOST_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID_<EVENT>` (×7 events), `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, Supabase URL/anon key. |
| Major dependencies | `@supabase/ssr`, `@supabase/supabase-js`, `next`, `react`, `framer-motion`, `@react-three/fiber`, `@react-three/drei`, `three`, `lenis`, `recharts` (admin charts), `jspdf` + `jspdf-autotable` (lazy-loaded, client-side PDF report export), `resend`, `clsx`. **No form-validation schema library** (no zod/yup/react-hook-form/formik/joi) — all validation is hand-rolled TypeScript if/throw logic or native HTML attributes. **No analytics/tracking library** (confirmed absent by exhaustive grep — no gtag, Mixpanel, Segment, PostHog, Amplitude, Vercel Analytics). |

## Architecture in Simple Language

There is no separate "API server" a mobile app can simply call. The web app's browser talks directly to Next.js **Server Actions** — functions that run on the server but are invoked like local async functions from React components — which in turn call a **service layer** that queries Supabase's Postgres database. The database's own **Row-Level Security (RLS) policies** are the actual security boundary (not application code): even if every server-side role check were deleted, a client could still only ever read/write rows RLS permits for their JWT's identity. Two Postgres functions (`is_slot_within_working_hours`, `has_scheduling_conflict`) and a hold-then-confirm two-step booking flow are the load-bearing core of the entire scheduling engine, called from nearly every booking-related code path. There are exactly **two** real HTTP endpoints in the whole app: the Razorpay payment webhook and the session-reminder cron route — everything else is Server Actions, which a native mobile app **cannot call directly** (they are a Next.js-internal RPC wire protocol, not a public HTTP API) — this is the single most important architectural fact for the mobile project, expanded fully in §22.

---

# 2. Complete User / Role System

Exactly **three** authenticated roles exist, stored in one Postgres enum `user_role ('admin','coach','client')` on `profiles.role` — no sub-roles, tenant-admin, or super-admin tier exists. A fourth, unauthenticated **Visitor/Prospect** state covers the public marketing site and the logged-out "free assessment" lead-capture flow.

## Role: CLIENT
- **Purpose:** buys a session package, trains with an assigned coach, tracks progress, renews.
- **Login method:** Email/password self-signup (with mandatory email OTP + phone OTP, the latter currently bypassable — see §10), or Google OAuth (always provisions role `client` — **[Confirmed]** no code path lets a Google sign-in become coach/admin).
- **Accessible modules:** Dashboard, My Sessions, Book a Session (hidden once subscribed), My Schedule, My Chats (hidden until any chat exists), My Coach, My Concerns, Subscription, Progress, Notifications, Profile.
- **Restricted:** `/coach/*`, `/admin/*` entirely (middleware + RLS).
- **Can view:** own profile/sessions/subscription/progress/chats/concerns; assigned coach's public profile.
- **Can create:** own progress logs (capped 1/7 days), bookings (subject to cutoffs/credit), escalations, coach-change requests, chat messages (while an active conversation exists).
- **Can update:** own name/phone/photo/emergency contact, own goals/equipment/medical notes, own password, own subscription (pause/resume, self-service).
- **Cannot delete** anything — no client-facing delete action exists anywhere in the codebase.
- **Special conditions:** subject to a hard, server-enforced "measurements stale" gate blocking booking/joining/demos if no progress log in 7 days.

## Role: COACH
- **Purpose:** runs sessions, manages own leave/availability read-only view, views (read-only) escalations, manages own client roster.
- **Login method:** email/password only — **[Confirmed] no self-serve signup exists for coaches**; accounts are provisioned exclusively via `createCoach()` (admin-only, uses the Supabase service-role Admin API). No Google OAuth path for coaches.
- **Accessible modules:** Dashboard, Schedule, Clients (own roster + global search read-only), Renewal Opportunities, My Chats, Search, Escalations (read-only), Performance (read-only), Availability (leave requests only — working-hours view is read-only), Notifications, Profile, Session Detail.
- **Restricted:** `/client/*`, `/admin/*`.
- **Can view:** own assigned clients in full detail; **any** client platform-wide via Global Search (identity + timeline only, **not** progress_logs — deliberately kept assigned-only, migration 0033).
- **Can create:** attendance records, session notes, leave requests, chat messages (to currently-assigned clients only), skill additions (append-only).
- **Can update:** own phone/emergency contact/photo, own password, session attendance/notes for own bookings.
- **Cannot update:** own name, specialization, bio, certifications, languages, working hours (all admin-owned); cannot resolve/respond to escalations (admin-only, explicitly stated in the coach portal's own UI copy); cannot cancel or reschedule any session — **[Confirmed] no such action exists anywhere in the coach action files.**
- **Special conditions:** cannot mark attendance before a session ends; for today's sessions, must have clicked "Join" first; cannot submit session notes before marking attendance present/late.

## Role: ADMIN
- **Purpose:** full operational control — client/coach management, scheduling overrides, approval workflows, reporting, platform configuration.
- **Login method:** email/password only, dedicated `/login/admin` route. No self-serve signup; provisioning method for the very first admin account is **Needs Verification** (no in-app "create admin" action exists — likely direct Supabase dashboard/seed data).
- **Accessible modules:** all 25 admin routes — Dashboard, Search, Clients (list/detail/new), Renewal Opportunities, Coaches (list/detail/new), Sessions (list/detail), Sales, Scheduling, Availability Check, Coach Change Requests, Leave Requests, Shadow Coverage, Escalations (list/detail), Notifications, Activity Log, Reports, Settings.
- **Restricted:** nothing within `/admin/*`; RLS still grants admin full access to every table via an `is_admin()` helper function used in every RLS policy.
- **Can view/create/update:** everything a client/coach can about themselves, PLUS: subscription status/session counts/pause-days, coach professional fields and working hours, package catalog, 4 of 8 `system_settings` keys, escalation classification/resolution, leave/coach-change/shadow-coverage approvals.
- **Can "delete":** packages only, and only as a **soft delete** (`is_active:false`) — **[Confirmed] no hard-delete action exists for any entity anywhere in the application** (coaches are "disabled," not deleted, to preserve FK/audit history).
- **Special permissions:** the only role that can bypass booking cutoffs (`enforceCutoff = role !== 'admin'`), the only role that can force a coach transfer past an availability-coverage warning, the only role that can resolve escalations (behind a mandatory "confirmed I called the client" gate).

## Role: VISITOR / PROSPECT (unauthenticated)
- Can browse the marketing site, view active packages (server-rendered from live DB data), and submit a free-assessment lead-capture form (writes to `assessment_sessions`, no account created). Can sign up (→ becomes `client`) or log in.

## Permission Matrix

| Feature | Client | Coach | Admin |
|---|---|---|---|
| Dashboard | Yes (own) | Yes (own) | Yes (platform) |
| View own profile | Yes | Yes | Yes |
| Edit own profile (phone/photo/emergency contact) | Yes | Yes | Yes |
| Edit own name/professional fields | Yes (name only) | No (admin-owned) | Yes |
| View any client's identity | Own only | **Any** (global search) | All |
| View any client's health/progress data | Own only | **Assigned only** (never widened) | All |
| Edit client goals/equipment/medical notes | Own, self-service | No | No dedicated action exists |
| Book / Cancel / Reschedule sessions | Yes (cutoff-gated) | No action exists | Yes (cutoff-exempt) |
| Mark attendance / submit session notes | No | Yes (own sessions, gated sequence) | No |
| Manage own working-hours template | N/A | Read-only (revoked migration 0045) | Full (any coach) |
| Request / Approve leave | N/A | Request only | Approve/reject (triggers shadow-cascade) |
| Assign shadow coach | N/A | Read-only view of own assignments | Full (auto on leave-approval, or manual preview→confirm tool) |
| Raise / Resolve escalations | Raise own | View own clients', read-only | Full (creation + gated resolution) |
| Coach-change request | Request only | N/A | Full (direct reassign or resolve request) |
| Manage subscriptions | Pause/resume own | No | Full (create/adjust/pause/resume any) |
| Manage package catalog | No | No | Full (create/edit/soft-delete) |
| Platform settings | No | No | Yes (4 of 8 keys) |
| Audit log / Activity log | No | No | Yes |
| Chat | With current coach only | With assigned clients only | Full read, never write |
| Global client search | No | Yes | Yes |
| Reports (CSV/PDF export) | No | No | Yes |

---

# 3. Complete Application Workflow

## Overall Application Journey (any role)

```
Application opened
→ Landing page (/ — marketing site, unauthenticated)
→ Authentication (role-specific login page OR self-serve signup [client only] OR Google OAuth)
→ Role detection (middleware.ts reads JWT claim `user_role`, falls back to a `profiles` query if the claim is absent)
→ Redirect to role's dashboard (/client/dashboard | /coach/dashboard | /admin/dashboard)
→ Modules (role-specific nav, see §21)
→ Actions (Server Action call)
→ Backend processing (service-layer validation + business logic)
→ Database changes (Postgres, RLS-scoped or service-role)
→ Notifications (in-app row + best-effort email/SMS, see §14)
→ Integrations (Razorpay / Zoom, where applicable)
→ Logout (supabase.auth.signOut() + router.push("/"), identical mechanism in all 3 portal shells)
```

**There is no unified `/login` page** — three separate role-scoped routes (`/login/client`, `/login/coach`, `/login/admin`) each render the same shared `LoginForm` component parameterized by role. A wrong-role login attempt (correct credentials, wrong portal) is caught **twice**: first, `middleware.ts` would bounce a wrong-role session attempting to reach a protected route; second — because that alone would produce a confusing infinite bounce — `LoginForm.tsx` itself checks `profiles.role` immediately after a successful `signInWithPassword` and, on mismatch, force-signs the user out and shows: *"This account isn't registered as a/an {role}. Log in with the correct account, or use the right portal."*

---

## CLIENT WORKFLOW

### 3.1 New Client Acquisition (first-time)
```
Landing page
→ /signup (or Google OAuth via any login/signup page's "Continue with Google" button)
→ Email OTP verification (Supabase native, only if "Confirm email" is enabled in the Supabase dashboard)
→ Phone OTP verification via MSG91 (or the "Skip for now" bypass — see §10/§19)
→ /client/plans (marketing/purchase page)
→ Purchase Plan → Razorpay Checkout → signature-verified fulfillment → subscription created (status: awaiting_activation)
→ /client/activate (pick a start date, one-time lock)
→ /client/onboarding (health/goals intake, one-time)
→ /client/schedule (recurring weekly pattern + coach match)
→ First session (Zoom link created lazily on first "Join")
```

### 3.2 Alternative Entry: Free Demo First
```
Landing page OR not-yet-subscribed client's dashboard
→ /client/demo-booking (date/time/gender preference only — client never picks the coach)
→ System auto-assigns the top utilization-ranked coach → free bookings row created (session_type=assessment, amount_paid=0)
→ Demo session runs (identical mechanics to a regular session on the coach side)
→ Post-demo feedback gate (optional 2-star-rating + note, or "Skip")
→ /client/plans → same purchase→activate→onboard→schedule path as §3.1
```

### 3.3 Regular Session Loop (once subscribed)
```
Login
→ Dashboard (journey-stage router; sessions/streak/progress-since-Day-1 summary)
→ My Sessions (Upcoming tab) → Join Now (opens Zoom link, disabled if measurements stale)
→ [after session] Coach marks attendance + submits notes (coach-side action, not client-visible in real time)
→ My Sessions (Completed tab) → optionally Rate Session (once per 7 days, across all bookings)
→ Progress → weekly measurement log (required to keep booking/joining unlocked)
→ Notifications (booking/reminder/feedback/system events)
```

### 3.4 Cancellation / Reschedule
```
My Sessions (Upcoming tab)
→ Cancel (disabled inside 12h cutoff) → ConfirmDialog → cancelSessionAction → booking status=cancelled;
   if from a recurring slot, next occurrence auto-backfilled
   OR
→ Reschedule (disabled inside 1h cutoff, max 2/week) → RescheduleModal
   → "Fastest Available" per-coach slot, OR browse open 30-day grid, OR check a specific date/time
     (falls back to substitute-coach candidates if own coach isn't free)
   → booking's scheduled_start (and optionally coach_id, for that one occurrence only) updated in place
```

### 3.5 Coach Change
```
My Coach → "Request Coach Change" (reason required, optional 1-5 ratings) → coach_change_requests row (pending)
→ [Admin resolves — see Admin Workflow §3.14]
→ Approved-without-coach-picked: client sees "pick your new schedule" card
   → Day/Time search → Find Available Coach → Confirm → new recurring pattern created, old one retired
→ Approved-with-coach-picked (admin fast path): client's coach changes immediately, no further client action
```

### 3.6 Renewal
```
Sessions remaining drops to ≤5 (client nudge) or ≤10 (staff "Renewal Opportunities" list, earlier warning)
→ Same Razorpay purchase flow as §3.1 (new subscriptions row, old one superseded not deleted)
→ /client/renewal-checkin (fresh baseline measurement, bypasses the normal weekly cap)
→ /client/schedule ("Keep My Schedule" shortcut, or full re-pick via the scheduling wizard)
```

### 3.7 Escalation / Support
```
My Concerns → "Raise a Concern" (category + optional details) → escalations row (open)
→ [Admin must call the client + classify + resolve — see Admin Workflow §3.16]
→ Client sees status updates (open→in_progress→resolved) and admin's client-visible progress notes in real time
```

---

## COACH WORKFLOW

### 3.8 Daily Operational Loop
```
Login
→ Dashboard (7 KPI stat cards; Today's Tasks; Pending Tasks backlog; Upcoming 3 days; Cancelled/Rescheduled history; Clients preview)
→ [Pending-Tasks Gate Modal — soft nudge, every login while backlog > 0, dismissible]
→ For each due session:
   Join Zoom Meeting (idempotent, sets coach_joined_at)
   → wait until session end time
   → Mark Attendance: Present | Late | Absent
       Present/Late → Session Notes form unlocks → Mark Completed (booking → completed, TERMINAL)
       Absent → booking → missed immediately, no notes phase, TERMINAL
→ Repeat for next session
```

### 3.9 Client Management
```
Clients (own roster, filterable by status/plan/day) → Client Detail (100% read-only for coach)
   OR
Search (Global — any client platform-wide) → Client Detail (read-only banner if not own client)
```

### 3.10 Communication
```
My Chats (4 tabs: Active/Old/Expired/Pause, derived from client's subscription status)
→ ConversationThread (send text/image, only while conversation is "active" and client is currently assigned)
```

### 3.11 Leave / Availability
```
Availability → Weekly Working Hours (read-only, admin-managed)
→ "Request Leave" (Full day | Partial day, 24h advance notice, no bypass) → coach_leave row (pending)
→ [Admin approves — triggers automatic shadow-coverage cascade, see Admin Workflow §3.15]
→ Coach notified of approval/rejection; if approved, sees shadow-covered sessions reflected on own schedule/activity feed
```

### 3.12 Performance / Reporting (read-only)
```
Performance → 14 KPI stat cards + 30-item Activity Timeline (merged bookings/leave/shadow events, derived, no dedicated table)
```

---

## ADMIN WORKFLOW

### 3.13 Client & Coach Management
```
Admin Dashboard (12 platform KPIs)
→ Clients (list, search/filter) → Add Client (migration wizard: identity+plan+optional schedule, availability-checked before submit)
   OR → Client Detail → Manual Controls (Adjust Sessions, Grant Pause-Days, Transfer Coach, Assign Shadow Coach,
        Pause Subscription, Log Measurement, Log Escalation, Log Refund Request [audit-only, no money moves])
→ Coaches (list, search) → Add Coach (identity+skills+languages+weekly slots) → Coach Detail → Admin Controls
   (Override/Block Slot, Reassign Clients [bulk, per-client independent try/catch], Disable Coach [soft],
    Edit Coach, Set Working Hours [the ONLY write path for a coach's recurring template])
```

### 3.14 Coach Change Request Resolution
```
Coach Change Requests (Pending queue)
→ Approve (optionally picking the new coach directly — repoints existing pattern immediately, no further client
    action needed) OR Approve-blank (client self-serves afterward) OR Reject
→ Client notified either way
```

### 3.15 Leave Approval → Automatic Shadow-Coverage Cascade
```
Leave Requests (Pending queue)
→ Approve → coach_leave.status=approved → coach notified
   → EVERY active client of that coach notified ("coach on leave")
   → FOR EACH affected client: find best-scoring available coach PER OCCURRENCE (specialization/language/
      rating/utilization-weighted score) → group into date-range shadow assignments → auto-assign
   → ALSO cascades: if the leaving coach was themselves covering someone else as a shadow, that coverage
      is re-searched and reassigned too
   → Any occurrence with zero available candidates → flagged, admins alerted, never silently dropped
→ Admin sees an inline summary: "Shadow coverage auto-assigned" + "Needs manual assignment" (if any gaps)
   OR
→ Reject → coach notified only, no cascade
```

### 3.16 Escalation Resolution (hard-gated workflow)
```
Escalations (global queue, Active/Resolved tabs) → Escalation Detail
→ GATE: "Confirm I've Called the Client" — nothing else is even rendered until this is clicked (server-enforced,
   not just hidden UI)
→ [unlocked] Admin Assessment (Issue Type, Fault, internal Case Summary — optional, full-replace on every save)
→ [unlocked] Progress Notes (client-visible, append-only, repeatable)
→ [unlocked] Mark In Progress (optional) → Mark Resolved & Close (Resolution Notes)
→ Client notified; status becomes resolved (TERMINAL — no reopen path exists)
```

### 3.17 Shadow Coverage — Manual Tool (undocumented/emergency absences)
```
Shadow Coach Required queue (live-derived, no stored table) → "Assign shadow coach" → Client Detail
→ ShadowCoachAssignModal: From/To dates → "Find Coverage" (PREVIEW ONLY, per-occurrence best match) →
   "Confirm Assignment(s)" (COMMITS — same algorithm as the automatic leave cascade, used for a coach who
   never filed a leave request in the system)
```

### 3.18 Platform Configuration
```
Settings → Package Types (create/edit/soft-delete packages) + Session Rules (4 sliders: default duration,
   cancellation cutoff, reschedule cutoff, inactivity threshold — see §27 for which of these are actually live)
```

### 3.19 Reporting / Oversight
```
Reports (5 fixed CSV/PDF exports) | Sales (transaction list) | Activity Log (DB audit trail, 7-table coverage) |
Availability Check (cross-coach single-day view) | Scheduling (6-section grouped activity view) |
Renewal Opportunities (platform-wide) | Search (universal client lookup)
```

---

# 4. Screen-by-Screen Documentation

Organized by portal. For every screen: purpose, roles, route, entry/exit points, data loaded, UI sections, every button's exact behavior (API called → DB effect → success/failure/redirect), conditional rendering, and empty/loading/error states. Loading state for every screen in every portal is the same Next.js `loading.tsx` boundary per portal (title+description skeleton + 1-3 `CardSkeleton`s) unless otherwise noted. Error state for a top-level data-fetch failure is a full-page `EmptyState` (icon `AlertTriangle`, title, and the literal server error message) unless otherwise noted.

## 4.A CLIENT PORTAL (`/client/*`) — 16 routed screens + 3 global gate modals

### Shell: `PortalShell` (role=client), `src/app/client/layout.tsx`
Wraps every route. Loads 7 signals in parallel (measurement staleness, journey stage, any-chat-exists, sessions-low status, unread chat count, unresolved concerns count, phone-present check) — every one individually failure-tolerant (defaults to "not stale/0/false", never crashes the shell). Nav: Dashboard, My Sessions, Book a Session (hidden once subscribed), My Schedule, My Chats (hidden until any chat exists, red unread badge), My Coach, Subscription, Progress, My Concerns (red badge), Notifications, Profile. Renders 3 stacked, mutually-exclusive, priority-ordered gate modals on top of every page: Phone → Measurements → Sessions-Low.

### Screen: Dashboard
- **Route:** `/client/dashboard`. **Roles:** client. **Entry:** default post-login landing; redirect target from nearly every other screen's guard.
- **Data:** `getMyJourneyStateAction`, `getClientDashboardAction`, `getMyProgressAction` (parallel).
- **Stage-routing (this screen is the master gate):** `marketing`→redirect `/client/plans`; `awaiting_activation`→redirect `/client/activate`; `onboarding`→redirect `/client/onboarding`; `renewal_checkin`→redirect `/client/renewal-checkin`; `renewal_scheduling`/`slot_selection`→redirect `/client/schedule`; `demo_booked`→demo-info card, no button; `demo_completed`→"Choose Your Plan" button → `/client/plans`.
- **UI (default/active stage):** `ProgressRing` (sessions used/total), package name, paused badge; `NextSessionCard` (empty→"Go to My Schedule" button; else Join Now/Join button, `href=zoomJoinUrl`, disabled if `!canJoin || !zoomJoinUrl || measurementsStale`); 3 `StatCard`s (Completed/Streak/Package%); "Progress Since Day 1" 8-metric delta grid; weekly-measurement compliance banner (green/red, red links to Progress); Recent Sessions list.
- **Buttons:** "Choose Your Plan" (demo_completed) → `/client/plans`. "Update now" → `/client/progress`. "Join Now/Join" (NextSessionCard) → opens Zoom URL new tab.

### Screen: Activate Plan
- **Route:** `/client/activate` (guarded — redirects to dashboard unless `stage==='awaiting_activation'` and a subscriptionId exists). **Roles:** client.
- **Fields:** Start Date (date, `min`=tomorrow, default=tomorrow).
- **Button "Confirm Start Date":** → `activatePlanAction(subscriptionId, startDate)` → server: one-time lock (throws "This plan has already been activated." on repeat), rejects same-day+ (must be ≥ tomorrow IST). Success → `router.push("/client/dashboard")` + refresh. Failure → inline red error.

### Screen: Onboarding (Initial Assessment)
- **Route:** `/client/onboarding`. **Roles:** client. No page-level guard beyond the dashboard's redirect.
- **Fields:** Age/Height (optional numbers), Gender (optional select), Weight kg (**required**, only required measurement field system-wide), Body Fat%/Muscle%/Waist/Chest/Hip/Arms/Thigh (optional numbers), Fitness Goal (**required** button-group: Fat Loss/Muscle Gain/Strength/General Fitness/Rehabilitation), Medical Conditions/Injuries/Medications/Exercise Restrictions (optional textareas).
- **Button "Complete Assessment"** (`disabled` until weight+goal set): → `submitOnboardingAction(...)` — server: one-time insert (throws "Onboarding has already been submitted -- contact support to make changes." on repeat; only admin can correct afterward). Success → dashboard + refresh.

### Screen: Book a Session
- **Route:** `/client/book`. **Roles:** client. Only reachable pre-subscription (redirects to `/client/schedule` once `subscriptionId != null`).
- **Data:** `getMyJourneyStateAction`, `getBookingOptionsAction`, `getMyMeasurementStatusAction`.
- **Branches:** `demo_booked`→info card; `demo_completed`→`DemoFeedbackGateClient` (rate-or-skip) then "Choose Your Plan"; `marketing`→"Book Free Demo"/"Choose Your Plan" buttons.
- **3-step wizard** (intro→schedule→confirm): Intro shows first-session "Assessment" framing or returning-client's coach card + "Request a coach change" link → Continue. Schedule: slot grid (2-week horizon, empty state if none) → select → Continue Schedule. Confirm: review card → **"Confirm Booking"** (`disabled` if measurements stale) → `confirmBookingAction({slotStart, durationMinutes, sessionType})` — server hard-gates on measurement staleness independent of the UI disable. Success → booked confirmation + "Back to Dashboard"/"View My Sessions".

### Screen: Demo Booking
- **Route:** `/client/demo-booking`. **Roles:** client.
- **Fields:** Preferred Date (`min`=tomorrow), Preferred Time (optional, 17 hourly slots 5AM–9PM), Coach Gender (optional).
- **Button "Book Free Demo Session"** (`disabled` if measurements stale) → `bookDemoSessionAction({date, preferredTime, genderPreference})` — server takes the **top-ranked option only**, client never picks the coach; also hard-gates on measurement staleness (a precondition unique to this action, not mirrored elsewhere). Success → coach photo/name/date/time + "Go to Dashboard".

### Screen: Plans (Marketing / Purchase)
- **Route:** `/client/plans`. **Roles:** client.
- **Data:** `listMarketingPlansAction` (active packages only).
- **UI:** "Try a free demo" banner → `/client/demo-booking`; plan cards (highlighted badge, savings badge).
- **Button "Purchase Plan"** (locks other cards while in-flight) → `createPackagePurchaseOrderAction(plan.id)` → Razorpay Checkout modal → on success (server-verified signature inside the hook, **never client's say-so**) → "Congratulations!" modal → **"Understood"** → `router.push("/client/dashboard")` + refresh (navigation deferred until this explicit dismissal, not automatic).

### Screen: My Coach
- **Route:** `/client/coach`. **Roles:** client.
- **Data:** `getMyCoachAction` (prefers real recurring coach; falls back to upcoming-demo coach; else null), `getMyCoachChangeRequestAction`.
- **States:** no coach→"Book Free Demo" button; demo coach→simplified card, no change-request UI; real coach→full profile card. Request status banners: pending (yellow)/rejected (red)/approved-complete (green)/approved-incomplete (day/time picker card).
- **"Request Coach Change" modal:** Reason (**required** textarea), Overall Experience/Coach Rating (optional 1-5 stars), Additional Comments (optional). **"Submit Request"** (disabled until reason non-empty) → `requestCoachChangeAction(...)`.
- **Completion flow (when approved+no new coach):** Day toggles + Time input → **"Find Available Coach"** → `findCoachChangeOptionsAction(...)` → on match, **"Confirm {name}"** → `completeCoachChangeAction(...)`.

### Screen: My Concerns
- **Route:** `/client/concerns`. **Roles:** client.
- **Data:** `listMyConcernsAction`.
- **"Raise a Concern" modal:** Category (select, 7 fixed values, default first), Details (optional textarea). **"Submit"** → `raiseConcernAction(category, label, description)`.
- **List:** status badges (open/in_progress/resolved), admin progress notes thread, final resolution box once resolved.

### Screen: My Chats
- **Route:** `/client/chats`. **Roles:** client.
- **Data:** `getMyChatsAsClientAction`.
- **States:** empty→"A chat opens automatically once you've purchased a plan and a coach is assigned" (chat gated on **having ever purchased**, not merely having a coach — a demo-only client has no chat at all); active conversation→full `ConversationThread`; past/closed→expandable read-only accordion with explanatory reason text.

### Screen: My Sessions
- **Route:** `/client/sessions`. **Roles:** client.
- **Data:** `getClientSessionsAction`, `getSchedulingRulesAction` (cutoffs), `getMyShadowCoachNoticeAction`.
- **Tabs:** Upcoming/Completed/Cancelled/Missed/Rescheduled (client-side filter on already-fetched array).
- **Shadow-coach banner** (if present): "Acknowledge" button → `markNotificationReadAction`.
- **Per upcoming card:** **"Reschedule"** (disabled inside 1h cutoff) → `RescheduleModal` (3 paths: fastest-available, browse 30-day grid, or check-specific-time with substitute-coach fallback) → `rescheduleSessionAction`/`rescheduleSessionToSubstituteAction`. **"Cancel"** (disabled inside 12h cutoff) → `ConfirmDialog` → `cancelSessionAction`.
- **Per completed card without rating:** **"Rate Session"** → `FeedbackModal` (2 required star pickers + optional note) → `rateSessionAction` (server caps at 1 rating/7 days across **all** the client's bookings, not per-booking).

### Screen: My Schedule
- **Route:** `/client/schedule`. **Roles:** client. Branches heavily by journey stage (renewal_scheduling/demo_booked/marketing/demo_completed each render a distinct informational card).
- **`ScheduleSetupClient`** (the most complex client form, used for setup/change/renewal modes):
  - Renewal-only fork: "Keep My Schedule" (→ `keepRenewalScheduleAction`, repoints subscription only) vs "No, Change It" (reveals full picker).
  - Time select (hourly grid) → Pattern (standard 3-day presets → "Not happy?" reveals 2-day-pair mode → "Choose Your Own Days" reveals fully-custom 2-5-day mode, Sunday always excluded) → Trainer Preference (Same/New/No-Preference, renewal excludes No-Preference) → Trainer Gender (renewal+New only).
  - **"Check Availability"** → `matchScheduleAction(...)` — fallback ladder (exact→alt-time→pair→pair-alt-time for existing-coach; whole-roster exact-only for new/first-time) → match card ("Confirm This Schedule"/"Save New Schedule" → `confirmScheduleAction`/`changeScheduleAction`) or "No Match Found" (widen search, or **"Notify Support"** → `reportScheduleUnmatchedAction`, no client-facing waitlist).

### Screen: Subscription & Payments
- **Route:** `/client/subscription`. **Roles:** client.
- **Data:** `getMyJourneyStateAction`, `getMySubscriptionAction`.
- **UI:** status badge, usage progress bar, pause-days line, **"Pause Plan"**/**"Resume Plan"** (self-service, `ConfirmDialog`) → `pauseMySubscriptionAction`/`resumeMySubscriptionAction`. Payment History list.

### Screen: Progress
- **Route:** `/client/progress`. **Roles:** client.
- **Data:** `getMyProgressAction`, `getClientSessionsAction`.
- **UI:** stale-measurement red banner (with exact "last updated / never logged" copy); **"Log This Week's Update"** button (only when `canSubmitThisWeek`) → modal (8 optional numeric fields) → `submitMyProgressAction` (server-enforced 7-day cap); Latest Measurements grid; `MeasurementChart` (if any logs); Session History & Coach Notes.

### Screen: Renewal Check-in
- **Route:** `/client/renewal-checkin` (guarded — redirects unless `stage==='renewal_checkin'`). **Roles:** client.
- **UI:** prior-measurement chart or empty state; fresh 8-field "Log Today's Measurements" form (explicitly not overwriting history). **"Continue"** → `submitRenewalCheckinAction` (bypasses weekly cap via `skipWeeklyLimit`) → dashboard.

### Screen: Notifications
- **Route:** `/client/notifications`. **Roles:** client. Identical component (`NotificationsClient`) reused verbatim on the coach and admin portals.
- **UI:** list with type icons (booking/reminder/feedback/system), unread highlighted+clickable → `markNotificationReadAction` (optimistic, no "mark all read" exists).

### Screen: Profile
- **Route:** `/client/profile`. **Roles:** client.
- **"Edit Profile" modal:** Photo (upload to Storage bucket `avatars`), Name, Phone, Goals (`TagEditor`), Equipment (`TagEditor`), Medical Notes → `updateMyProfileAction`.
- **"Change Password" modal:** New/Confirm Password (client-side ≥8 chars + match) → **direct** `supabase.auth.updateUser({password})` call, **not a Server Action**.

### Global Gate Modals (layout-level, not routes)
- **PhoneGateModal** — forced when `profiles.phone` is null (Google OAuth signups only); two-step phone→OTP; includes a **"Skip for now (demo — MSG91 not verified yet)"** bypass saving the number **unverified**.
- **MeasurementGateModal** — forced when last log ≥7 days old or never logged; blocks booking/joining/demos; "Skip for now" only dismisses the modal, the underlying gate stays active elsewhere.
- **SessionsLowGateModal** — reappears every login while low (no persisted dismissal); "Renew Now" → `/client/plans`.
## 4.B COACH PORTAL (`/coach/*`) — 12 routed screens + 1 global gate modal

### Shell: `PortalShell` (role=coach)
Loads unread-chat count, pending-tasks, unresolved-escalations count in parallel (each defaults to 0/[] on failure). Nav: Dashboard, Schedule, Clients, Renewal Opportunities, My Chats (red badge), Search, Escalations (red badge), Performance, Availability, Notifications, Profile. No nav items conditionally hidden (unlike client). Renders global `CoachPendingTasksGateModal` on every page.

### Global Modal: Pending Tasks Gate
Soft nudge (not a hard block), opens if `initialPendingTasks.length > 0` (no persisted dismissal — reappears every page load while backlog exists). Lists up to 5 past sessions missing attendance/notes, each with **"Resolve"** → `/coach/session/{id}`. **"Skip for now"** dismisses locally only; **"Review Now"** → `/coach/schedule`.

### Screen: Dashboard
- **Route:** `/coach/dashboard`. **Roles:** coach.
- **Data (6 parallel):** `getCoachDashboardAction`, `getCoachCancelledSessionsAction`, `getCoachRescheduledSessionsAction`, `getCoachTodayTasksAction`, `getCoachUpcoming3DaysAction`, `getCoachPendingTasksAction`.
- **UI:** 7 `StatCard`s (Today/This Week/Completed/Missed/Utilization%/Avg Rating/Active Escalations) → Today's Tasks widget → Pending Tasks widget → Upcoming (Next 3 Days, read-only) → Cancelled Sessions (capped 5, shows "Cancelled by Admin/Coach/Client") → Rescheduled Sessions (capped 5 — **currently always empty for any reschedule performed after migration 0041, see §19 Edge Case**) → Your Clients preview (top 3).

### Shared Component: Task Row (used by Today's Tasks + Pending Tasks, on both Dashboard and Schedule's Day view)
- **Today's Tasks** = today's `upcoming` bookings. **Pending Tasks** = any-day `upcoming` bookings already past their time (owed attendance/notes). Both run overdue-flag sweeps (`sweepOverdueAttendance`/`sweepOverdueNotes`) on load.
- **Row buttons (conditional on `attendanceStatus`):**
  - Not yet marked: **"Join"** (`markSessionJoinedAction`, idempotent — opens `zoomStartUrl` or routes to session detail if already past) + **"Present"/"Late"/"Absent"** (`markAttendanceAction`, all disabled until `canMarkAttendance = isPast && joined`, client-side mirror of the server gate).
  - Present/Late + notes not submitted: **"Add Notes"** → `/coach/session/{id}`.
  - Absent: badge only, no further action ("Absent — logged").
  - Notes submitted: badge only ("Notes submitted").

### Screen: Schedule
- **Route:** `/coach/schedule`. **Roles:** coach.
- **Data:** `getCoachScheduleAction` (upcoming+completed bookings), `getCoachTodayTasksAction`.
- **Day/Week toggle** (client-side): Day view = same Task Row widget as Dashboard. Week view = 7-day grid (session counts per day); clicking a day with ≥1 session opens a modal listing sessions (time/client/type/status), each row linking (full page nav) to `/coach/session/{id}`.

### Screen: Clients (list)
- **Route:** `/coach/clients`. **Roles:** coach.
- **Data:** `getCoachClientsAction` (own roster only).
- **Filters (all client-side, AND-combined):** free-text search (name/code), status pills (7 values), Plan select, Day select.
- **Table:** Client/Plan/Start Date/Slot/Progress/Status(+Overdue badge if measurements stale) → row links to `/coach/clients/{id}`.

### Screen: Client Detail
- **Route:** `/coach/clients/[id]`. **Roles:** coach. **100% read-only — no forms/buttons anywhere on this page.**
- **Data:** `getCoachClientDetailAction(id)` — extends the list-row shape with history, demographics, session summary, weekly progress comparison, progress chart feed, timeline, and `isAssignedToMe`.
- **Read-only banner** shown when reached via Global Search and not actually assigned: *"Read-only — this client isn't assigned to you, found via Global Search. Billing, progress, and session details are only visible to their assigned coach."*
- Sections: profile/demographics, Session Summary, Weekly Progress mini-cards, Progress Over Time chart (if history exists), Session History & Notes, `ClientTimeline` (shared component, identical to the admin version).

### Screen: Search (Global)
- **Route:** `/coach/search`. **Roles:** coach.
- **Data:** `searchAllClientsAction` (fetches every client on the platform once, filters client-side — not a per-keystroke server query).
- Each result → link to Client Detail (read-only banner applies if not assigned); shows "Your client"/"Read-only" badge.

### Screen: My Chats
- **Route:** `/coach/chats`. **Roles:** coach.
- **Data:** `getMyChatsAsCoachAction`.
- **Categorization (server-computed, quoted logic):** `status==="closed"` → `old`; else client's subscription `paused` → `pause`; `active`/`awaiting_activation` → `active`; else (inactive or no subscription) → `expired`.
- Tabs (4, with live counts) → `ConversationThread`, `readOnly` when closed (reason: *"A new coach has been assigned to this client — you can still see this history, but can't send new messages."*).

### Screen: Availability
- **Route:** `/coach/availability`. **Roles:** coach.
- **Weekly Working Hours:** read-only display (*"Only admin can change your working hours."*).
- **Leave Requests card:** list + **"+ Request Leave"** button opens modal — see Forms Catalog for full field/validation table.

### Screen: Renewal Opportunities
- **Route:** `/coach/renewals`. **Roles:** coach. Shared `RenewalOpportunitiesClient` (Coach column hidden since every row is already "my client"). Two tabs (Opportunity/Expired), each row → Client Detail.

### Screen: Escalations
- **Route:** `/coach/escalations`. **Roles:** coach. **Explicitly read-only** ("only Admin can respond to or resolve these," stated in the page header itself — confirmed in code: no update/resolve action exists in the coach action file). Two tabs (Active/Resolved).

### Screen: Performance
- **Route:** `/coach/performance`. **Roles:** coach. Fully server-rendered, no interactivity, explicitly labeled "read only."
- **Data:** `getMyPerformanceAction` (14-stat object) + `getMyActivityAction` (30-item derived feed merging bookings/leave/shadow events).

### Screen: Profile
- **Route:** `/coach/profile`. **Roles:** coach.
- **Editable:** Mobile Number, Emergency Contact, Photo (modal → `updateMyCoachProfileAction`). Skills: **append-only** inline add-row (`addMySkillAction`, server-enforced — no remove path from this role). Password (direct Supabase call).
- **Read-only (admin-owned):** email, specialization, bio, certifications, languages, employee code, joining date, working hours, capacity, name.

### Screen: Notifications
- **Route:** `/coach/notifications`. Reuses the client portal's `NotificationsClient` verbatim.

### Screen: Session Detail — the core operational workflow
- **Route:** `/coach/session/[id]`. **Roles:** coach.
- **Data:** `getCoachSessionDetailAction(bookingId)` — status/type/date/duration/amountPaid, client info, up to 3 previous session notes, `attendanceStatus`, existing notes, `zoomStartUrl` (lazily created, only while `upcoming`), `coachJoinedAt`.
- **Client-side state:** `sessionEnded` computed **once at render** — not a ticking countdown (unlike the dashboard Task Row's `useJoinCountdown`); a coach sitting on this exact page as the clock crosses the boundary must refresh/re-navigate.
- **Stage A — Join** (hidden once completed/missed): not-joined → **"Join Zoom Meeting"** (`markSessionJoinedAction`, opens `zoomStartUrl`); joined+not-ended → **"Reopen Zoom"** link available; joined+ended → prompts to mark attendance below.
- **Stage B — Attendance** (hidden once present/late is marked, or completed/missed): **Present**/**Late**/**Absent** buttons, all disabled until `canMarkAttendance = joined && sessionEnded`; optional remark textarea (sent only with Absent). **Server gate** (independent of UI): throws if session hasn't ended; throws if today's session and not joined.
- **Absent → TERMINAL** (Stage C): "Client marked absent," no notes phase, **"Back to Dashboard"**.
- **Stage D — Session Notes** (shown once present/late or completed; disabled once completed): Session Summary (**required**, only client-enforced field), Exercises Performed, Client Performance (4-way button group), Improvements Seen (`TagEditor`), Homework, Additional Remarks. **"Mark Completed"** → `submitSessionNotesAction` — **server gate**: attendance must be present/late (independent of UI), booking must still be `upcoming` (else "Booking not found, or already completed" — can't resubmit). Success → booking `completed` (TERMINAL), notes read-only, **"Back to Dashboard"** replaces submit.
- **Full state machine:** `upcoming, not joined → [Join] → joined, not ended → [wait] → joined, ended → [Present|Late|Absent] → {notes phase → [Mark Completed] → completed TERMINAL} | {missed TERMINAL}`.
## 4.C ADMIN PORTAL (`/admin/*`) — 25 routed screens

### Shell: `PortalShell` (role=admin)
Nav (17 items): Dashboard, Search, Clients, Renewal Opportunities, Coaches, Sessions, Sales, Scheduling, Availability Check, Coach Change Requests, Leave Requests, Shadow Coverage, Escalations, Notifications, Activity Log, Reports, Settings. "Escalations" carries a red unresolved-count badge.

### Screen: Dashboard
- **Route:** `/admin/dashboard`. **Data:** `getAdminDashboardAction` → 12 `StatCard`s (Total/Active Clients, Sessions Booked/Cancelled Today, Trainer Utilization, Peak Booking Hour, Empty Slots, Revenue This Month, Active Coaches, Avg Coach Rating, Avg Sessions/Day, Renewal Rate) + Revenue Trend line chart + coach-utilization mini-bars + Bookings-by-Hour bar chart. No filters/search. No buttons/forms.

### Screen: Clients (list)
- **Route:** `/admin/clients`. **Data:** `listAdminClientsAction`. Search (name/ID/phone) + 6-way status filter (client-side). Table → row links to Client Detail. Header button **"+ Add Client"** → `/admin/clients/new`.

### Screen: Add Client (migration wizard)
- **Route:** `/admin/clients/new`. **Purpose (quoted):** "Create an existing client's account directly — for migrating a roster tracked outside LEANR mid-plan."
- **3 cards:** Identity (Full Name, Phone [optional], Login Email, Temporary Password [random, shuffle button] — all required except phone); Plan (Plan Name select [resets Sessions Remaining/Pause Days to package defaults], **Sessions Remaining** [required >0 — enter the client's *actual remaining* count from the legacy system, not the original plan size], Original Plan Size [optional, timeline-note only], Pause Days Allowed); Coach & Weekly Schedule (optional — Coach select, Time select, 7-day toggle).
- **"Check Availability"** button (required before submit is enabled if any days are selected) → `checkSlotAvailabilityAction` — shows green confirmation or red conflict box with alternative-time/alternative-coach chips.
- **"Create Client"** → `createMigratedClientAction`. Success: one-time credentials display + **"View Client"**/**"Add Another Client"**.

### Screen: Client Detail (richest screen)
- **Route:** `/admin/clients/[id]`. **Data (5 parallel):** `getAdminClientDetailAction`, `listAdminCoachOptionsAction`, `getClientTimelineAction`, `listEscalationsForClientAction`, `getClientChatsForAdminAction`.
- **Left column:** Identity card; Assigned Coach card; Package card (usage bar, pause-days-remaining, **"Grant Pause-Days"** button); **Manual Controls card** —
  - **"Adjust Package / Sessions"** (disabled if no subscription) → stepper modal → `adjustClientSessionsAction(subscriptionId, newTotal)`.
  - **"Transfer to Another Coach"** (disabled if no coach) → select modal → `transferClientCoachAction(force=false)`; on the specific "coach hasn't set availability for" error, shows amber **"Transfer Anyway"** retry with `force=true` (the **only** two-step force-override pattern in the entire admin portal).
  - **"Assign Shadow Coach"** (disabled if no coach) → `ShadowCoachAssignModal` (preview→confirm).
  - **"Pause Subscription"** (disabled if no subscription) → `ConfirmDialog` → `pauseClientSubscriptionAction`.
  - **"Log Measurement"** → 8-field modal → `logMeasurementAction` (admin has **no weekly cap**, unlike client).
  - **"Log Escalation"** → Reason+Details modal → `logEscalationAction` (admin-initiated, `raisedBy: null`).
  - **"Log Refund Request"** (destructive) → Amount+Reason modal → `logRefundRequestAction` — explicit disclaimer: *"This platform has no payment gateway yet — this logs a refund request to the audit trail for finance to action manually; it does not move money."*
  - Open Escalations card (if any `open`) with inline **"Mark Resolved"** per row.
- **Right column:** `ClientTimeline` (26-event-type filter, split/merged view, infinite-scroll pagination, red stale-measurement banner); `AdminClientChats` (view-only, no composer, no realtime — "admin can see, never send"); Progress chart (if history exists); Session History list.

### Screen: Coaches (list)
- **Route:** `/admin/coaches`. **Data:** `listAdminCoachesAction`. Search (name only). Table (Coach/Utilization/Active Clients/Rating/Status) → row links to Coach Detail. Header **"+ Add Coach"** → `/admin/coaches/new`.

### Screen: Add Coach
- **Route:** `/admin/coaches/new`. **4 cards:** Identity (Full Name, Employee Code, Login Email, Temporary Password [random+shuffle], all required); Skills (Primary Specialization [required select], Additional Skills [multi-toggle]); Languages (**required**, ≥1); Weekly Slot Openings (repeatable Time+7-day-toggle rows, **"Add Slot"**, delete on rows beyond first; ≥1 valid row required).
- **"Create Coach"** → `createCoachAction`. Success: credentials display + **"Back to Coaches"**/**"Add Another Coach"**.

### Screen: Coach Detail (second-richest)
- **Route:** `/admin/coaches/[id]`. **Data (5 parallel):** `getAdminCoachDetailAction`, `listAdminCoachOptionsAction`, `getCoachPerformanceAction`, `getCoachWeekCalendarAction` (today+6 days), `getCoachAvailabilityForAdminAction`.
- **Left column:** Profile card + **"Edit"** modal (Name/Specialization/Years/Bio/Additional Specializations/Languages → `updateCoachAction`); `CoachPerformancePanel` (13 stats, same formulas as coach's own view); Skills `TagEditor` — **admin has full edit/remove** (unlike the coach's append-only view) → dirty-state **"Save Skills"** → `updateCoachSkillsAction`; **Admin Controls card**:
  - **"Override / Block Slots"** → Date+Reason modal → `blockCoachSlotAction` (inserts a pre-approved one-day `coach_leave` row — reuses the leave mechanism, see §19 for the confusability risk this creates in the coach's own leave list).
  - **"Reassign Clients"** → bulk move every active client to a new coach → `reassignCoachClientsAction` — **per-client independent try/catch** (one client's uncovered-availability failure never blocks the rest), returns `{reassignedCount, failed[]}` shown inline.
  - **"Disable Coach"** (destructive, disabled if already inactive) → `ConfirmDialog` → `disableCoachAction` (sets `status:"inactive"` — no hard delete exists).
- **Right column:** Assigned Clients list; **Weekly Working Hours** (the **only** admin write-surface for a coach's recurring template — per-day checkbox+time inputs → **"Save Working Hours"** → `setCoachAvailabilityAction`); **7-Day Schedule** (`CoachWeekCalendar`, color-coded grid, booked cells link to the client).

### Screen: Escalations (global queue)
- **Route:** `/admin/escalations`. **Data:** `listAllEscalationsAction`. Active/Resolved tabs. Rows link to Escalation Detail.

### Screen: Escalation Detail — the canonical gated workflow
- **Route:** `/admin/escalations/[id]`. Card 1 (always visible, read-only): client's original report.
- **Hard gate:** if `calledClientAt` is not set, **everything else is replaced** by a single card — "Call the client first" + **"Confirm I've Called the Client"** (`confirmCalledClientAction`). Server-enforced independently (`requireCalledClient` throws on every subsequent mutation), not merely hidden UI.
- **Once unlocked:** Admin Assessment card (Issue Type/Fault/Case Summary → `updateEscalationDetailsAction` — full-replace of all three fields together, not a merge); Progress Notes card (client-visible append-only → `addEscalationNoteAction`); Resolve card — **"Mark In Progress"** (only while `open`) and **"Mark Resolved & Close"** (Resolution Notes) → `resolveEscalationAction`. Resolved state is terminal (no reopen control).

### Screen: Leave Requests
- **Route:** `/admin/leave-requests`. Card per pending request (coach, dates, "{n}+ days" badge if full-day ≥14 days, reason). **"Reject"**/**"Approve"** → `resolveLeaveAction`. On approve, a rich inline summary appears (not a modal): "Shadow coverage auto-assigned" (per-client breakdown) and/or red "Needs manual assignment" (uncovered clients/dates, **"Review clients"** link). ≥14-day leave shows an amber advisory nudging toward a *permanent* coach change — purely advisory, never automatic.

### Screen: Coach Change Requests
- **Route:** `/admin/coach-change-requests`. For still-`pending` requests, the current-coach display is **re-resolved live** (not the frozen row snapshot). **Reject** immediate; **Approve** → two-step modal (optionally pick a new coach directly, or leave blank for client self-serve) → `resolveCoachChangeRequestAction`.

### Screen: Shadow Coach Required (gap queue)
- **Route:** `/admin/shadow-coverage`. Live-derived (no stored table) list of bookings whose coach is on approved leave with no shadow assigned. **"Assign shadow coach"** → links to Client Detail (the actual assign UI lives there).

### Screen: Scheduling (grouped activity view)
- **Route:** `/admin/scheduling`. Fully read-only, 6 sections (Today's Changes, Cancelled, Rescheduled [**currently broken/empty for reschedules after migration 0041** — see §19], Manual Sessions Created [heuristic via audit-log actor, no `created_by` column], Demo Sessions, Shadow Sessions) — all derived from the same booking dataset bucketed 6 ways.

### Screen: Availability Check
- **Route:** `/admin/availability`. Cross-coach, single-day view; date navigator (`?date=`, server-side re-fetch, defaults today IST). Booked/Free client-side filter pills. Free slots show `freeReason` (e.g. prior cancellation).

### Screen: Search (Universal Client Search)
- **Route:** `/admin/search`. Unrestricted (admin has full read access already). Loads full client list once, filters client-side.

### Screen: Sessions (master list)
- **Route:** `/admin/sessions`. Coach + Status filters (client-side). Fixed sort (date desc, not user-controllable). Row actions (upcoming only): reschedule icon (modal, `rescheduleSessionAction`) and **cancel icon — no confirmation dialog**, immediate `cancelSessionAction` (the one admin destructive action with no "are you sure" step).

### Screen: Session Detail
- **Route:** `/admin/sessions/[id]`. Fully read-only, no client component at all. Sections: Basic Information (incl. `wasManuallyAdded` derived from `recurring_slot_id IS NULL`), Outcome Detail (conditional — rescheduled/no-show/technical-issue/coach-on-leave/cancel-reason), Attendance (4 join/leave timestamps), Coaching Notes, Weekly Progress Snapshot (as of that session's date), Linked Escalation (if any).

### Screen: Sales
- **Route:** `/admin/sales`. Transaction list from `sales_view`. Search (client/plan). Header shows filtered total ₹.

### Screen: Renewal Opportunities
- **Route:** `/admin/renewals`. Shared `RenewalOpportunitiesClient` (Coach column shown, unlike coach's own view). Two tabs.

### Screen: Reports
- **Route:** `/admin/reports`. 5 fixed report cards (Client, Coach, Monthly PT, Revenue, Cancellation/No-Show), each independently CSV or PDF exportable (PDF via lazily-imported `jspdf`+`jspdf-autotable`, loaded only on first click). No server fetch on page load — each export triggers its own action on demand.

### Screen: Notifications
- **Route:** `/admin/notifications`. Reuses the client portal's `NotificationsClient` verbatim — **inconsistent error-state pattern vs. the rest of the admin portal** (plain red text instead of the standard `EmptyState`, see §19).

### Screen: Activity Log
- **Route:** `/admin/activity-log`. Fully server-rendered. Entity-type filter pills (server-side, full-page `Link` navigation, not client state) — All/Bookings/Subscriptions/Coach Changes/Client Profiles/Coach Profiles/Packages/Settings. Row: action badge (INSERT/UPDATE/DELETE), entity type, actor name ("System" if none, "Unknown" if unresolvable), computed diff summary.

### Screen: Settings
- **Route:** `/admin/settings`. **Package Types card:** list + Edit/Delete per row (Delete is a **soft delete**: `is_active:false`, never a real row delete — explicit confirm-dialog copy: "Clients with an active subscription on this package keep it."); **"+ Add Package"** modal (Name, Category, Sessions, Price, Original Price, Default Pause-Days, Features, Highlight checkbox).
- **Session Rules card:** 4 range sliders (Default Session Duration 30-90min, Cancellation Cutoff 4-48h, Reschedule Cutoff 1-24h, Inactivity Threshold 7-90 days). **"Save Settings"** writes all 4 in parallel. **Only 4 of the platform's 8 `system_settings` keys are exposed here** — see §27 for the full propagation table, including which of these 4 sliders actually change live behavior vs. only a display value.
## 4.D PUBLIC / MARKETING / AUTH (`/`, `/login/*`, `/signup`, `/auth/callback`) — 8 screens

### Screen: Landing Page
- **Route:** `/`. **Roles:** unauthenticated (visitor). Server-rendered, fetches active packages live for the pricing section (the only dynamic content on the page).
- **12 sections in order:** Navbar (3 login buttons + 5 in-page anchor links) → Hero ("Train Live. Anywhere." + "Book Your First Session" → `/signup`) → TrustBar (4 static stats) → CoachingShowsUp (3 value cards) → WhatIsLeanR (4 pillar cards) → HowItWorks (5-step process) → Coaches (draggable carousel, **3 placeholder-named "Hare Krishna" entries sharing one photo** — not final content) → ReadyWhenYouAre ("Continue to Sign Up" → `/signup`) → PricingSection (data-driven, "Get Started" → `/signup` per card) → WhyLeanR (6 benefits) → Testimonials (4 fabricated transformation stories) → Footer (3 login links; **Privacy Policy/Terms of Service both `href="#"` — no legal pages exist**; social icons are non-functional decorative divs).
- **No real embedded video anywhere** — all "live session" visuals are static images + framer-motion mockups.

### Screen: Login (×3 — Client/Coach/Admin)
- **Routes:** `/login/client`, `/login/coach`, `/login/admin`. Same shared `LoginForm` component, parameterized copy/icon/redirect. **No unified login page.**
- **Fields:** Email/Phone (text, `required` — in practice only email works), Password (`required`, show/hide toggle).
- **Submit** → `supabase.auth.signInWithPassword` → role check against `profiles.role`; mismatch → forced sign-out + inline error; match → `router.push(redirectTo)`.
- **"Forgot password?"** — a plain `<button type="button">` with **no onClick handler, no route — completely non-functional.** Confirmed by exhaustive grep: no `/forgot-password` route, no `resetPasswordForEmail` call anywhere in the codebase, at any layer.
- **"Continue with Google"** → `signInWithOAuth` → `/auth/callback`.
- "New here? Create an account" → `/signup` shown **only** on the client login page.

### Screen: Signup
- **Route:** `/signup`. **Roles:** unauthenticated (client-only self-serve — no coach/admin signup route exists anywhere).
- **3-step state machine** (`form → email-otp → phone-otp`):
  1. Full Name/Email/Mobile Number/Password (all required) → client validation (password ≥8 chars, phone regex `/^\+?[0-9]{10,15}$/`) → `supabase.auth.signUp({email, password, options:{data:{role:"client", full_name}}})` — the client-supplied `role` metadata is **inert** (server never honors it, see §10/§24).
  2. Email OTP (6-10 digit numeric, `verifyOtp`, 30s resend cooldown) — skipped if Supabase already returned a session.
  3. Phone OTP (auto-sent on entry, 6-digit, `verifyPhoneOtpAction`→`setMyPhoneAction`, 30s resend cooldown) → `/client/plans`. **"Skip for now (demo — MSG91 not verified yet)"** bypass saves the phone **unverified**.

### Screen: Auth Callback (no UI)
- **Route:** `/auth/callback` (Route Handler, not a page). Exchanges OAuth `code` for a session, resolves `profiles.role`, redirects to that role's dashboard, or `/login/client?error=oauth_failed` on any failure (missing code, exchange error, or unmapped role) — **note: even a coach/admin OAuth failure bounces to the client login page**, not their own portal's login.

### Screen: Not Found (404)
- Generic Next.js `not-found.tsx`. **Needs Verification:** exact copy/behavior not independently re-confirmed in this pass.

---

# 5. Feature Inventory

Master list, categorized. "Mobile Priority" is this document's own recommendation (P0=core/critical, P1=important, P2=secondary, P3=nice-to-have), expanded fully in §29.

| Feature | Role | Screen | Function (service) | API (Server Action) | Database | Dependencies | Mobile Priority |
|---|---|---|---|---|---|---|---|
| Email/password signup | Client | /signup | onboarding/auth flow | `signUp` (Supabase direct) | `auth.users`, `profiles` (trigger) | Supabase Auth | P0 |
| Google OAuth login/signup | All (client-only for new) | /login/*, /signup | — | `signInWithOAuth` (Supabase direct) | `auth.users`, `profiles` (trigger) | Supabase Auth, Google | P0 |
| Phone OTP verification | Client | signup, PhoneGateModal | `sms.service.ts` | `sendPhoneOtpAction`/`verifyPhoneOtpAction` | `profiles.phone` | MSG91 | P1 (currently bypassable) |
| Role-based route protection | All | middleware | — | — | `profiles.role` (JWT claim) | Supabase Auth Hook | P0 |
| Dashboard (per role) | All | */dashboard | `adminDashboard.service.ts` / coach-portal / client-journey | `get*DashboardAction` | multiple | — | P0 |
| Browse/purchase package | Client | /client/plans | `packages.service.ts`, `payments.service.ts` | `createPackagePurchaseOrderAction`, `verifyPaymentAction` | `package_tiers`, `payments`, `subscriptions` | Razorpay | P0 |
| Plan activation | Client | /client/activate | `planPurchase.service.ts` | `activatePlanAction` | `subscriptions` | — | P0 |
| Onboarding intake | Client | /client/onboarding | `onboarding.service.ts` | `submitOnboardingAction` | `client_onboarding`, `progress_logs` | — | P0 |
| Recurring schedule setup/change | Client | /client/schedule | `scheduling.service.ts` | `matchScheduleAction`, `confirmScheduleAction`, `changeScheduleAction` | `recurring_slots`, `bookings` | — | P0 |
| Ad-hoc/demo booking | Client | /client/book, /demo-booking | `bookings.service.ts`, `demoBooking.service.ts` | `confirmBookingAction`, `bookDemoSessionAction` | `temporary_bookings`, `bookings` | Zoom (lazy) | P0 |
| Session cancel | Client/Coach/Admin | /client/sessions, /admin/sessions | `bookings.service.ts` | `cancelSessionAction` | `bookings` | Zoom (delete) | P0 |
| Session reschedule | Client/Admin | /client/sessions, /admin/sessions | `bookings.service.ts` | `rescheduleSessionAction`(+substitute) | `bookings` | Zoom (delete+recreate) | P0 |
| Join live session | Client/Coach | Session cards, Session Detail | `bookings.service.ts` | `ensureZoomMeetingForBooking`(+`markSessionJoinedAction`) | `bookings` | Zoom | P0 |
| Mark attendance | Coach | Task Row, Session Detail | `bookings.service.ts` | `markAttendanceAction` | `attendance`, `bookings` | — | P0 |
| Submit session notes | Coach | Session Detail | `bookings.service.ts` | `submitSessionNotesAction` | `workout_notes`, `bookings` | — | P0 |
| Rate a session | Client | /client/sessions | `bookings.service.ts` | `rateSessionAction` | `bookings`, `coach_profiles.rating` | — | P1 |
| Progress/measurement logging | Client/Admin | /client/progress, gate modal | `progressLogs.service.ts` | `submitMyProgressAction`, `logMeasurementAction` | `progress_logs` | — | P0 |
| Coach change request/completion | Client/Admin | /client/coach, admin queue | `coachChange.service.ts` | `requestCoachChangeAction`...`completeCoachChangeAction` | `coach_change_requests`, `recurring_slots`, `bookings` | — | P1 |
| Coach leave request/approval | Coach/Admin | /coach/availability, admin queue | `availability.service.ts` | `requestLeaveAction`, `resolveLeaveAction` | `coach_leave` | — | P1 |
| Shadow coach coverage (auto + manual) | Admin (system) | Leave approval, Shadow Coverage queue | `coachChange.service.ts`, `scheduling.service.ts` | `assignShadowCoach`, `previewShadowAssignmentPlanAction`, `confirmShadowAssignmentPlanAction` | `shadow_coach_assignments`, `bookings` | — | P1 |
| Escalation raise/resolve | Client/Coach(read)/Admin | /client/concerns, admin queue | `escalations.service.ts` | `raiseConcernAction`...`resolveEscalationAction` | `escalations`, `escalation_notes` | — | P1 |
| Chat | Client/Coach/Admin(read) | */chats | `chat.service.ts` | `sendChatMessageAction`, `markConversationReadAction` | `conversations`, `messages` | Supabase Realtime | P0 |
| Subscription pause/resume | Client/Admin | /client/subscription, Client Detail | `subscriptions.service.ts` | `pauseMySubscriptionAction`/`resumeMySubscriptionAction` | `subscriptions` | — | P1 |
| Subscription session/pause-days adjustment | Admin | Client Detail | `subscriptions.service.ts` | `adjustClientSessionsAction`, `adjustPauseDaysAction` | `subscriptions` | — | P2 (admin) |
| Client migration (Add Client wizard) | Admin | /admin/clients/new | `clients.service.ts` | `createMigratedClientAction` | `auth.users`, `client_profiles`, `subscriptions`, `recurring_slots` | — | P2 (admin) |
| Coach creation | Admin | /admin/coaches/new | `coaches.service.ts` | `createCoachAction` | `auth.users`, `coach_profiles`, `coach_availability` | — | P2 (admin) |
| Coach transfer / bulk reassignment | Admin | Client/Coach Detail | `clients.service.ts` | `transferClientCoachAction`, `reassignCoachClientsAction` | `recurring_slots`, `bookings` | — | P2 (admin) |
| Coach working-hours management | Admin | Coach Detail | `availability.service.ts` | `setCoachAvailabilityAction` | `coach_availability` | — | P2 (admin) |
| Refund logging (audit-only) | Admin | Client Detail | `audit.service.ts` | `logRefundRequestAction` | `audit_logs`, `client_timeline_events` | none — no payment gateway integration | P3 |
| Reports export (CSV/PDF) | Admin | /admin/reports | `admin-reports.actions.ts` | `generate*ReportAction` (×5) | multiple views/tables | jsPDF (client-side) | P3 (web-recommend) |
| Renewal opportunity tracking | Coach/Admin | /*/renewals | `renewals.service.ts` | `getRenewalOpportunitiesAction` | `subscriptions`, `client_profiles` | — | P1 |
| Activity/Audit log | Admin | /admin/activity-log | `audit.service.ts` | `getAuditLogAction` | `audit_logs` | — | P2 (admin) |
| Platform settings | Admin | /admin/settings | `settings.service.ts` | `updateSettingAction` | `system_settings` | — | P2 (admin) |
| Package catalog management | Admin | /admin/settings | `packages.service.ts` | `createPackageAction`/`updatePackageAction` | `package_tiers` | — | P2 (admin) |
| Notifications (in-app) | All | */notifications | `notifications.service.ts` | `listMyNotificationsAction`, `markNotificationReadAction` | `notifications`, `notification_templates` | Resend (email), MSG91 (SMS) | P0 |
| Global client search | Coach/Admin | */search | `clients.service.ts` | `searchAllClientsAction`/`searchAdminClientsAction` | `client_profiles` | — | P1 |
| Session-reminder notifications | System (all) | — (background) | `sessionNotifications.service.ts` | `GET /api/cron/session-reminders` | `bookings.reminder_sent_at` | GitHub Actions (external trigger) | P1 |

---

# 6. Business Logic

Every rule below is stated in the requested IF/THEN/ELSE form and is drawn from the literal service-layer code (not inferred from UI copy).

### Booking eligibility
```
IF client.measurementsStale (last progress log ≥7 days old, or never logged)
→ THEN any booking/demo-booking/session-join attempt is rejected server-side
  ("Please update your measurements before booking a session/demo.")
→ ELSE booking proceeds to availability/conflict checks
```
```
IF subscription has a subscriptionId AND (upcoming + completed bookings against it) >= sessions_total
→ THEN confirm_booking() rejects ("No sessions remaining on this package")
→ ELSE booking is created
(No equivalent check exists for demo/assessment bookings — eligibility there is gated purely by
 "has this client ever demoed", not a credit count.)
```

### Cancellation / Reschedule
```
IF role === client AND hoursUntilStart < cancellation_cutoff_hours (default 12)
→ THEN cancel is rejected server-side, regardless of UI button state
→ ELSE (role === admin, OR client outside the cutoff) cancel proceeds
```
```
IF role === client AND hoursUntilStart < reschedule_cutoff_hours (default 1)
→ THEN reschedule is rejected
IF role === client AND reschedules-this-week >= 2
→ THEN reschedule is rejected ("maximum reschedule limit for this week")
IF role === client AND the new date already has another upcoming booking for this client
→ THEN reschedule is rejected ("You already have another session booked on that day.")
→ ELSE reschedule proceeds (admin bypasses all three checks)
```

### Coach leave
```
IF hoursUntil(leave.starts_on midnight IST) < 24
→ THEN leave request is rejected, unconditionally, no admin bypass
→ ELSE leave request is accepted at status "pending"
IF leave.leaveType === "partial" AND leave.starts_on !== leave.ends_on
→ THEN rejected ("Partial-day leave must be a single date.")
```
```
IF admin approves a leave request
→ THEN for every active client of that coach, the system searches for and auto-assigns the
     best-scoring available shadow coach PER OCCURRENCE in the leave window
→ ELSE (admin rejects) no cascade runs at all
IF any occurrence has zero available shadow candidates
→ THEN it is flagged (never silently dropped) and every admin is alerted
```

### Escalations
```
IF escalation.called_client_at IS NULL
→ THEN every state-changing action (classify, add note, mark in-progress, resolve) is rejected
     server-side ("Call the client and discuss the issue before updating this escalation.")
→ ELSE (admin has confirmed the call) the full resolution workflow unlocks
```

### Coach change
```
IF admin approves a coach-change request AND picks a new coach in the same action
→ THEN the client's existing recurring pattern is repointed to the new coach immediately (same day/time)
→ ELSE IF approved without a coach picked → client must self-serve search+confirm afterward
→ ELSE (rejected) → client notified, no further action possible on this request
```

### Client status (derived, never stored — the single source of truth for "what state is this client in")
```
IF any subscription.status === "paused" → status = "paused"  (highest priority, even if another sub is active)
ELSE IF any subscription.status === "active" → status = "active"
ELSE IF any subscription.status === "awaiting_activation" → status = "created"
ELSE IF the client has ANY subscription ever → status = "expired"
ELSE IF the client has a demo booking → status = "demo"
ELSE → status = "not_paid"
```

### Chat
```
IF client has never purchased any subscription
→ THEN no conversation is ever created, regardless of coach assignment (even for a demo)
IF a client's coach changes
→ THEN the old conversation is permanently closed (status="closed") and a new one opens with the new coach
     — history is never merged or deleted; the former coach retains read-only access forever
IF conversation.status === "closed"
→ THEN neither participant can send new messages (RLS-enforced), only read history
```

### Ratings
```
IF client has rated any booking within the last 7 days
→ THEN rateBooking() rejects a new rating attempt, GLOBALLY across all their bookings (not per-booking)
IF the booking being rated is not status="completed" or not owned by the caller
→ THEN the update matches zero rows and fails
```

### Renewal thresholds (two distinct, deliberately different)
```
IF client's own sessionsRemaining <= 5 (SESSIONS_LOW_THRESHOLD)
→ THEN client sees a "running low" nudge AND is allowed to self-serve renew despite already having an
     "active" subscription (this exact threshold relaxes the normal "you already have a plan" block)
IF client's sessionsRemaining <= 10 (RENEWAL_OPPORTUNITY_THRESHOLD) [staff-facing, wider/earlier]
→ THEN the client appears on the coach's/admin's "Renewal Opportunities" list
```

---

# 7. Database Documentation

Derived from all 57 Postgres migrations (`supabase/migrations/0001`–`0057`), reconciled to final state. Every CHECK constraint and enum-membership rule is a form-validation rule the mobile client must also enforce client-side for good UX (the server/DB will reject invalid data regardless).

## 7.1 Enums

| Enum | Values | Used by |
|---|---|---|
| `user_role` | admin, coach, client | `profiles.role` |
| `account_status` | active, suspended | `profiles.account_status` |
| `coach_status` | active, inactive, on-leave | `coach_profiles.status` |
| `client_status` | active, inactive, paused | `client_profiles.status` (raw; UI always uses the *derived* 6-bucket status, §6) |
| `package_category` | advance, addon | `package_tiers.category` |
| `subscription_status` | active, inactive, paused, awaiting_activation | `subscriptions.status` |
| `session_type` | assessment, regular | `bookings.session_type` — **no distinct "demo" value exists**, despite demo being a first-class, separately-billed concept (`payments.purpose='demo_session'` uses free text instead) |
| `booking_status` | upcoming, completed, cancelled, missed | `bookings.status` |
| `shift_source` | generated, override | `coach_shifts.source` |
| `leave_status` | pending, approved, rejected | `coach_leave.status` |
| `recurring_slot_status` | active, paused, cancelled | `recurring_slots.status` (`paused` never set by any code) |
| `temporary_booking_status` | held, confirmed, expired, **released** (never set) | `temporary_bookings.status` |
| `assessment_status` | scheduled, completed, cancelled, missed | `assessment_sessions.status` |
| `shadow_assignment_status` | active, **completed** (never set), cancelled | `shadow_coach_assignments.status` |
| `coach_change_status` | pending, approved, rejected | `coach_change_requests.status` |
| `attendance_status` | present, absent, late | `attendance.status` |
| `notification_type` | booking, reminder, **feedback** (never used by any of ~40 templates), system | `notifications.type` |
| `escalation_status` | open, in_progress, resolved | `escalations.status` |
| `fitness_goal` | fat_loss, muscle_gain, strength, general_fitness, rehabilitation | `client_onboarding.fitness_goal` |
| `leave_type` | full_day, partial | `coach_leave.leave_type` |

## 7.2 Tables (final shape; ★ marks a form-validation-relevant constraint)

### Identity
- **`profiles`** — PK `id` (FK→auth.users, CASCADE). `role` ★(one of 3), `full_name` ★(required, non-blank expected though DB allows empty string), `phone`, `photo_url`, `account_status`, `emergency_contact`.
- **`coach_profiles`** — `profile_id` (unique FK). `specialization`, `secondary_specializations[]`, `years_experience`, `bio`, `certifications[]`, `languages[]`, `rating` ★(0-5), `review_count`, `status`, `employee_code` (unique), `max_capacity` (default 50), `gender` ★(male/female/other), `skills[]` (append-only via RPC).
- **`client_profiles`** — `profile_id` (unique FK). `medical_notes`, `equipment[]`, `goals[]`, `joined_date`, `status`, `client_code` (unique, sequence-generated `CL0001`-style).
- **`client_onboarding`** — `client_id` (unique FK, one row per client, app-layer-enforced "insert once"). `age`, `gender` ★, `height_cm`, `weight_kg`, `medical_conditions`, `injuries`, `medications`, `exercise_restrictions`, `fitness_goal` ★, `submitted_at`.

### Commerce
- **`package_tiers`** — `name`, `category`, `sessions_count` ★(>0), `price` ★(≥0), `original_price`, `features[]`, `highlighted`, `is_active`, `default_pause_days`.
- **`subscriptions`** — `client_id`, `package_id` (FK, RESTRICT), `sessions_total` ★(>0), `status`, `started_at`, `paused_at`, `resumed_at`, `activated_at`, `pause_days_allowed` (`pause_days_used` deliberately not stored — derived from timeline events).
- **`payments`** — `client_id`, `purpose` ★(package_purchase|demo_session), `package_id`/`demo_coach_id`/`demo_slot_start`, `amount` ★(≥0), `currency`, `razorpay_order_id` (unique), `razorpay_payment_id`, `razorpay_signature`, `status` ★(created|paid|failed|paid_unfulfilled), `subscription_id`/`booking_id`, `paid_at`. No client/coach write policy at all.

### Scheduling
- **`coach_availability`** — `coach_id`, `day_of_week` ★(0-6), `start_time`/`end_time` ★(end>start), `is_active`. **Admin-write-only** (coach write access revoked migration 0045).
- **`coach_shifts`** — `coach_id`, `shift_date`, `start_time`/`end_time` ★(end>start), `source`. Coach-manageable (unaffected by 0045). **Overrides the weekly template entirely for that date, not merged** — never queried by any client/admin-facing "open slots" UI (a real, silent UI/DB-truth gap).
- **`coach_leave`** — `coach_id`, `starts_on`/`ends_on` ★(ends≥starts), `reason`, `status`, `leave_type`, `partial_start_time`/`partial_end_time` ★(both-or-neither, end>start, single-day-only for partial).
- **`recurring_slots`** — `client_id`, `coach_id`, `subscription_id` (FK SET NULL), `day_of_week` ★, `start_time`, `duration_minutes` ★(>0, default 45), `status`.
- **`temporary_bookings`** — `client_id`, `coach_id`, `slot_start`, `duration_minutes` ★(>0), `expires_at`, `status`. **Never queried directly by app code** — purely an internal RPC-mediated implementation detail.
- **`assessment_sessions`** — pre-signup prospect lead capture (`prospect_name` ★required, `prospect_email`/`phone`, `assigned_coach_id`, `scheduled_start`, `status`, `converted_client_id`).
- **`bookings`** — the central table. `client_id`, `coach_id`, `subscription_id`/`recurring_slot_id`/`assessment_session_id` (nullable FKs), `scheduled_start`, `duration_minutes` ★(>0), `session_type`, `status`, `cancelled_by`/`cancel_reason`, `escalation_id`, `no_show_party` ★(client|coach), `technical_issue`/`coach_on_leave`/`was_rescheduled`/`original_scheduled_start`, `amount_paid`, `quality_rating`/`trainer_rating` ★(1-5 each)/`rating_note`/`rated_at`, `attendance_overdue`, `zoom_meeting_id`/`zoom_join_url`/`zoom_start_url`, `coach_joined_at`, `notes_overdue`, `reminder_sent_at`. **Hard exclusion constraint** `bookings_no_coach_overlap` (GIST index) — a coach can never have two overlapping `upcoming` bookings, enforced unconditionally at the database level, the strongest form-validation rule in the whole schema.

### Continuity (coach handoffs)
- **`shadow_coach_assignments`** — `client_id`, `primary_coach_id`, `shadow_coach_id` ★(must differ from primary), `starts_on`/`ends_on` ★(ends≥starts), `reason`, `status`.
- **`coach_change_requests`** — `client_id`, `current_coach_id`, `new_coach_id` (nullable), `reason`, `status`, `resolved_by`/`resolved_at`, `overall_experience`/`coach_rating` ★(1-5 each), `additional_comments`.

### Session content
- **`attendance`** — `booking_id` (unique FK, 1:1), `status` ★(required, one of 3), `checked_in_at`/`checked_out_at`, `marked_by`, `client_joined_at`/`client_left_at`/`coach_joined_at`/`coach_left_at`.
- **`workout_notes`** — `booking_id` (unique FK, 1:1), `client_id`, `coach_id`, `notes` (UI label: "Session Summary"), `homework`, `exercises_performed`, `performance_rating` ★(excellent|good|average|needs_improvement), `improvements[]`, `additional_remarks`.
- **`progress_logs`** — `client_id`, `logged_at`, `weight`, `body_fat_pct`, `streak_count`, `notes`, `photo_url`, `muscle_pct`, `waist`, `chest`, `hip`, `arms`, `thigh`. App-layer (not DB) enforces the once-per-7-days cap.
- **`client_timeline_events`** — `client_id`, `event_type` (free text, 27-type union enforced only in TS), `title`, `description`, `metadata` (jsonb), `actor_id`. **Append-only — no update/delete RLS policy for any role, including admin.**

### Escalations
- **`escalations`** — `client_id`, `coach_id`, `raised_by` (null=admin-logged), `reason` ★(required), `description`, `status`, `resolved_by`/`resolved_at`/`resolution_notes`, `category` ★(7 fixed values, matches the client-facing dropdown exactly), `admin_issue_type`, `fault` ★(coach|client|platform|third_party|none|other, admin-internal only, never client/coach-facing), `admin_summary`, `called_client_at`/`called_by` (the call-gate).
- **`escalation_notes`** — `escalation_id`, `author_id`, `note` ★(required). Append-only, client-visible, admin-authored only.

### Communication
- **`notification_templates`** — `key` (unique), `type`, `title_template`/`body_template` (`{{var}}` placeholders). ~40 rows seeded incrementally across 10 migrations — see §14 for the full catalog.
- **`notifications`** — `user_id`, `template_key`, `type`, `title`, `message`, `related_entity_type`/`id`, `read`, `channels` (jsonb, schema exists, **never populated by any code**).
- **`conversations`** — `client_id`, `coach_id`, `status` ★(active|closed), `opened_at`/`closed_at`. **Unique partial index: at most one `active` row per client.** No client/coach write policy — system-managed only.
- **`messages`** — `conversation_id`, `sender_role` ★(client|coach), `sender_profile_id`, `body` (nullable), `attachment_url`, `read_at`. ★Combined CHECK: body **or** attachment must be present, never neither (loosened from an original mandatory-body constraint to support image-only messages).

### Platform / ops
- **`audit_logs`** — `actor_id`, `action` (INSERT/UPDATE/DELETE), `entity_type`, `entity_id`, `old_data`/`new_data` (jsonb whole-row snapshots), `created_at`. Written exclusively by a DB trigger on **7 tables only**: `bookings`, `subscriptions`, `coach_change_requests`, `client_profiles`, `coach_profiles`, `package_tiers`, `system_settings` — no other table is auto-audited.
- **`system_settings`** — `key` (PK), `value` (jsonb), `description`, `updated_at`. 8 total keys — see §27 for the full propagation analysis (only 4 have any admin UI; 2 of those 4 are effectively dead).

## 7.3 Views (all `security_invoker=true`)

`subscription_usage_view` (sessions_used/remaining, counts only *completed* — note this **differs** from `confirm_booking`'s own credit check, which counts upcoming+completed), `coach_utilization_view`, `revenue_trend_view` (6-month, priced at *current* package price not sale-time — retroactively changes if a price is later edited), `bookings_by_hour_view`, `inactive_clients_view` (**confirmed never queried by any application code** — fully dead alongside the `inactivity_threshold_days` setting it depends on), `sales_view` (transaction-level, same current-price caveat).

## 7.4 Key Functions/RPCs (called via `.rpc()` from app code)

`is_slot_within_working_hours`, `has_scheduling_conflict` (the two conflict-safety chokepoints — called from nearly every scheduling write path; also opportunistically sweep `expire_temporary_bookings`/`mark_missed_bookings` as side effects, no cron involved), `create_temporary_booking`/`confirm_booking` (hold→confirm; the latter carries the session-credit check since migration 0053, and had a stale, credit-check-bypassing 5-argument overload silently coexisting until explicitly dropped in that same migration), `generate_bookings_from_recurring_slot`, `cancel_booking`/`reschedule_booking` (cutoff-enforcing — **the current `reschedule_booking` body, migration 0041, silently stopped writing `was_rescheduled`/`original_scheduled_start`, a regression from the original 0018 behavior with no later fix — see §19**), `assign_shadow_coach`/`reassign_shadow_coverage`, `mark_missed_bookings`/`expire_temporary_bookings`/`flag_overdue_attendance`/`flag_overdue_notes` (all opportunistic, no cron), `append_coach_skill` (append-only, SECURITY DEFINER with its own ownership re-check), `custom_access_token_hook` (Auth Hook injecting `user_role` into JWTs — requires a manual, non-migratable Supabase Dashboard toggle), plus RLS helpers `is_admin()`/`my_role()`/`my_coach_id()`/`my_client_id()`/`coach_client_linked()`.

## 7.5 RLS Authorization Model (condensed per table)

`is_admin()` grants full access everywhere (omitted below). General shape: a user always owns their own `profiles` row; `coach_profiles` is fully readable by any authenticated user (booking flow needs to browse coaches); `client_profiles`/`profiles`(-as-client)/`client_timeline_events` were widened in migration 0033 to let **any** coach read **any** client's identity+narrative (global search) while `progress_logs` was deliberately **not** widened (health data stays assigned-only); `bookings` rows are globally *readable* by any authenticated user (deliberate tradeoff for slot-availability checks) but writable only by the owning client/coach, with a **BEFORE UPDATE trigger** (migration 0052) closing the column-level gap RLS itself cannot express — without it, a client/coach could PATCH `status`/`scheduled_start`/`coach_id`/`amount_paid` directly via PostgREST, bypassing every cutoff/conflict rule the RPCs enforce; `messages` has an equivalent trigger restricting a non-admin's UPDATE to `read_at` only; `client_timeline_events`, `audit_logs`, `payments`, `conversations` have **no client/coach write policy at all** — system/trigger/service-role-written only.

## 7.6 Storage Buckets

| Bucket | Public? | Status |
|---|---|---|
| `avatars` | public read, owner write | **Actively used** (profile photo uploads across all 3 portals) |
| `chat-attachments` | public read, participant-scoped write | **Actively used** (chat images) |
| `progress-photos` | private | **Schema-only — never referenced by any application code** |
| `coach-certifications` | private | **Schema-only — never referenced by any application code** |

## 7.7 Entity Relationship Summary

```
auth.users → profiles → {coach_profiles, client_profiles}
client_profiles → client_onboarding (1:1)
{client_profiles, coach_profiles} → recurring_slots → subscriptions (0:1)
recurring_slots → generates → bookings ← assessment_sessions (0:1, demo conversion)
bookings → attendance (1:1), workout_notes (1:1)
client_profiles → progress_logs (1:N), client_timeline_events (1:N, append-only)
package_tiers → subscriptions → payments (0:N) → bookings (0:1) / subscriptions (0:1)
{client_profiles, coach_profiles} → conversations (≤1 active) → messages (1:N)
{client_profiles, coach_profiles, profiles} → escalations → escalation_notes (1:N)
shadow_coach_assignments: client_id, primary_coach_id, shadow_coach_id → their respective profiles
coach_change_requests: client_id, current_coach_id, new_coach_id, resolved_by → profiles
notification_templates → notifications → profiles
audit_logs → profiles (actor, 7-table coverage only); system_settings (standalone key-value)
```

## 7.8 Schema Evolution Notes Most Relevant to a Mobile Rebuild

1. **A real IST/UTC timezone bug** (fixed migration 0026) — pre-fix booking/leave/shadow-assignment data may be off by 5.5 hours.
2. **Cancel vs. reschedule cutoffs were split from one shared setting into two** (migration 0025) — a subtle repurposing of an existing key's meaning, not just a new key.
3. **Rating model split** (migration 0030) — `rating`/`client_feedback` are legacy, superseded by `quality_rating`/`trainer_rating`/`rating_note`/`rated_at`.
4. **Coach availability write access revoked from coaches** (migration 0045).
5. **Global client visibility for coaches added** (migration 0033), deliberately excluding `progress_logs`.
6. **A real, documented role-escalation vulnerability and its fix** spans migrations 0002→0040→0050→0051→0055 — role must never be trusted from a public-signup-suppliable field, on any platform (see §24).
7. **Column-level RLS gaps closed by triggers, not RLS** (migration 0052) — a materially incomplete picture would result from describing only RLS for `bookings`/`messages`.
8. **A real session-credit-check bypass existed for ~40 migrations** (0011→0053), requiring an explicit `DROP FUNCTION` of a stale overload to fully close.
9. **A silent regression in `reschedule_booking()`** (migration 0041) stopped populating `was_rescheduled`/`original_scheduled_start` — never fixed in any later migration. **Confirmed still broken as of the current schema.**
10. **`temporary_booking_status.released`, `recurring_slots.status='paused'`, `shadow_coach_assignments.status='completed'`, `notification_type.feedback`** are all defined enum values with **zero producing code paths** anywhere in 57 migrations — dead/reserved values, not planned states to reproduce.
11. **Storage `avatars` bucket has duplicated, redundant RLS policies** from migrations 0013 and 0046 (harmless but should be consolidated in a rebuild).

---

# 8. Data Flow

For every major feature: USER ACTION → FRONTEND → SERVER ACTION → SERVICE/BUSINESS LOGIC → DATABASE → THIRD-PARTY SERVICE → RESPONSE → UI UPDATE.

## 8.1 Booking Creation (ad-hoc / demo)
```
Client selects a slot → BookSessionClient/DemoBookingClient
→ confirmBookingAction / bookDemoSessionAction
→ (gate: measurements not stale) → createBooking() [bookings.service.ts]
  → holdSlot() → RPC create_temporary_booking (checks is_slot_within_working_hours + has_scheduling_conflict,
      INSERT temporary_bookings status='held')
  → confirmHold() → RPC confirm_booking (re-checks conflict + session-credit if a real subscription is involved,
      INSERT bookings status='upcoming', UPDATE temporary_bookings status='confirmed')
→ ensureConversationForCoachAssignment() (safety net for chat)
→ Zoom: NOT called yet (lazy, only on first Join)
→ notifications: session_booked_client/coach OR demo_booked_client/coach
→ RESPONSE: bookingId
→ UI: success card, journey stage re-evaluates
```

## 8.2 First-Time Recurring Schedule Setup
```
Client picks Time+Pattern → ScheduleSetupClient → matchScheduleAction (fallback ladder) → confirmScheduleAction
→ createRecurringSlots() [scheduling.service.ts]: per day, INSERT recurring_slots (active) → RPC
  generate_bookings_from_recurring_slot(slotId, 4) — walks up to 60 future dates, skips leave/conflicts,
  INSERTs up to 4 bookings rows (upcoming)
→ logTimelineEvent (coach_assigned if first coach, slot_assigned) → ensureConversationForCoachAssignment
→ notifications: schedule_assigned_client/coach
→ RESPONSE: createdSlotIds[]
→ UI: journey stage → "active"; dashboard/sessions reflect the new pattern
```

## 8.3 Cancellation
```
Client/Coach/Admin clicks Cancel → cancelSessionAction/ConfirmDialog
→ cancelBooking() [bookings.service.ts]: enforceCutoff = role !== admin
  → RPC cancel_booking (requires status=upcoming; cutoff check; UPDATE status=cancelled, cancelled_by,
    cancel_reason; if from a recurring slot, calls generate_bookings_from_recurring_slot(slotId,1) to backfill)
→ cleanupZoomMeeting (Zoom DELETE, best-effort, errors swallowed) → logTimelineEvent(session_cancelled)
→ notifications: client-initiated → coach + admins; staff-initiated → client (with reason)
→ RESPONSE: void
→ UI: booking moves to Cancelled tab / admin Scheduling "cancelled" bucket
```

## 8.4 Reschedule
```
Client picks new time (own coach, browsed slot, or specific-time-check w/ substitute fallback) → RescheduleModal
→ rescheduleSessionAction / rescheduleSessionToSubstituteAction
→ rescheduleBooking() [bookings.service.ts]: client-only checks (30-day window, 2/week cap, no same-IST-day
  double-booking) → RPC reschedule_booking (cutoff check; re-validates target coach's availability+conflict;
  UPDATES the SAME row's scheduled_start/duration_minutes/coach_id in place — preserving attendance/notes FKs)
  *** does NOT currently set was_rescheduled/original_scheduled_start — a confirmed regression (§19) ***
→ cleanupZoomMeeting (old meeting deleted; new one lazily created on next Join)
→ logTimelineEvent(session_rescheduled)
→ notifications: client always; coach if admin acted; coach+admin if client acted
→ RESPONSE: void
→ UI: booking's date/coach update immediately in the client's own view; the "Rescheduled" tab/bucket/badge
  elsewhere in the app does NOT reflect it due to the regression above
```

## 8.5 Plan Purchase (Razorpay) — full detail in §12
```
Client clicks Purchase Plan → createPackagePurchaseOrderAction → createRazorpayOrder() → POST
  api.razorpay.com/v1/orders → INSERT payments (status=created)
→ Razorpay Checkout modal (browser) → user pays
→ Checkout success callback → verifyPaymentAction → verifyAndFulfillPayment(): local HMAC signature check
  (the sole trust boundary) → purchaseMyPlan() → INSERT subscriptions (awaiting_activation) → UPDATE
  payments (paid, subscription_id)
→ [parallel safety net] Razorpay webhook → POST /api/webhooks/razorpay → fulfillPaymentByWebhook() (only
  acts if the client-side callback never fired)
→ RESPONSE: subscriptionId
→ UI: "Congratulations!" modal → dismiss → dashboard → journey stage "awaiting_activation"
```

## 8.6 Plan Activation
```
Client picks start date (≥tomorrow IST) → activatePlanAction → activateMyPlan(): one-time lock check →
  UPDATE subscriptions (active, activated_at) → renewal-supersede: any OTHER active sub for this client →
  inactive
→ logTimelineEvent(plan_activated) → notifyClient(plan_activated_client)
→ UI: journey stage re-evaluates (onboarding → renewal steps → slot_selection → active)
```

## 8.7 Coach Leave → Automatic Shadow-Coverage Cascade — full detail in §26/§6
```
Coach submits leave (requestLeaveAction) → INSERT coach_leave (pending)
→ Admin approves (resolveLeaveAction) → UPDATE coach_leave (approved) → notifyUser(coach) →
  listActiveClientIdsForCoach() → notifyUser(each client, coach_on_leave_client)
→ FOR EACH client: findShadowCoachCandidates() [per-occurrence, scored] → planShadowAssignments()
  [greedy, grouped] → assignShadowCoach() [RPC, INSERT shadow_coach_assignments + UPDATE bookings.coach_id]
→ cascade: any client this coach was ITSELF shadow-covering → reassignShadowCoverage()
→ uncovered occurrences → notifyAdmins(admin_alert)
→ UI: admin sees inline assigned/unassigned summary; client sees shadow badge on affected sessions
```

## 8.8 Escalation Creation → Call-Gate → Resolution — full detail in §6/§16
```
Client/Admin raises concern → createEscalation() → INSERT escalations (open) → logTimelineEvent →
  [if coach linked] notifyUser(coach, escalation_raised_to_coach)
→ Admin: confirmCalledClientAction → UPDATE escalations.called_client_at (UNLOCKS everything else)
→ [optional] updateEscalationDetailsAction, addEscalationNoteAction, markEscalationInProgressAction
→ resolveEscalationAction → requireCalledClient() gate → UPDATE escalations (resolved) →
  logTimelineEvent(escalation_resolved) → notifyUser(client, escalation_resolved_client)
→ UI: client's Concerns list shows resolution; admin/coach Active tab drops it
```

## 8.9 Coach Change Request → Approval → Completion
```
Client requests change → INSERT coach_change_requests (pending)
→ Admin: Branch A (approve + pick coach) → reassignClientCoach() [repoints recurring_slots/bookings
  immediately, sends coach_changed_client] — DONE, no further client action
   OR Branch B (approve-blank / reject) → notifyUser(client, coach_change_request_approved/rejected_client)
   → [Branch B only] client: findCoachChangeOptionsAction → completeCoachChangeAction (retires old pattern,
     createRecurringSlots for the new coach, sets new_coach_id)
```

## 8.10 Attendance → Session Notes — full detail in §4.B Session Detail
```
Coach clicks Present/Late/Absent → markAttendanceAction → markAttendance() [server gates: session ended;
  today's-session-requires-joined] → UPSERT attendance → CLEAR attendance_overdue
  → Absent: UPDATE bookings (missed, no_show_party=client) — TERMINAL, no notes phase
  → Present/Late: logs timeline, notifications fire, notes phase unlocks
→ Coach fills notes → submitSessionNotesAction → submitSessionNotes() [server gate: attendance present/late]
  → INSERT workout_notes → UPDATE bookings (completed) — TERMINAL
```

---

# 9. API Documentation

**Critical framing:** there is no conventional REST/GraphQL API. Every "endpoint" below is a Next.js **Server Action** (an async TypeScript function marked `"use server"`, invoked from a React component like a local function call, transported over Next.js's internal RSC action-encoding — not a URL a mobile HTTP client can hit directly) OR one of the **two real HTTP Route Handlers** in the entire app. This section documents both in the closest equivalent to the requested endpoint format.

## 9.1 The Two Real HTTP Endpoints

### `POST /api/webhooks/razorpay`
- **Purpose:** server-to-server payment reconciliation safety net.
- **Authentication:** HMAC-SHA256 signature over the **raw** request body, header `x-razorpay-signature`, secret `RAZORPAY_WEBHOOK_SECRET` (separate from the API key secret).
- **Role required:** none (external caller — Razorpay's servers).
- **Request:** Razorpay's standard webhook payload; only `event.event === "payment.captured"` is handled (`order.paid` ignored as redundant).
- **Response:** always `200 { received: true }` regardless of internal outcome (by design — a retry can't fix an application bug; failure downgrades the payment to `paid_unfulfilled` for manual follow-up instead).
- **Database changes:** `payments` (status update), transitively `subscriptions`/`bookings` if fulfillment succeeds.
- **Side effects:** none beyond the above; errors are logged, never thrown to the caller.

### `GET /api/cron/session-reminders`
- **Purpose:** the one time-based job — emails/notifies both parties ~6h before a session.
- **Authentication:** `Authorization: Bearer <CRON_SECRET>` if the env var is set; **otherwise the endpoint is effectively public** (a stated, real risk — see §19/§24).
- **Role required:** none (system trigger — actual caller is a GitHub Actions workflow, not Vercel Cron, see §26).
- **Request:** no body.
- **Response:** `{ ok, checked, sent }`.
- **Database changes:** `bookings.reminder_sent_at` stamped per processed booking (the actual de-dupe guard, not the query window).
- **Side effects:** email + notification row per party; per-booking errors are caught individually so one bad row never aborts the sweep.

## 9.2 Server Action Reference (representative catalog — full list is the 34 files in `src/lib/actions/`)

For each, the "role required" is enforced by `requireRole()` inside the underlying service function (a second, friendlier layer in front of the real RLS boundary — see §10/§24).

| Action | Purpose | Role | Request | DB Changes | Side Effects |
|---|---|---|---|---|---|
| `confirmBookingAction` | Confirm an ad-hoc/first booking | client | `{slotStart, durationMinutes, sessionType}` | `temporary_bookings`, `bookings` insert | notification |
| `bookDemoSessionAction` | Book a free demo | client | `{date, preferredTime?, genderPreference?}` | `bookings` insert (session_type=assessment) | notification |
| `cancelSessionAction` | Cancel an upcoming session | client/coach/admin | `bookingId, reason?` | `bookings` update (+regenerate if recurring) | notification, Zoom delete |
| `rescheduleSessionAction` / `rescheduleSessionToSubstituteAction` | Move a session | client/admin | `bookingId, newStart, [newCoachId]` | `bookings` update in place | notification, Zoom delete+lazy-recreate |
| `markSessionJoinedAction` | Coach joins Zoom | coach | `bookingId` | `bookings.coach_joined_at` | opens Zoom in new tab |
| `markAttendanceAction` | Record attendance | coach | `bookingId, status, remark?` | `attendance` upsert, `bookings` (if absent) | notification |
| `submitSessionNotesAction` | Close out a session | coach | `bookingId, {summary,...}` | `workout_notes` insert, `bookings.status='completed'` | none |
| `rateSessionAction` | Rate a completed session | client | `bookingId, qualityRating, trainerRating, note?` | `bookings` update, `coach_profiles.rating` recompute | none |
| `createPackagePurchaseOrderAction` | Start a Razorpay order | client | `packageId` | `payments` insert | Razorpay API call |
| `verifyPaymentAction` | Verify + fulfill a payment | client | `orderId, paymentId, signature` | `payments`, `subscriptions`/`bookings` | notification |
| `activatePlanAction` | Activate a purchased plan | client | `subscriptionId, startDate` | `subscriptions` update | notification |
| `submitOnboardingAction` | Submit intake form | client | onboarding fields | `client_onboarding`, `progress_logs` insert | timeline log |
| `matchScheduleAction`/`confirmScheduleAction`/`changeScheduleAction` | Recurring schedule setup/change | client | pattern/time/coach fields | `recurring_slots`, `bookings` | notification, chat conversation |
| `requestCoachChangeAction`/`resolveCoachChangeRequestAction`/`completeCoachChangeAction` | Coach change lifecycle | client/admin | see §6 | `coach_change_requests`, `recurring_slots`, `bookings` | notification |
| `requestLeaveAction`/`resolveLeaveAction` | Coach leave lifecycle | coach/admin | see §6 | `coach_leave`, `shadow_coach_assignments`, `bookings` | notification (cascading) |
| `previewShadowAssignmentPlanAction`/`confirmShadowAssignmentPlanAction` | Manual shadow coverage | admin | clientId, coachId, dates | `shadow_coach_assignments`, `bookings` | notification |
| `raiseConcernAction`/`confirmCalledClientAction`/`updateEscalationDetailsAction`/`addEscalationNoteAction`/`markEscalationInProgressAction`/`resolveEscalationAction` | Escalation lifecycle | client/admin | see §6 | `escalations`, `escalation_notes` | notification |
| `sendChatMessageAction`/`markConversationReadAction` | Chat | client/coach | conversationId, body/attachmentUrl | `messages` | notification, Realtime broadcast |
| `submitMyProgressAction`/`logMeasurementAction` | Progress logging | client/admin | 8 numeric fields | `progress_logs` insert | notification (client-initiated only) |
| `pauseMySubscriptionAction`/`resumeMySubscriptionAction` | Self-service pause/resume | client | subscriptionId | `subscriptions` update | notification |
| `adjustClientSessionsAction`/`adjustPauseDaysAction` | Admin subscription adjustment | admin | subscriptionId, delta | `subscriptions` update | timeline log (sessions only if increasing) |
| `createMigratedClientAction` | Add-client migration wizard | admin | identity+plan+schedule | `auth.users`, `client_profiles`, `subscriptions`, `recurring_slots` | none |
| `createCoachAction` | Add-coach wizard | admin | identity+skills+languages+slots | `auth.users`, `coach_profiles`, `coach_availability` | none |
| `transferClientCoachAction`/`reassignCoachClientsAction` | Coach reassignment | admin | coach ids, force? | `recurring_slots`, `bookings` | notification ×3 (old coach, new coach, client) |
| `setCoachAvailabilityAction` | Set a coach's working hours | admin | coachId, windows[] | `coach_availability` full replace | none |
| `blockCoachSlotAction` | Block a coach's day | admin | coachId, date, reason? | `coach_leave` insert (pre-approved) | none — **does not trigger the shadow cascade** |
| `disableCoachAction` | Soft-disable a coach | admin | coachId | `coach_profiles.status='inactive'` | none |
| `logRefundRequestAction` | Log a refund (no money moves) | admin | clientId, amount, reason | `audit_logs`, `client_timeline_events` | none |
| `updateSettingAction` | Change a platform setting | admin | key, value | `system_settings` update | none — see §27 for which settings are actually live |
| `createPackageAction`/`updatePackageAction`/`deletePackageAction` | Package catalog CRUD | admin | package fields | `package_tiers` (delete is soft) | none |
| `getAuditLogAction` | Read audit trail | admin | entityType? | none (read-only) | none |
| `generate*ReportAction` (×5) | Report data for export | admin | none | none (read-only) | none |

## 9.3 Reuse Principle for Mobile

Because business logic is concentrated in 35 service files (not scattered across UI code), porting each Server Action to a real Route Handler (§9.1's pattern) for mobile consumption is a largely mechanical rewrite — each action's body is already a thin call into one or two service functions. The alternative (mobile calling Supabase directly) would require either duplicating every validation/cutoff/fallback-ladder rule client-side or migrating it into Postgres functions — a materially larger effort. See §22 for the full decision framework.

---

# 10. Authentication & Authorization

## The Three Supabase Client Wrappers (defines the entire authorization model)

| Wrapper | Key | RLS | Use |
|---|---|---|---|
| `supabaseAdmin` (`admin-client.ts`) | Service-role key | **Bypassed entirely** | Server-only. Privileged/cross-user ops: notification writes for another user, audit/timeline writes, chat conversation management, `auth.admin.*` calls (create user, get user by id/email). |
| `getRequestClient(token)` (`request-client.ts`) | Anon key + caller's own JWT | **Enforced as that user** | What every `lib/services/*` function actually queries through — **RLS is the real security boundary**, not application code. |
| Server (cookie) client (`server-client.ts`) | Anon key, `@supabase/ssr` cookie adapter | N/A (only extracts the token) | Only used to read/refresh the session and hand `accessToken` to the two clients above; never itself used for data queries. |

## Login

Three separate role-scoped routes (`/login/client`, `/login/coach`, `/login/admin`), one shared `LoginForm` component. Fields: Email/Phone (text, only email actually works), Password. Submit → `supabase.auth.signInWithPassword` → on success, queries `profiles.role`; **mismatch → forced sign-out** with an explicit error message (a client-side UX layer compensating for what would otherwise be a confusing silent middleware bounce). **"Forgot password?" is completely non-functional — no route, no handler, no Supabase call anywhere.**

## Signup (client-only self-serve)

3-step: form (name/email/phone/password, client-validated) → `supabase.auth.signUp({role:"client"})` (this `role` value is **inert** — the server never honors client-suppliable role metadata) → email OTP (Supabase native) → phone OTP (MSG91, **currently bypassable via a "Skip for now" button**, saving the number unverified). **No coach/admin signup route exists anywhere** — those accounts are provisioned exclusively via `supabaseAdmin.auth.admin.createUser` with `app_metadata.role` set server-side.

## Google OAuth

Same button (`signInWithOAuth`) on every login/signup page — Supabase doesn't distinguish login from signup for OAuth. `/auth/callback` exchanges the code, resolves `profiles.role`, redirects to that role's dashboard. **A brand-new Google identity can only ever land as `client`** (the `handle_new_user` trigger's default) — there is no code path for OAuth to produce a coach/admin account. On any failure, always redirects to `/login/client?error=oauth_failed` regardless of which portal's button was clicked.

## Phone OTP (MSG91)

Two entry points share the same session-less Server Actions (`sendPhoneOtpAction`/`verifyPhoneOtpAction` — deliberately not requiring a session, since proving phone ownership is independent of caller identity; only the subsequent `setMyPhoneAction` write requires one): signup step 3, and `PhoneGateModal` (forced on any client whose `profiles.phone` is null — i.e., every Google OAuth signup). **Both currently ship a "Skip for now (demo — MSG91 not verified yet)" bypass** that saves the number unverified, because MSG91 KYC/DLT approval is pending (OTP requests are accepted by MSG91's API but never actually deliver).

## Route Protection (`middleware.ts`)

Matches `/{client,coach,admin}/:path*` only. `requiredRoleFor(pathname)` derives the role purely from the URL's first segment. Calls `supabase.auth.getClaims()` (local JWT verification via cached JWKS — no network round trip, since the project signs asymmetrically/ES256). Reads a custom `user_role` claim injected by a Supabase Auth Hook (migration 0054, `custom_access_token_hook`) — **falls back to a live `profiles` query** if the claim is absent (session predates the hook being enabled). No session or wrong role → identical redirect to `/login/{requiredRole}` — a wrong-role session is treated exactly like no session at this layer.

**A mobile app has no direct equivalent to Next.js middleware** and must re-implement this role-gating pattern at the navigation/screen level (check the JWT claim or a cached profile fetch before rendering a protected screen).

## Role Provisioning Security History (the canonical account model — spans 5 migrations)

1. **Original (0002):** `handle_new_user()` trusted `raw_user_meta_data->>'role'` — any caller of the **public**, unauthenticated `signUp()` endpoint could set `role: 'admin'` and be inserted as an admin.
2. **Fix (0051):** hardcoded `role='client'` for all public signups, closing the hole but breaking the admin's own coach-creation flow in the process.
3. **Reconciliation (0055):** moved the trust boundary to `raw_app_meta_data` — settable **only** via the privileged, service-role-only Admin API — and restored coach auto-provisioning. A genuine drift was found: production had already been hot-patched to this behavior **outside any committed migration** before 0055 formalized it.

**Net, current model:** role can only ever be set by `handle_new_user()` reading a service-role-only field, or by privileged server code explicitly setting it via the Admin API. No public-signup-suppliable field can ever set or change `profiles.role`, on any platform. A mobile signup implementation **must** follow this identical pattern.

## Two-Layer Authorization Inside Every Service Function

1. **`requireRole(ctx, [...])`** — an early, friendlier rejection (`Forbidden: requires role X or Y`) before the query even runs.
2. **Postgres RLS** — the actual, non-bypassable boundary. Removing layer 1 would not open any new access, only degrade error messages.

A small number of **BEFORE UPDATE triggers** (migration 0052) close a genuine RLS blind spot on `bookings` and `messages` (row-level RLS cannot restrict *which columns* an otherwise-permitted UPDATE touches) — any mobile write path to these two tables must go through the same RPCs/service functions the web app uses, never a raw table UPDATE.

---

# 11. Status & State Machines

| Entity | States | Setter(s) |
|---|---|---|
| `bookings.status` | upcoming → {completed, cancelled, missed} (all terminal) | upcoming: `confirm_booking`/`generate_bookings_from_recurring_slot` RPCs. completed: `submitSessionNotes()` only. cancelled: `cancel_booking()` RPC, or `changeMyRecurringSchedule()`'s direct bulk update (bypasses the RPC, no cutoff/regeneration). missed: `mark_missed_bookings()` RPC (time-elapsed, opportunistic) OR `markAttendance(status:"absent")` (also sets `no_show_party`). |
| `temporary_bookings.status` | held → {confirmed, expired} (`released` defined, never used) | held: `create_temporary_booking`. confirmed: `confirm_booking`. expired: `expire_temporary_bookings` (opportunistic). |
| `subscriptions.status` | awaiting_activation → active ⇄ paused; also → inactive | awaiting_activation: `purchaseMyPlanForClient` (client-initiated). active (direct): `purchaseSubscription` (admin, no activation step) OR `activateMyPlan` OR `resumeSubscription`. paused: `pauseSubscription`. inactive: only as the side effect of a *different* subscription being activated as its renewal. |
| `payments.status` | created → {paid, failed, paid_unfulfilled} | created: order creation. paid: signature-verified AND fulfilled. failed: signature mismatch only. paid_unfulfilled: captured but fulfillment threw, or (demo purpose via webhook) unconditionally — no server-to-server demo fulfillment path exists. |
| `attendance.status` | present / absent / late (set once, never transitioned after) | coach only, `markAttendance()`. |
| `coach_leave.status` | pending → {approved, rejected} (no withdraw/cancel path exists) | pending: `requestLeave()`. approved/rejected: `resolveLeave()` (admin); or `createOneDayLeave()` inserts directly at approved. |
| `escalation_status` | open → in_progress → resolved (terminal, **no reopen path exists**) | open: creation. in_progress: admin, optional/skippable, gated. resolved: admin, gated behind the call-confirmation. |
| `coach_change_status` | pending → {approved, rejected} (terminal, no withdraw path) | pending: client request. approved/rejected: admin only. |
| `shadow_coach_assignments.status` | active → cancelled (`completed` defined, **never set by any code**) | active: `assign_shadow_coach`/`reassign_shadow_coverage` RPCs. cancelled: only when superseded by a re-assignment — **never** cancelled simply because the covered period's `ends_on` passed (a confirmed, permanent gap — §19). |
| `recurring_slots.status` | active → cancelled (`paused` defined, never used) | active: creation. cancelled: schedule change or coach change (old pattern retirement). |
| `coach_profiles.status` | active / inactive / on-leave | admin via `updateCoachStatus`; "Disable Coach" always sets `inactive` (no hard delete exists anywhere). |
| Derived `ClientStatus` | not_paid / demo / created / active / paused / expired (never stored) | Recomputed live on every read from `subscriptions.status` history + demo-booking existence; logged as a `client_status_changed` timeline event (not a column) only when it actually moves. Priority order: paused > active > created > expired > demo > not_paid. |

---

# 12. Payments

No SDK — raw `fetch` + Node `crypto` (`razorpay.service.ts`) against Razorpay's REST API. `payments` (migration 0038) is the financial ledger.

## Full Lifecycle
1. **Plan selection** → `createPackagePurchaseOrderAction(packageId)`.
2. **Order + ledger creation (server, pre-payment):** rejects if the client already has an active/awaiting-activation subscription; loads the package's current price; `POST /v1/orders` (amount in paise, Basic-auth); **inserts a `payments` row at `status:"created"` *before* the client ever sees a checkout modal.**
3. **Checkout (browser):** `useRazorpayCheckout` hook lazy-loads `checkout.razorpay.com/v1/checkout.js`, opens `window.Razorpay(...)`. The app never sees card/UPI details.
4. **Primary fulfillment** (Checkout success callback → `verifyPaymentAction` → `verifyAndFulfillPayment`): loads the `payments` row; ownership check; idempotent if already `paid`; rejects if not still `created`; **verifies `HMAC-SHA256(orderId|paymentId, RAZORPAY_KEY_SECRET)` — the sole trust boundary.** Mismatch → row marked `failed`. Match → `purchaseMyPlan` (package) or `confirmDemoBooking` (demo) → row marked `paid`. **Any fulfillment exception** (slot taken meanwhile, plan already purchased in another tab) → row marked `paid_unfulfilled` — the client sees a support-reference error naming the order id, never a generic failure; money is never silently lost track of.
5. **Reconciliation** (Razorpay server → `POST /api/webhooks/razorpay`, safety net for the browser-tab-closes-before-callback case): verifies `HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)` — a **separate secret**, over the raw unparsed body; handles `payment.captured` only; no-ops if the row isn't still `created`; always returns `200` regardless of outcome.
6. **Final states:** `created→paid` (happy path), `created→failed` (bad signature), `created→paid_unfulfilled` (captured but fulfillment failed, either path). Client-initiated subscriptions always start `awaiting_activation`; the admin-driven purchase path (no Razorpay) creates them directly `active`.
7. **UI:** "Congratulations!" modal — does **not** auto-navigate; only dismissing it routes to the dashboard.

## Invoice / Receipt
**Needs Verification:** no dedicated invoice/receipt-generation or download feature was found anywhere in the audited code — the client's only payment record is the "Payment History" list on `/client/subscription` (package name, date, amount) and, for admin, the Sales screen/report. No PDF receipt or emailed invoice was located.

## Refunds
**No payment-gateway refund integration exists.** "Log Refund Request" (admin, Client Detail) writes only an `audit_logs` row and a `client_timeline_events` entry — explicit code/UI disclaimer: *"This platform has no payment gateway yet — this logs a refund request to the audit trail for finance to action manually; it does not move money."*

## Dormant / Unused Path
`createDemoSessionOrder` / the `demo_session` payment purpose / the webhook's demo branch are **fully built but never called by the live UI** — the actual demo flow is entirely free (`amountPaid:0`) and bypasses Razorpay. If ever reactivated, the webhook path is a **guaranteed `paid_unfulfilled`** for every demo payment (no server-to-server fulfillment path exists for it, since it needs a live user access token) — this would need fixing before going live.

## Where Payment Data Is Stored / How Status Affects the App
`payments.status` never directly gates any UI feature by itself — it only matters transitively through what it produces: a `paid` package purchase creates a `subscriptions` row (which *does* gate feature access, per §6's client-status derivation); a `paid_unfulfilled` row requires manual admin/support intervention and produces no subscription/booking at all until resolved out-of-band.

---

# 13. Zoom / Video / Meeting Integration

Server-to-Server OAuth against **one shared business Zoom account** — no coach has an individual Zoom OAuth grant. Env: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_HOST_EMAIL`.

- **Meeting creation:** lazy — no meeting exists at booking time for any booking type. Created on the first call to `ensureZoomMeetingForBooking(bookingId)` (e.g., a coach's Today's Tasks load, or a client's "Join" click). Guard: booking must be visible to the caller and `status==="upcoming"`; **idempotent** — if URLs already exist, returns them unchanged, no duplicate meeting ever created.
- **Meeting update:** no update path exists — a reschedule deletes the old meeting and lets a new one be lazily created for the new time.
- **Meeting deletion:** `cleanupZoomMeeting()` on cancel/reschedule — best-effort `DELETE /v2/meetings/{id}` (404 tolerated as success); **errors are logged only, never rethrown**, and the three `zoom_*` columns are nulled regardless of whether the remote delete actually succeeded (meaning a failed delete can leave a "zombie" meeting live in the Zoom account while the app locally believes it's gone).
- **Meeting ID / Join URL / Host URL:** `zoom_meeting_id`, `zoom_join_url` (client uses this), `zoom_start_url` (coach uses this — grants Zoom host controls) — all three columns on `bookings`.
- **Authentication:** Server-to-Server OAuth token, cached in-process (module-level variable, resets on cold start/redeploy, **never persisted to any store**), refreshed ~30s before its ~1-hour expiry.
- **Meeting settings:** `join_before_host:true` (either party can enter before the "host" account joins), `waiting_room:false`, `approval_type:2`, `mute_upon_entry:true`, `timezone:"Asia/Kolkata"`.
- **Client joining:** clicks "Join"/"Join Now" → opens `zoom_join_url` in a new browser tab (no in-app embedded meeting view).
- **Coach joining:** clicks "Join Zoom Meeting" → `markSessionJoinedAction` (sets `coach_joined_at`, idempotent) → opens `zoom_start_url` in a new tab.
- **Meeting status / Webhooks:** **no Zoom webhook is consumed anywhere in the codebase.** Session completion is driven entirely by the coach's own in-app actions (join → attendance → notes) — Zoom itself is a dumb link provider; there is no server-side verification that anyone actually attended via Zoom.
- **Recording handling:** **Needs Verification / not found** — no recording-related code, setting, or UI was located anywhere in the audited scope. Recording is likely not a supported feature today.
- **Mobile interaction recommendation:** deep-link into the native Zoom app if installed (`zoommtg://` scheme or Zoom's SDK), else fall back to opening the join URL in an in-app browser — this is a genuinely new mobile-specific decision with no existing web pattern to mirror beyond "open this URL."

---

# 14. Notifications

Two tables: `notification_templates` (key-based, `{{placeholder}}` interpolation, ~40 rows seeded across 10 migrations) and `notifications` (per-user instance, `read` boolean, a `channels` jsonb column that exists in the schema but is **never populated by any code**).

## Delivery Channels
- **In-app** — always, on every `createFromTemplate` call. This is the **one** channel treated as load-bearing: it's the only step in the pipeline that actually throws on failure (e.g., unknown template key) — everything downstream is fail-soft.
- **Email (Resend)** — for any notification routed through `notifyUser`/`notifyClient`/`notifyCoach`. **Fail-soft**: a missing/broken `RESEND_API_KEY` produces no user-visible error, only a server-log warning.
- **SMS (MSG91)** — **client-only**, fixed enum of 7 session-lifecycle events (booked, demo booked, schedule/coach changed, attendance present/absent, rescheduled), each requiring a DLT-approved template id (India telecom regulation forbids freeform SMS). Coaches never receive SMS. Also fail-soft.
- **Push:** **does not exist on any platform.** Confirmed by exhaustive grep — no Firebase/FCM/APNs/service-worker/web-push code anywhere.

## Notification Mechanism (Trigger → Condition → Recipient → Channel → DB Record → User Action)
```
Business event occurs (e.g. booking confirmed)
→ createFromTemplate(templateKey, userId, vars) [always via supabaseAdmin, since it writes for a DIFFERENT
   user than whoever triggered the event]
→ CONDITION: template key must exist (else throws — the one hard-fail point in the whole pipeline)
→ INSERT notifications row (title/message interpolated from the template, unmatched {{vars}} silently
   become empty string, never left as a literal placeholder)
→ CHANNEL FAN-OUT: notifyUser/notifyClient/notifyCoach additionally resolve the recipient's email
   (supabaseAdmin.auth.admin.getUserById) and send via Resend; notifyClient additionally sends MSG91 SMS
   if the event is in the fixed 7-event list and the client has a phone on file
→ USER ACTION: recipient sees the in-app bell (badge count), clicks a notification → optimistically marks
   read locally → markNotificationReadAction (no "mark all read" exists anywhere)
```

## Full Template Catalog (by originating migration, ~40 keys total)
- **0008 (original, several now-legacy):** `booking_confirmed`, `booking_cancelled`, `session_reminder`, `coach_change_approved`, `shadow_coach_assigned`, `inactivity_warning` (**no live call site found — likely dead, consistent with the dead `inactivity_threshold_days` setting**), `assessment_reminder` (**no live call site found**), `admin_alert`.
- **0015:** `recurring_schedule_unmatched`.
- **0024 (first coach-facing templates):** `leave_approved`, `leave_rejected`, `new_client_assigned`, `client_transferred`, `escalation_raised_to_coach`, `client_progress_updated`, `admin_changed_schedule`, `shadow_assignment_for_coach`.
- **0025:** `session_cancelled_by_client`, `session_rescheduled_by_client`.
- **0032:** `attendance_overdue`.
- **0044:** `new_chat_message`.
- **0048:** `notes_overdue`.
- **0050 (client+coach pairs):** `session_booked_client/coach`, `demo_booked_client/coach`, `schedule_changed_client/coach`, `coach_changed_client/coach`, `attendance_present_client/coach`, `attendance_absent_client/coach`, `session_rescheduled_client`.
- **0056 (gap-fill + 6h reminder):** `session_reminder_client/coach`, `plan_purchased_client`, `plan_activated_client`, `subscription_paused_client/coach`, `subscription_resumed_client/coach`, `session_cancelled_client`, `coach_on_leave_client`, `escalation_resolved_client`.
- **0057:** `schedule_assigned_client/coach`, `coach_change_request_approved_client`, `coach_change_request_rejected_client`.

**Interpretation note for mobile:** treat migration 0057's final state as the current, complete catalog — earlier-looking gaps (e.g., coach-facing notifications simply not existing until 0024) were a known, iteratively-fixed condition, not a deliberate scope decision.

---

# 15. Files & Media

| Upload type | Where | Storage bucket | Path convention | Notes |
|---|---|---|---|---|
| Profile photo (client/coach/admin) | Profile edit modals, all 3 portals | `avatars` (public read, owner write) | `{userId}/{uuid}.{ext}` | Client-side direct upload to Supabase Storage (browser SDK call, `upsert:false`), then `getPublicUrl()`, then the URL is passed into the profile-update Server Action. **Not** routed through a Server Action for the upload itself. |
| Chat image attachment | `ConversationThread` composer | `chat-attachments` (public read, participant-scoped write) | `{conversationId}/{uuid}.{ext}` | Same client-side-direct-upload pattern. No file-type/size validation was found in the TypeScript service layer (would live in the upload component, not independently confirmed). |
| Progress photo | **Schema exists (`progress_logs.photo_url`, `progress-photos` bucket with full RLS policies) but no upload UI or code path was found anywhere in the audited screens** | `progress-photos` (private) | — | **Confirmed unused/unbuilt feature** — do not describe this as a live mobile-parity requirement. |
| Coach certification document | **Schema exists (`coach-certifications` bucket) but no upload UI or code path found** | `coach-certifications` (private) | — | **Confirmed unused/unbuilt feature.** |
| Reports (CSV/PDF) | Admin Reports screen | Not stored — generated client-side on demand | — | CSV: `Blob` + synthetic `<a download>`. PDF: lazily-imported `jspdf`/`jspdf-autotable`, rendered and downloaded entirely in the browser, never uploaded to Storage. |

**File validation/permissions:** RLS on both active buckets scopes writes to the owning user (avatars) or a genuine conversation participant (chat-attachments), both matched by the object path's first folder segment. No explicit max-size/type restriction was confirmed in the service layer for either bucket — **Needs Verification** whether Supabase project-level bucket settings impose one (not visible from migration SQL alone).

**Mobile upload/download recommendation:** mirror the existing pattern — direct client SDK upload to the same bucket/path convention, then pass the resulting public URL into the same Server Action (or its ported API equivalent) the web app already uses; do not introduce a new upload proxy or a mobile-specific bucket.

---

# 16. Forms & Validation

Consolidated from all four frontend audits. **No schema-validation library is used anywhere** (no zod/yup/react-hook-form/formik/joi) — every rule below is hand-rolled TypeScript (if/throw) or a native HTML attribute, both client-side (UX) and server-side (the DB's CHECK constraints, §7, are the final backstop regardless of what the client validates).

## 16.A Authentication Forms

| Form | Screen | Field | Type | Required | Validation | Default |
|---|---|---|---|---|---|---|
| Login (×3 role variants) | /login/{client,coach,admin} | Email/Phone | text | Yes (native) | none beyond `required` | "" |
| | | Password | password | Yes (native) | none | "" |
| Signup — Step 1 | /signup | Full Name | text | Yes | native `required` only | "" |
| | | Email | email | Yes | native `required` + `type=email` | "" |
| | | Mobile Number | tel | Yes | `/^\+?[0-9]{10,15}$/` after stripping spaces/hyphens/parens | "" |
| | | Password | password | Yes | `length >= 8` | "" |
| Signup — Step 2 (Email OTP) | /signup | Code | numeric text | Yes | `trim().length >= 4`, digits-only sanitized, maxLength 10 | "" |
| Signup — Step 3 (Phone OTP) | /signup | Code | numeric text | Yes (unless Skip) | `trim().length >= 4`, digits-only, maxLength 6 | "" |
| Phone Gate Modal | any client page | Phone | tel | Yes (unless Skip) | same phone regex | "" |
| Phone Gate Modal | any client page | OTP code | numeric | Yes (unless Skip) | `trim().length >= 4`, maxLength 6 | "" |

## 16.B Client Portal Forms

| Form | Screen | Field | Type | Required | Validation | Default |
|---|---|---|---|---|---|---|
| Activate Plan | /client/activate | Start Date | date | implicit | `min`=tomorrow | tomorrow |
| Onboarding | /client/onboarding | Weight (kg) | number | **Yes** | non-blank | "" |
| | | Fitness Goal | button-group (5) | **Yes** | one selected | none |
| | | Age/Height/BodyFat%/Muscle%/Waist/Chest/Hip/Arms/Thigh/Gender/Medical fields | number/select/textarea | No | none | "" |
| Book Session (wizard) | /client/book | Slot selection | click-select | Yes | must pick a listed slot | none |
| Demo Booking | /client/demo-booking | Preferred Date | date | implicit | `min`=tomorrow | tomorrow |
| | | Preferred Time / Coach Gender | select | No | none | "No preference" |
| Request Coach Change | /client/coach (modal) | Reason | textarea | **Yes** | non-empty trimmed | "" |
| | | Overall Experience / Coach Rating | star 1-5 | No | none | 0 |
| Coach-change completion | /client/coach | Day toggles / Time | multi-select / time | Yes | ≥1 day + time set | [] / "" |
| Raise a Concern | /client/concerns (modal) | Category | select (7 fixed) | implicit | always has a value | first value |
| | | Details | textarea | No | none | "" |
| Edit Profile | /client/profile (modal) | Photo | file (image/*) | No | client-side upload only | current |
| | | Name/Phone | text | not enforced | none | current |
| | | Goals/Equipment | TagEditor | No | none | current |
| | | Medical Notes | textarea | No | none | current |
| Change Password | /client/profile (modal) | New/Confirm Password | password | **Yes** | `length>=8`, must match | "" |
| Log Measurements (3 identical-shape forms: Progress modal, Measurement Gate, Renewal Check-in) | /client/progress, gate modal, /client/renewal-checkin | Weight/BodyFat%/Muscle%/Waist/Chest/Hip/Arms/Thigh | number ×8 | No | none | "" ×8 |
| Schedule Setup | /client/schedule | Time | select | implicit | none | first grid hour |
| | | Pattern (standard/pair/custom) | button-group/multi-select | Yes | pair: must pick one; custom: 2-5 days | "mwf" |
| | | Trainer Preference / Gender | button-group | implicit/No | none | "same" |
| Reschedule (3 sub-flows) | /client/sessions (modal) | Slot selection / Desired Date+Time | click-select / date+select | Yes | must pick a slot, or both date+time set | none |
| Rate Session / Demo Feedback | /client/sessions, /client/book (modals) | Quality Rating / Trainer Rating | star 1-5 | **Yes** | must be > 0 each | 0 |
| | | Note | textarea | No | none | "" |

## 16.C Coach Portal Forms

| Form | Screen | Field | Type | Required | Validation | Default |
|---|---|---|---|---|---|---|
| Leave Request | /coach/availability (modal) | Leave Type | toggle (full_day/partial) | Yes | one selected | full_day |
| | | Reason | text | No | none | "" |
| | | From/To (full_day) or Date (partial) | date | Yes | `min`=tomorrow; server also enforces end≥start | "" |
| | | Unavailable from/Until (partial) | time | Yes | server: end>start | "" |
| Session Notes | /coach/session/[id] | Session Summary | textarea | **Yes** (client-enforced) | non-empty trimmed | existing or "" |
| | | Exercises Performed/Homework/Additional Remarks | textarea | No | none | existing or "" |
| | | Client Performance | button-group (4) | No | none | existing or null |
| | | Improvements Seen | TagEditor | No | none | existing or [] |
| Attendance Remark | /coach/session/[id] | Optional remark | textarea | No | only sent with Absent | "" |
| Edit Contact Info | /coach/profile (modal) | Mobile Number/Emergency Contact | text | No | none | current |
| | | Profile Picture | file (image/*) | No | client-side upload only | current |
| Add Skill | /coach/profile | Skill | text (+Enter) | Yes | trimmed non-empty; server append-only | "" |
| Change Password | /coach/profile (modal) | New/Confirm Password | password | Yes | `length>=8`, must match | "" |

## 16.D Admin Portal Forms

| Form | Screen | Field | Type | Required | Validation | Default |
|---|---|---|---|---|---|---|
| Add Client — Identity | /admin/clients/new | Full Name/Login Email/Temp Password | text/email/text | Yes | non-empty | "" / random |
| | | Phone | text | No | none | "" |
| Add Client — Plan | /admin/clients/new | Plan Name | select | Yes | must pick | first package |
| | | Sessions Remaining | number, min 1 | **Yes** | `>0` | package default |
| | | Original Plan Size / Pause Days Allowed | number | No | none | "" / package default |
| Add Client — Coach & Schedule | /admin/clients/new | Coach/Time/Days | select/select/toggle | No (optional) | if days picked, availability must be confirmed via "Check Availability" before submit | first coach / "06:00" / [] |
| Add Coach | /admin/coaches/new | Full Name/Employee Code/Login Email/Temp Password | text/text/email/text | Yes | non-empty | "" / random |
| | | Primary Specialization | select | Yes | must be a known skill | first skill |
| | | Languages Spoken | multi-toggle | **Yes** | `length>0` | [] |
| | | Weekly Slot Openings | repeatable time+day rows | **Yes** | ≥1 row with ≥1 day | 1 default row |
| Adjust Package/Sessions | Client Detail (modal) | Sessions delta | stepper | Yes | delta ≠ 0 | 0 |
| Grant Pause-Days | Client Detail (modal) | Days delta | stepper | Yes | delta ≠ 0 | 0 |
| Transfer to Another Coach | Client Detail (modal) | New Coach | select | Yes | must select | "" |
| Log Refund Request | Client Detail (modal) | Amount (₹) / Reason | number / textarea | Yes | both truthy | "" |
| Log Escalation | Client Detail (modal) | Reason | text | Yes | truthy | "" |
| | | Details | textarea | No | none | "" |
| Log Measurement | Client Detail (modal) | 8 measurement fields | number ×8 | No | none | "" ×8 |
| Assign Shadow Coach | ShadowCoachAssignModal | From/To dates | date | Yes | `endsOn >= startsOn` | today |
| | | Reason | text | No | none | "" |
| Override/Block Slot | Coach Detail (modal) | Date | date | Yes | truthy | "" |
| | | Reason | text | No | none | "" |
| Reassign Clients | Coach Detail (modal) | New Coach | select | Yes | must select | "" |
| Edit Coach | Coach Detail (modal) | Name/Specialization/Bio | text/text/textarea | not enforced | none | current |
| | | Years of Experience | number, min 0 | No | `Number(v)\|\|0` | current |
| | | Additional Specializations/Languages | TagEditor | No | none | current |
| Set Working Hours | Coach Detail | Per-day enabled+start+end | checkbox+time×2 ×7 | — | only `is_active` rows sent | derived or 06:00-20:00 disabled |
| Escalation Assessment | Escalation Detail | Issue Type/Fault | select | No | — (**full-replace on save, not a merge**) | existing or "" |
| | | Case Summary | textarea | No | none | existing or "" |
| Escalation Progress Note | Escalation Detail | Note | textarea | **Yes** | non-empty | "" |
| Escalation Resolution | Escalation Detail | Resolution Notes | textarea | No | none | existing or "" |
| Settings — Session Rules | /admin/settings | 4 range sliders | slider | — | fixed min/max/step per rule | current setting or seed default |
| Settings — Add/Edit Package | /admin/settings (modal) | Name | text | Yes | non-empty | "" or existing |
| | | Category | select (2) | Yes | — | "addon" or existing |
| | | Sessions | number, min 1 | Yes | `>= 1` | 12 or existing |
| | | Price | number, min 0 | Yes | `>= 0` | 0 or existing |
| | | Original Price | number, min 0 | No | 0 → sent as `null` | 0 or existing |
| | | Features | TagEditor | No | none | [] or existing |
| | | Highlight checkbox | checkbox | No | none | false or existing |
| Reschedule Session (admin) | Sessions list (modal) | New Date/Time | date/time | Yes | truthy | "" |
| Approve Coach Change | Coach Change Requests (modal) | New Coach (optional) | select | No | blank = "let client choose" | "" |

---

# 17. Search, Filter & Sort Logic

**No control anywhere in the entire application triggers a server-side re-query per keystroke.** The two exceptions that ARE server-side (full re-fetch, not incremental) are: Admin Availability Check's date picker (`router.push` with a new `?date=` querystring) and Admin Activity Log's entity-type filter (full-page `Link` navigation). Every other search/filter/sort control operates on data already fetched once by the screen's initial server action call(s).

| Screen | Control | Client or Server | Effect |
|---|---|---|---|
| Client: My Sessions | Status tabs (5) | Client-side | Filters an already-fetched array; "Rescheduled" tab filters on `wasRescheduled` instead of `status` |
| Client: My Chats | Past-conversation accordion | Client-side (local state) | Expand/collapse one thread at a time |
| Client: Demo Booking | Preferred Time / Coach Gender selects | **Server-side** (values passed into the booking action, which runs the actual coach search) | Narrows the auto-matching candidate pool — not a filter of pre-loaded data |
| Client: Schedule Setup | Time / Pattern / Trainer Preference / Gender selectors | **Server-side** (fed into `matchScheduleAction`) | Drives the live coach-availability search |
| Client: Reschedule Modal | Desired Date+Time check | **Server-side** (`checkRescheduleTimeAction`) | Checks one specific slot, then substitute coaches |
| Coach: Clients list | Search / Status pills / Plan select / Day select (4, AND-combined) | Client-side | Narrows the own-roster table |
| Coach: Global Search | Search input | Client-side, over a **fully preloaded** platform-wide client list | Empty query shows nothing; non-empty filters name/code |
| Coach: Chats | Category tabs (4) | Server-computed category, client-side tab selection | Filters visible conversation list |
| Coach: Escalations | Active/Resolved tabs | Client-side | Filters by resolved status |
| Coach: Schedule | Day/Week toggle | Client-side | Switches between task-row list and 7-day grid |
| Admin: Clients list | Search + Status pills | Client-side | Narrows the platform-wide roster |
| Admin: Coaches list | Search (name only) | Client-side | Narrows the roster |
| Admin: Sessions | Coach select + Status select | Client-side | Narrows the master session list; **sort is fixed (date desc), not user-controllable anywhere** |
| Admin: Sales | Search | Client-side | Narrows + recomputes the filtered ₹ total |
| Admin: Escalations | Active/Resolved tabs | Client-side | — |
| Admin: Activity Log | Entity-type pills | **Server-side** (full page nav via querystring) | Re-fetches filtered audit rows |
| Admin: Availability Check | Date picker | **Server-side** (querystring re-fetch) | Loads that day's full slot grid |
| Admin: Availability Check | Booked/Free pills | Client-side | Filters the already-loaded day's slots |
| Admin: Search (Universal) | Search input | Client-side, over a fully preloaded list | Empty query shows nothing |
| Admin: Renewals | Opportunity/Expired tabs | Client-side | — |
| Client Timeline (shared, admin+coach client-detail) | View toggle (Split/Merged) | Client-side | Layout only, same data |
| Client Timeline | Event-type filter (26 types) | Client-side | Filters `event_type`, resets pagination |
| Client Timeline | Infinite scroll | Client-side | `IntersectionObserver` loads +20 rows |

**No free-text search exists anywhere in the client portal** — the only client-portal "search" controls are the server-side day/time/coach-preference matching selectors, which are not searches over already-visible data.

---

# 18. Error Handling

**Universal pattern:** every Server Action returns a discriminated union (`{success:true, data}` or `{success:false, error:{code, message}}`) via a shared `runAction()` wrapper that catches any thrown error — including RLS/Postgrest rejections and `requireRole()`'s `Forbidden:` messages. **The literal thrown-error string is shown to the end user verbatim** in nearly every case (e.g., "You've already submitted a measurement update this week -- next update available in a few days.") — there is no separate user-facing-copy layer distinct from the server's own error text. **No toast/snackbar system exists anywhere in the application** (confirmed independently across all four frontend audits) — failures render as inline red text near the triggering control; successes are communicated via a state/route change, not a transient banner.

| Error condition | Detection | User message | UI behavior | Retry | Logging |
|---|---|---|---|---|---|
| API/Server Action failure (business rule violated) | `isFailure(result)` | Server's literal thrown message, verbatim | Inline red text near the control | Manual (user edits and resubmits) | None beyond server console |
| Top-level page data-fetch failure | `isFailure(result)` on the primary load | Server's literal message | Full-page `EmptyState` (icon AlertTriangle) — **admin Notifications page is the one confirmed inconsistency, using plain red text instead** | Full page reload | None |
| Network failure | Supabase/fetch throw | Generic error surfaces via the same inline pattern | Same as above | Manual | None |
| Unauthorized access (wrong role) | `middleware.ts` role mismatch | No error page shown — silent redirect to `/login/{requiredRole}` | Redirect | N/A | None |
| Invalid input | Client-side validation (native/regex/length) blocks submit before any network call | Inline validation message | Submit button disabled or shows inline text | Immediate (fix and resubmit) | None (never reaches the server) |
| Invalid input reaching the server anyway | Server-side `throw` (mirrors client checks, independently enforced) | Same literal message | Inline red text | Manual | None |
| Expired session | `getAccessToken()`/`getSessionUser()` returns null | `"Not authenticated"` (generic) | Action fails inline; a subsequent navigation would hit middleware's redirect | Re-login | None |
| Payment failure (signature mismatch) | `verifyRazorpaySignature` returns false | "Payment verification failed -- signature mismatch." | Inline red text on the Plans page | Start a new payment | `payments.status='failed'` |
| Payment captured but fulfillment failed | try/catch in `verifyAndFulfillPayment`/webhook | Support-reference error naming the order id | Inline red text | Support-assisted (manual) | `payments.status='paid_unfulfilled'`, `console.error` |
| Upload failure (avatar/chat image) | try/catch around Supabase Storage `.upload()` | Inline `photoError`/`sendError` text | Upload button re-enabled | Manual retry | None |
| Third-party API failure (Zoom) | try/catch, always swallowed for delete; creation errors surface as a thrown error from `ensureZoomMeetingForBooking` | Generic — "join link not ready yet" fallback text on the client side rather than a hard error | Non-blocking; Join button falls back to disabled/unready state | Automatic (lazy retry on next attempt) | `console.error`/`console.warn` only |
| Server error (unexpected exception) | `runAction()`'s catch-all | Whatever message the underlying error carries (may be an opaque Postgres error if not a deliberate `throw`) | Inline red text | Manual | None persisted (only process logs) |

**Fail-soft vs. fail-hard, by design, not accident:** every cutoff/cap/gate violation (booking credit, cancellation/reschedule cutoffs, weekly measurement cap, escalation call-gate, attendance/notes sequencing) is **fail-hard** (throws, blocks the user) — these are business-rule violations meant to stop the action. Every outbound notification (email/SMS), the Zoom-cleanup-on-cancel step, and the coach-change background chat side effect are **fail-soft** (caught internally, `console.warn` only, never surfaced) — a secondary side effect failing must never roll back or block a primary action that already succeeded. The one deliberate exception inside the fail-soft group: the in-app notification row insert itself (`createFromTemplate`) **does** throw on an unknown template key, since a failure there would silently lose the only durable record of the event.

---

# 19. Edge Cases

Confirmed, code-verified behaviors — not hypothetical risks — consolidated from all eight independent audit passes. These must be **reproduced**, not silently "fixed," in a mobile rebuild unless a deliberate product decision changes them (candidates for an actual fix are separated in a mobile team's own backlog discussion, not decided by this document).

## 19.1 Newly confirmed this pass (not previously documented)
1. **The session-reminders cron's real trigger is invisible from its own code comment.** The route comment says "see vercel.json's crons entry" — but `vercel.json` has no `crons` key at all. The actual scheduler is `.github/workflows/session-reminders.yml` (GitHub Actions, `*/15 * * * *`, curling the route with the shared `CRON_SECRET`) — a genuine documentation-drift bug. **If GitHub Actions were ever disabled for this repo** (org policy, billing, accidental workflow deletion), session reminders would silently stop firing with **zero in-app signal** — `reminder_sent_at` just stays null forever.
2. **`reschedule_booking()` silently stopped recording `was_rescheduled`/`original_scheduled_start`** in migration 0041 (which added substitute-coach support) — a genuine regression from the original 0018 behavior, never fixed in any later migration. **Confirmed still broken today.** This means, right now, in production: the coach dashboard's "Rescheduled Sessions" section is permanently empty for new reschedules; the admin Scheduling view's "rescheduled" bucket is empty; the admin week-calendar's reschedule icon never shows; the "Originally: {date}" note on My Sessions never appears for a freshly-rescheduled session.
3. **`mark_missed_bookings()` can race a coach's own attendance-marking workflow.** It unconditionally flips ANY elapsed `upcoming` booking to `missed` (no attendance check) the moment almost any scheduling function runs. If this fires before a coach opens the session to mark attendance, `markAttendance()`/`submitSessionNotes()` then permanently reject with "Booking not found, or not upcoming" — **even if the client genuinely attended.** No code path reopens a `missed` booking.
4. **Multiple `system_settings` keys are effectively dead**, discovered by tracing every read site: `inactivity_threshold_days`'s only reader (`inactive_clients_view`) has zero application callers; `assessment_session_duration_minutes` and `join_window_minutes` have hardcoded JS-side twins that happen to numerically match today's seed values but are otherwise fully decoupled — moving the admin slider for "Default Session Duration" only changes a dashboard KPI, not real booking duration (which is hardcoded `45`/`60` in `getBookingOptionsAction`). See §27 for the full propagation table.
5. **`notifyUser` swallows ALL errors; `notifyAdmins` does not** at its own level (the `profiles` query for "every admin" can throw and is not individually try/catched per admin inside its `Promise.all`) — an inconsistency that can, in the specific case of `resolveLeave`'s inline `for` loop over affected clients, halt the shadow-coverage cascade partway through if one admin's notification throws, leaving later clients in the same leave-resolution unprocessed.
6. **`countReschedulesThisWeek` is not scoped by who performed the reschedule** — an **admin**-initiated reschedule on a client's behalf still counts against that client's own weekly self-service cap.
7. **Two independent fulfillment paths for the same payment (`verifyAndFulfillPayment` and `fulfillPaymentByWebhook`) have no database lock around their check-then-act sequence** — a narrow TOCTOU race could theoretically let both proceed for the same order if they interleave exactly right; a second layer of defense exists (the "already have a plan" check inside `purchaseMyPlanForClient`) but only if the first insert has already committed.
8. **`activateMyPlan` validates no upper bound on the chosen start date** — only rejects same-day-or-earlier; a client could submit a start date years in the future.
9. **`createOneDayLeave` (admin's "block a slot" tool) bypasses the shadow-coverage cascade entirely** — it inserts a pre-approved `coach_leave` row directly without ever calling `resolveLeave`, so any of that coach's clients with a session that day are left on a now-blocked coach with no automatic shadow search and no client notification, until the (reactive, on-demand) Shadow Coverage queue happens to be viewed.
10. **`updateEscalationDetails` is a full-replace of three fields together, not a per-field merge** — saving only a new Fault value silently nulls out any previously-saved Issue Type/Case Summary unless the caller re-sends them.

## 19.2 Confirmed lifecycle/state-machine gaps
11. **No mechanism anywhere reverts a shadow-covered booking back to the primary coach once the covering period ends** — confirmed by reading both the service layer and the underlying SQL (`assign_shadow_coach`, migration 0026). `shadow_coach_assignments.status` never transitions to any "expired/completed" value except when superseded by another shadow assignment. A client covered once stays permanently on the shadow coach for every already-materialized booking in that range.
12. **Coach leave has no withdraw/cancel path** — once submitted, only admin approve/reject exists; an approved leave cannot be un-approved (which would need to also reverse the shadow cascade — no such reversal function exists).
13. **Coach-change requests have no client-side withdrawal** — an approved-but-incomplete request sits indefinitely with no reminder/expiry mechanism if the client never finishes the self-serve coach search.
14. **Escalations have no reopen path** once `resolved` — a recurrence requires creating a brand-new escalation.
15. **`temporary_booking_status.released`, `recurring_slots.status='paused'`, `shadow_coach_assignments.status='completed'`, `notification_type.feedback`** are all defined enum values with zero producing code paths anywhere in 57 migrations.

## 19.3 Authentication / verification
16. **Phone-number verification is not actually enforced** — every phone-OTP surface ships a live "Skip for now" bypass.
17. **No password-reset flow exists at all**, on any platform, at any layer (UI, Server Action, or Supabase call) — confirmed by exhaustive grep.
18. **`CRON_SECRET` is optional** — if unset, the session-reminders endpoint is effectively public/unauthenticated.

## 19.4 Business-rule asymmetries
19. **Reschedule cutoff (1h) is far shorter than cancellation cutoff (12h)** — a session too close to cancel outright can still be rescheduled.
20. **Reschedule updates the booking row in place; cancellation regenerates a fresh occurrence** — a client who habitually cancels-and-rebooks accumulates more future occurrences over time than one who reschedules.
21. **A substitute-coach reschedule never touches the recurring slot** — the very next auto-generated occurrence automatically reverts to the original coach; a client wanting a *permanent* swap must use the coach-change flow, not repeated reschedules.
22. **`findAvailableCoach` (fresh-pattern search) ignores leave; `findShadowCoachCandidates` (existing-pattern coverage search) respects it** — two similarly-named "is this coach available" checks with genuinely different semantics.
23. **Chat is gated on "has ever purchased," not "has an assigned coach"** — a demo-only client has no chat channel even with an assigned demo coach.
24. **Escalation category (client-facing) and the DB CHECK constraint are two independently-maintained lists** that currently happen to agree — nothing guarantees they stay in sync if either is edited alone.
25. **`rateBooking`'s once-per-week gate is per-client, not per-booking** — a client with two completed sessions in one week can rate only one.
26. **Renewal "expired" classification's `hasEverSubscribed` flag** is computed in `clients.service.ts`, outside this audit's core file set for that specific derivation — **Needs Verification** of its exact edge-case behavior (e.g., a client whose original subscription row was ever deleted rather than superseded).
27. **Coach-performance date windows (today/week/month) are not IST-normalized**, unlike almost every other date computation in the scheduling engine — a real, if likely small, timezone-boundary inconsistency.
28. **`coachChangeRequestsReceived` and `totalWeeklySessions`/`totalMonthlySessions` performance metrics count ALL statuses** (including rejected requests, or cancelled/missed sessions) — raw counts, not quality-filtered.
29. **`escalationsRaised` (coach performance metric) is a misnomer** — it counts escalations *about* the coach, not escalations the coach raised.
30. **Admin's "block a slot" reuses the leave table directly at `approved`** with default reason "Blocked by admin" — indistinguishable from real coach-requested leave in the coach's own leave list except by that reason string.

## 19.5 Audit / reporting
31. **Audit-log coverage is asymmetric** — only 7 of the ~28 application tables are auto-audited (`bookings`, `subscriptions`, `coach_change_requests`, `client_profiles`, `coach_profiles`, `package_tiers`, `system_settings`). Changes to `profiles`, `progress_logs`, `messages`, `conversations`, `escalations`, `coach_leave`, `shadow_coach_assignments`, and others have **no audit trail at all** unless a specific call site explicitly writes one (only one such call site exists platform-wide, for refund requests).
32. **Sales/revenue figures are priced at query-time, not sale-time** — editing a package's price retroactively changes how historical reports read, since neither `subscriptions` nor the reporting views store a frozen `amount_paid`.
33. **"Manually created" bookings are inferred, not stored** — `listAdminCreatedBookingIds` derives this from the audit trigger's INSERT actor being an admin profile id at creation time; there is no `bookings.created_by_admin` column.
34. **"Log Refund Request" moves no money** — audit-trail-only, by explicit design, since no payment-gateway refund integration exists.

## 19.6 Infrastructure / configuration
35. **Two deployment configs exist side by side** (`vercel.json`, minimal, vs. `netlify.toml`, full build config) — **Needs Verification** which is the actual production target.
36. **The repo contains four separate Next.js build output directories** (base/admin/client/coach), suggesting the three portals may be deployed as separate instances of one codebase — **Needs Verification** operationally; does not change any documented application-layer behavior either way.
37. **`inactive_clients_view` is confirmed dead** (no application caller anywhere) — do not treat "days without a completed session" as an enforced/monitored condition today, despite the setting and view both existing.

---

# 20. Mobile App Requirements

**Principle (per the requester's own instruction): do not redesign the business logic.** Every rule in §6, every cutoff in §11/§19, every state machine in §11 must behave identically on mobile. What follows is purely a presentation/interaction-layer mapping.

## Web Screen → Mobile Screen Mapping

| Web Screen | Mobile Screen Equivalent | Navigation | Notes |
|---|---|---|---|
| /client/dashboard | Home tab | Bottom tab | Same journey-stage routing logic, same data |
| /client/sessions | My Sessions tab (+ detail screen) | Bottom tab → push | Tabs become segmented control or swipeable tabs; Reschedule/Cancel/Rate open as bottom sheets, not modals |
| /client/book, /demo-booking | Book a Session flow | Push stack (wizard) | Multi-step wizard maps directly to a sequential screen stack |
| /client/plans | Plans screen | Push from Home/Subscription | Razorpay Checkout has an official mobile SDK — use it, don't embed the web checkout.js |
| /client/coach | My Coach tab/screen | Bottom tab or Profile-menu item | Request-change form → bottom sheet |
| /client/concerns | My Concerns | Profile-menu item | Raise-concern form → bottom sheet |
| /client/chats | My Chats tab | Bottom tab | **Must stay realtime** (only feature the web app itself treats as live — see §45.1 in prior analysis, carried forward) |
| /client/schedule | My Schedule | Bottom tab or Profile-menu item | The multi-mode wizard (standard→pair→custom) maps to sequential screens, not one long scrolling form |
| /client/subscription | Subscription | Profile-menu item | — |
| /client/progress | Progress tab | Bottom tab | Camera/gallery integration is a genuinely NEW capability for photo-based progress tracking IF that feature is ever built (it doesn't exist on web today — see §15) |
| /client/notifications | Notifications | Bottom tab or bell icon | + native push registration (new capability, §29) |
| /client/profile | Profile tab | Bottom tab | Photo upload → native camera/gallery picker instead of a file input |
| /coach/dashboard, /schedule, /clients, /session/[id] | Home, Schedule, Clients, Session Detail | Bottom tabs + push | Session Detail's state machine (Join→Attendance→Notes) is identical; "sessionEnded computed once at render" bug should be fixed for mobile (use a live timer) since it's a UX quality issue, not a business rule |
| /coach/chats, /availability, /performance, /profile | same, mobile-adapted | Bottom tabs + Profile menu | — |
| /admin/dashboard, clients, coaches, sessions, escalations, leave-requests, coach-change-requests, shadow-coverage | Admin screens | See §21 — several recommended web/tablet-only |
| /admin/reports, /admin/settings | **Recommend web/tablet-only** | N/A | PDF/CSV generation and dense settings forms are a poor mobile fit; a read-only "view report" mobile screen could be a genuinely new capability later, not a straight port |

## Mobile-Specific Interactions
- **Bottom sheets** replace nearly every web `Modal`/`ConfirmDialog` (Raise a Concern, Request Coach Change, Log Measurement, Pause/Resume confirm, etc.).
- **Push notifications** — a genuinely new capability layered on top of the existing `notifications`/`notification_templates` data model (§14); requires new infrastructure (device token registration, a push provider) with no web equivalent to port.
- **Deep links** — e.g., a push notification for "session reminder" should deep-link straight to that session's detail/join screen.
- **Camera/file upload** — native camera/gallery picker for avatar upload, chat image attachments (both already exist on web via a plain `<input type=file>`; mobile just swaps the picker UI, same Storage bucket/path convention, §15).
- **Mobile permissions** — camera, photo library, push notifications, and (if Zoom native SDK is used instead of deep-linking) microphone/camera for in-app video.

## Preserve, Don't Simplify
- The client portal's conditional nav hiding (Book a Session once subscribed, My Chats until any chat exists) reflects real business state and must be preserved exactly.
- The 8-field measurement set, the exact cutoff hours, the exact reschedule cap (2/week), the exact escalation call-gate sequence — all must be reproduced bit-for-bit, not "streamlined."

---

# 21. Mobile Navigation Architecture

## Root Navigation
```
Auth Stack (unauthenticated)
  → Landing/Marketing (mobile-adapted content, no 3D/WebGL layer — see §51 in the prior architecture note)
  → Login (role picker, or auto-detect from a single login form + role check like the web app)
  → Signup (client-only)
Authenticated — role-branched root:
  → Client Tab Navigator
  → Coach Tab Navigator
  → Admin Tab Navigator (or web/tablet-only, per §20's recommendation for the densest screens)
```

## Client — Bottom Tab Bar
```
Home (Dashboard) | My Sessions | Book a Session (hidden once subscribed, mirrors web) | My Schedule | Progress
```
**Profile/More menu:** My Coach, My Chats (badge), Subscription, My Concerns (badge), Notifications, Profile, Logout.

## Coach — Bottom Tab Bar
```
Dashboard | Schedule | Clients | My Chats (badge)
```
**Profile/More menu:** Renewal Opportunities, Search (Global), Escalations, Performance, Availability, Notifications, Profile, Logout.

## Admin — Bottom Tab Bar (if an admin mobile app is built at all — see §20/§29 for the scope recommendation)
```
Dashboard | Search | Clients | Coaches
```
**Profile/More menu:** Sessions, Sales, Scheduling, Availability Check, Coach Change Requests, Leave Requests, Shadow Coverage, Escalations (badge), Notifications, Activity Log, Reports (web-recommend), Settings (web-recommend), Logout.

## Nested Stacks / Modal Screens / Deep Links
- **Detail screens** (push): Client Detail, Coach Detail, Session Detail, Escalation Detail — each a full push screen, not a modal, mirroring the web app's own dedicated-route pattern for these.
- **Modal/bottom-sheet screens**: every web `Modal`/`ConfirmDialog` instance cataloged in §16.
- **Deep links**: session reminders → Session Detail; new chat message → Chat thread; escalation update → Concern/Escalation Detail; coach-change/leave decision → the relevant detail screen.
- **Back behavior**: standard native back-stack; the web app's own redirect-based "journey stage" gating (§6, §11) should be re-implemented as an app-launch/foreground check that can redirect within the stack before rendering the target screen, not as a route guard per navigation (mirroring what `getMyJourneyStateAction` already does server-side on every page load).

---

# 22. API / Backend Reuse Strategy

## The Core Decision (unavoidable, must be made before mobile development starts)

There is no REST/GraphQL API today (§9). Two viable paths:

**Option A — Mobile talks to Supabase directly**, the same way the web app's own `ctx.client` calls do: same anon key, same RLS policies (§7.5), same Postgres RPCs (§7.4). Business logic currently living in the 35 TypeScript service files would need to be either duplicated in the mobile client, migrated into Postgres functions, or exposed via Option B's thin layer anyway for the parts that are pure TypeScript (cutoff math, fallback ladders, shadow-coach scoring, notification fan-out).

**Option B — Introduce a real API layer**: wrap the existing service functions in actual HTTP Route Handlers (the same pattern already used for the 2 existing ones, §9.1), and have **both** the web app's Server Actions and the new mobile app call this API. Higher upfront migration cost (~34 action files → ~34 route handlers) but zero business-logic duplication and one auditable request path for both platforms.

**This document does not choose for you** — it is a genuine engineering decision with real tradeoffs, explicitly flagged as **Needs Verification / Decision Required** rather than guessed.

## Classification of Every API Surface

| Surface | Classification | Why |
|---|---|---|
| All 35 service-layer functions (booking, payments, coach lifecycle, notifications, etc.) | **Requires wrapping (Option B) or full reproduction (Option A)** | Contains real TypeScript business logic (cutoff checks, fallback ladders, scoring formulas) that isn't expressible as a plain Supabase query |
| RLS policies + RPC functions (`confirm_booking`, `cancel_booking`, `has_scheduling_conflict`, etc.) | **Reusable as-is under Option A** | Already database-native, platform-agnostic |
| `POST /api/webhooks/razorpay` | **Reuse as-is** | Server-to-server, platform-independent by nature |
| `GET /api/cron/session-reminders` | **Reuse as-is** | System-triggered, not user-facing |
| Storage bucket uploads (avatars, chat-attachments) | **Reuse as-is** | Direct-to-Supabase-Storage client SDK calls work identically from a mobile Supabase SDK |
| Push notification delivery | **New mobile-specific endpoint required** | No web equivalent exists at all (§14) |
| Zoom join/host URL retrieval | **Reusable as-is** (already just returns a URL) | Mobile decides how to open it (deep-link vs. browser vs. native SDK) — a client-side decision, not a backend change |

## Goal: One Backend, Two Clients

```
COMMON BACKEND (Supabase: Postgres + Auth + Storage + Realtime; business logic as TS services [Option A] or a new API layer [Option B])
                         │
        ┌────────────────┴────────────────┐
    WEB APP (existing, this document's    MOBILE APP (new)
    entire §4/§6 spec)                     
        └────────────────┬────────────────┘
                COMMON DATABASE (§7)
```

Whichever option is chosen, the Postgres schema, RLS policies, and RPC functions in §7 do not change — every business rule in §6 must be reproduced identically on mobile, not reinterpreted.

---

# 23. Third-Party Integrations

| Service | Purpose | API | Auth | Env vars | Webhook | Data exchanged | Failure handling | Mobile impact |
|---|---|---|---|---|---|---|---|---|
| **Razorpay** | Payment processing | Orders API (REST, no SDK) | HTTP Basic (key:secret) for orders; HMAC-SHA256 for signature verification (two separate secrets — API vs. webhook) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Yes — `payment.captured` reconciliation | Order id/amount/currency; payment id/signature | Fail-safe: webhook always 200s; failed fulfillment marked `paid_unfulfilled`, never silently dropped | Use Razorpay's **official mobile SDK** (not the web `checkout.js`) — the order-creation/verification Server Actions are otherwise reusable unchanged |
| **Zoom** | Video meetings | Server-to-Server OAuth + Meetings v2 REST | OAuth client credentials, one shared account | `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_HOST_EMAIL` | None consumed | Meeting id/join URL/start URL | Best-effort delete, errors swallowed; no attendance verification via Zoom at all | Mobile just needs the join/start URL — decide deep-link vs. in-app browser vs. native SDK (§13) |
| **Resend** | Transactional email | REST | API key | `RESEND_API_KEY`, `EMAIL_FROM` | None | Recipient, subject, HTML body | Fail-soft — missing config/API error never surfaces to the user | No mobile impact — server-side only |
| **MSG91** | Phone OTP + transactional SMS | REST (2 distinct APIs: OTP API, Flow API) | Auth key (OTP) + DLT-approved template ids (Flow) | `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID_<EVENT>` ×7 | None | Phone number, OTP code, template variables | Fail-soft; **currently non-functional in production** (KYC pending) — bypass buttons ship live | Phone verification UX must decide whether to keep the bypass; reproduce the exact same OTP flow if MSG91 works by launch |
| **Supabase Auth** | Identity/session management | Supabase client SDK | JWT (ES256, asymmetric), Custom Access Token Hook embeds role claim | Supabase URL + anon key + service-role key | None (Auth Hook is DB-side, not a webhook) | Email/password, OAuth tokens, JWT claims | Session refresh handled by the SDK; role-claim fallback query if the Hook isn't yet active | Use Supabase's mobile-compatible client SDK directly — same auth flows (email/password, Google OAuth via mobile-native flow) |
| **Supabase Storage** | File hosting | Supabase client SDK | Bucket RLS (owner/participant-scoped) | Supabase URL + anon key | None | Avatar/chat images | No explicit validation confirmed beyond RLS scoping | Same SDK, same bucket/path convention |
| **Supabase Realtime** | Live chat delivery | `postgres_changes` subscription | Same JWT as REST calls | — | N/A (persistent WebSocket) | Message INSERT/UPDATE events on `messages` | Standard reconnect behavior (SDK-managed) | Must be reproduced for chat to feel native — the one feature where "refresh on open" (adequate everywhere else) is not acceptable |
| **GitHub Actions** | Cron trigger for session reminders | HTTP GET with Bearer token | `CRON_SECRET` | `CRON_SECRET` | N/A | None (just triggers the route) | If disabled, reminders silently stop with zero in-app signal (§19) | No mobile impact — purely a backend scheduling mechanism |

**Confirmed absent (do not build integration code for these unless a new product decision adds them):** analytics/tracking (any provider), push notifications (Firebase/APNs/any), any job-queue system (Bull/Inngest/etc.), any form-validation schema library.

---

# 24. Security

## Authentication Security
- Passwords: Supabase-managed (bcrypt server-side, never touched by application code). Client-side minimum length check (`≥8` chars) is UX-only; the actual strength policy lives in Supabase's own auth configuration — **Needs Verification** of the exact Supabase-side password policy (not visible from this repo's source).
- Sessions: JWT-based, ES256 asymmetric signing, verified locally via cached JWKS (no per-request round trip to the Auth server for `getClaims()`).
- **No password-reset flow exists** — a real, currently-shipping gap (§19).

## Authorization
- Two-layer model (§10): `requireRole()` (app-layer, friendly errors) + RLS (the actual, non-bypassable boundary). **A mobile app calling Supabase directly automatically inherits RLS correctly** regardless of platform — a strong argument for Option A in §22.
- **Historical, now-fixed vulnerability:** public signup could self-escalate to `role='admin'` prior to migration 0051 — closed by moving the trust boundary to a service-role-only metadata field (§10). **Any mobile signup implementation must replicate this exact pattern** — role is never client-declarable, on any platform.
- **Column-level RLS gap, closed by triggers not RLS itself** (migration 0052) — a client/coach could otherwise PATCH `bookings`/`messages` columns directly via PostgREST, bypassing every cutoff/conflict rule. A mobile write path to these two tables must go through the same RPCs/services, never a raw table update.

## API Security
- No conventional API surface exists to attack in the traditional sense (§9) — the attack surface is Server Actions (protected by Next.js's own CSRF-resistant action-encoding) plus the two Route Handlers.
- **Webhook verification**: Razorpay webhook signature checked over the raw body with a dedicated secret (`RAZORPAY_WEBHOOK_SECRET`), distinct from the payment-verification secret — correctly implemented, two independent trust boundaries.
- **`CRON_SECRET` is optional** — if unset, the cron route is effectively public. Should be mandatory in any environment this document's audience deploys.

## Sensitive Data
- Service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is guarded by an `import "server-only"` directive in `admin-client.ts`, preventing it from ever being bundled into client-side JS.
- Razorpay/Zoom/Resend/MSG91 secrets are all server-only env vars, never exposed to the client.
- **Phone numbers can be stored unverified** today (§19) — a real data-integrity/trust gap for any downstream feature (e.g., SMS delivery) that assumes phone ownership was proven.

## Input Sanitization
- No schema-validation library anywhere (§16) — all validation is hand-rolled. The `ClientTimeline` component explicitly avoids `dangerouslySetInnerHTML`, manually converting `<br>` and stripping all other HTML tags from event descriptions — a deliberate XSS-prevention measure worth preserving in any mobile rendering of the same data.
- Postgres CHECK constraints (§7) are the final backstop against invalid enum/range values regardless of what any client validates.

## Rate Limiting / CORS
- **No application-level rate limiting was found anywhere** in the audited code (Server Actions, Route Handlers, or Supabase-side policies) — **Needs Verification** whether Supabase or the hosting platform (Vercel/Netlify) imposes any at the infrastructure level.
- CORS: **Needs Verification** — not independently confirmed from source (Next.js Route Handlers and Server Actions have different, largely automatic CORS/same-origin behavior; no explicit CORS configuration was found in the two Route Handlers).

## Encryption
- TLS in transit (standard for Supabase/Vercel/Netlify/Razorpay/Zoom/Resend/MSG91 — infrastructure-level, not application code).
- At-rest encryption: Supabase-managed (Postgres-level), not application-configured.

## Logging
- `audit_logs` (7-table DB-trigger coverage) + `client_timeline_events` (business-narrative log) are the only structured, persisted logs (§7, §25) — server `console.warn`/`console.error` calls for notification/integration failures are **not persisted anywhere**, only visible in real-time process output.

## Potential Security Concerns for Mobile
1. **Do not weaken RLS or the trigger-based column guards "for mobile convenience"** — any relaxation affects the web app identically, since it's the same database.
2. **Do not reintroduce a client-declarable role field** in a new mobile signup/onboarding flow — replicate the `app_metadata`-only server-side assignment pattern exactly.
3. **Decide explicitly whether to reproduce the phone-OTP bypass** — shipping it on mobile too would be consistent with current (imperfect) production behavior; omitting it would be a deliberate, documented improvement, not an accidental divergence.
4. **Mandate `CRON_SECRET`** and consider adding basic rate limiting at the API-layer boundary if Option B (§22) is chosen, since that would be a new, more traditionally-attackable surface than the current Server-Action-only model.

---

# 25. Analytics & Logging

## Analytics / Event Tracking — CONFIRMED ABSENT
Exhaustive grep across the entire `src/` tree and `package.json` for `gtag`, `analytics.track`, `posthog`, `mixpanel`, `segment`, `amplitude`, `@vercel/analytics`, `@vercel/speed-insights` — **zero matches, anywhere.** There is no user-activity tracking, funnel analysis, or event-tracking SDK of any kind in this application today. **Implication for mobile:** there is nothing to "port" for analytics — if the mobile team wants usage analytics, it is a net-new capability to design from scratch, not a gap in an otherwise-instrumented system.

## Structured Logging (the only two mechanisms that exist)

### 1. `audit_logs` (DB-trigger-based, 7-table coverage)
Automatic (`fn_audit_trigger()`, a `SECURITY DEFINER` Postgres function) on exactly: `bookings`, `subscriptions`, `coach_change_requests`, `client_profiles`, `coach_profiles`, `package_tiers`, `system_settings`. Captures actor id, action (INSERT/UPDATE/DELETE), entity type/id, and a **whole-row** before/after JSONB snapshot — not field-level. One manual writer exists (`writeAuditLog`, used exactly once, for refund requests). Admin's Activity Log screen reads up to 200 most-recent rows (hard cap, no further pagination) and computes a display summary at read time.

### 2. `client_timeline_events` (business-narrative log, not a security/compliance audit trail)
Append-only (no update/delete RLS policy for any role, including admin), 27 defined event types (`plan_purchased`, `plan_activated`, `session_cancelled`, `session_rescheduled`, `coach_assigned`, `coach_changed`, `escalation_resolved`, `client_status_changed`, `pause_started`/`pause_ended`, `onboarding_completed`, `weekly_measurements_updated`, `refund_requested`, etc.), populated by explicit service-layer calls scattered across nearly every mutation path in the codebase. Read via `ClientTimeline` (split/merged view, 26-type filter, infinite scroll) on both the admin and coach client-detail screens.

### Important Business Events and Their Logging Coverage
| Event | Logged where | Trigger |
|---|---|---|
| Booking created/cancelled/rescheduled | `audit_logs` (whole-row diff) | Automatic DB trigger |
| Subscription purchased/activated/paused/resumed | `audit_logs` + `client_timeline_events` | Automatic + explicit service call |
| Coach change request created/resolved | `audit_logs` | Automatic DB trigger |
| Client profile edited | `audit_logs` | Automatic DB trigger |
| Coach profile edited | `audit_logs` | Automatic DB trigger |
| Package created/edited/archived | `audit_logs` | Automatic DB trigger (added migration 0029 — previously unaudited) |
| Setting changed | `audit_logs` | Automatic DB trigger (added migration 0029) |
| Escalation created/resolved | `client_timeline_events` **only** — **no `audit_logs` coverage** | Explicit service call |
| Coach leave requested/approved | **No logging at all in either system** beyond the row itself and its own `updated_at` | — |
| Shadow coach assignment | `client_timeline_events` only | Explicit service call |
| Chat message sent | **No logging in either system** | — |
| Login/logout events | **Not found anywhere** — no login-event writer exists despite the audit-log doc comment citing "login events" as a canonical manual-write example | — |
| Refund request | `audit_logs` (the one manual-write call site) + `client_timeline_events` | Explicit service call |

**Mobile parity note:** a compliance reviewer or mobile-parity auditor should not assume audit coverage extends beyond the 7 tables listed above — most operational history (escalations, leave, chat, logins) is either only in the business-narrative log or not logged at all.

---

# 26. Cron Jobs / Background Processes

## The One True Scheduled Job
| Trigger | Frequency | Logic | DB Effect | User Effect |
|---|---|---|---|---|
| `.github/workflows/session-reminders.yml` (GitHub Actions, **not Vercel Cron** — see §19.1 for the documentation-drift finding) `GET /api/cron/session-reminders` with `Authorization: Bearer $CRON_SECRET` | Every 15 minutes (`*/15 * * * *`) | Query window: now+5h45m to now+6h15m (±15min around the 6-hour-before mark, sized to survive the 15-min polling interval without gaps); selects `upcoming` bookings with `reminder_sent_at IS NULL` in that window | Stamps `bookings.reminder_sent_at` per processed booking (the actual de-dupe guard — not the query window) | Client and coach each receive an email + in-app notification (`session_reminder_client`/`coach`) roughly 6 hours before their session, including the Zoom join/start link if already created |

## Everything Else Is an "Opportunistic Sweep," Not a Schedule

These run inline, as a side effect of ordinary page loads/API calls — **there is no cron, queue, or worker process behind any of them**:

| Function | Underlying mechanism | Triggered by | Effect |
|---|---|---|---|
| `sweepMissedBookings()` | RPC `mark_missed_bookings()` | Every client/coach booking-list load; **also** re-run inside `has_scheduling_conflict()` itself, so it fires on virtually every scheduling read/write (hold, confirm, reschedule, cancel-regenerate, coach-matching, availability checks) | Flips any `upcoming` booking whose time window has fully elapsed to `missed`, unconditionally (no attendance check) |
| `expire_temporary_bookings()` | Same embedding as above | Same broad trigger set | Flips stale `held` holds past `expires_at` to `expired` |
| `sweepOverdueAttendance()` | RPC `flag_overdue_attendance()` | Coach opening Today's Tasks or Pending Tasks | Flags + one-shot-notifies for sessions 2h+ past end with no attendance marked |
| `sweepOverdueNotes()` | RPC `flag_overdue_notes()` | Same two coach screen loads | Flags + one-shot-notifies for sessions 2h+ past end, attendance present/late but no notes |
| `recomputeCoachRating()` | Plain aggregate query | Every `rateBooking()` call | Recomputes `coach_profiles.rating`/`review_count` from all trainer ratings — write-triggered, not read-triggered like the others |

**Consequence for reliability:** a booking can remain incorrectly labeled `upcoming` past its end time **indefinitely** if nobody ever loads a relevant list/dashboard for that coach again — there is no guarantee of eventual consistency without user activity, except for the one true cron job above.

---

# 27. Admin / Configuration System

## `system_settings` — Full Propagation Table (8 keys total, only 4 exposed in any admin UI)

| Key | Seeded default | Admin UI? | Every live reader | Behavior when changed |
|---|---|---|---|---|
| `reschedule_cutoff_hours` | 1 (was 12, repurposed by migration 0025) | **Yes** (Settings slider) | `reschedule_booking()` RPC; `getRescheduleOptionsAction`/`getSchedulingRulesAction` (display) | **Immediately live** — changes the server-enforced reschedule cutoff and its displayed copy simultaneously |
| `cancellation_cutoff_hours` | 12 (added 0025) | **Yes** | `cancel_booking()` RPC; `getSchedulingRulesAction` (display) | **Immediately live**, same pattern |
| `default_session_duration_minutes` | 45 | **Yes** | `adminDashboard.service.ts` (empty-slot KPI math) **only** | Changing it **only shifts the admin dashboard's "empty slots" number** — it does **not** change the real duration offered/booked for a session, which is hardcoded (`45`/`60`) directly in `client-portal.actions.ts::getBookingOptionsAction`. A real disconnect between the setting's own description and its actual effect. |
| `inactivity_threshold_days` | 30 | **Yes** | `inactive_clients_view` **only**, which has **zero application callers** | **Fully dead** — moving this slider changes nothing visible anywhere in the app |
| `assessment_session_duration_minutes` | 60 | No | **None found anywhere in application code** | **Fully dead setting** — the real 60-minute assessment duration is hardcoded in `getBookingOptionsAction`, fully decoupled from this row |
| `join_window_minutes` | 10 | No | **None found anywhere** | **Fully dead** — the real "Join enables 10 min before start" rule is a hardcoded constant in `JoinCountdown.tsx`, coincidentally matching today's seed value |
| `temporary_booking_hold_minutes` | 10 | No | `create_temporary_booking()` RPC | **Real, server-enforced, but only editable via direct database access** — no admin UI exposes this key at all |
| `booking_window_start_hour` / `booking_window_end_hour` | 5 / 22 | No | `scheduling.service.ts::getBookingWindow()` | **Real, server-enforced, only editable via direct database access** — controls which hours are offered as bookable slots platform-wide |

**Summary:** of 8 settings, 2 are genuinely live-and-exposed, 2 are exposed-but-dead (a real product-trust gap if noticed by an admin), and 4 have no admin UI at all — 2 of those 4 are also dead, and 2 are live but require direct database access to change.

## Package Catalog
Admin creates/edits packages (name, category, sessions, price, features, pause-days allowance) via `/admin/settings`. **Delete is always a soft delete** (`is_active:false`) — clients already on a package keep it; it simply stops being offered to new purchases. Immediately reflected on the public marketing pricing section (server-rendered from live data on every landing-page load) and the client's `/client/plans` screen.

## Coach Configuration
Working hours (`coach_availability`) are **admin-managed only** since migration 0045 — the coach's own Availability screen is read-only. Per-date overrides (`coach_shifts`) remain coach-self-manageable but have **no admin or client-facing UI to view them independently** — they only take effect silently inside the booking-conflict RPCs.

## What Changes Immediately vs. Requires a Deploy
Every `system_settings` change and every package-catalog change is **immediately live** for both web and (once built) mobile, since both read the same database with no caching layer in front of either. There is no feature-flag system anywhere in this codebase (**confirmed absent** — no LaunchDarkly/Split/homegrown flag table was found) — the closest equivalent is `package_tiers.is_active` (soft-enable/disable a specific plan) and `coach_profiles.status` (soft-enable/disable a specific coach), neither of which is a general-purpose flag mechanism.

---

# 28. Complete Feature Dependency Map

```
Payment (Razorpay)
  ↓
Subscription (created "awaiting_activation")
  ↓
Plan Activation (start date picked, one-time lock)
  ↓
Onboarding (health/goals intake, gates the dashboard until complete)
  ↓
Recurring Schedule / Coach Assignment
  ↓
Chat Conversation (auto-opened, gated on "has ever purchased")
  ↓
Bookings (auto-generated, 4 at a time, from the recurring slot)
  ↓
Session Lifecycle: Join → Attendance → Notes → Completed
  ↓
Progress Logging (gates booking/joining if stale) ←→ Coach Performance Metrics (reads attendance/notes/ratings)
  ↓
Rating / Feedback
  ↓
Renewal Opportunity (threshold-based) → new Payment (loop back to top)

Coach Assignment
  ↓
Coach Change Request (client-initiated) ──→ Admin Resolution ──→ Recurring Schedule repointed/replaced
  ↓
Coach Leave Request ──→ Admin Approval ──→ Shadow Coach Assignment (per-occurrence, scored) ──→ Bookings
  (coach_id repointed for the covered date range — NO automatic reversion, see §19)
  ↓
Escalation (client concern, can name a coach) ──→ Admin Call-Gate ──→ Classification/Notes ──→ Resolution

Admin Configuration (system_settings, package catalog)
  ↓
Immediately affects: booking cutoffs, cancellation cutoffs, package pricing/availability — all read live,
no caching layer, no feature-flag system

Audit / Timeline
  ↓
7-table DB-trigger audit_logs (bookings, subscriptions, coach_change_requests, client_profiles,
  coach_profiles, package_tiers, system_settings) — independent of, and narrower than —
client_timeline_events (27 event types, populated by explicit service-layer calls across nearly every
  mutation path, including several NOT covered by audit_logs at all: escalations, leave, shadow assignment)

Notifications
  ↓
Depends on: notification_templates (seed data) + a resolvable recipient profile_id/email/phone
  ↓
Fans out to: in-app row (always) + email via Resend (best-effort) + SMS via MSG91 (client-only, 7 fixed
  events, best-effort) — NO dependency on push infrastructure, since none exists
```

## Key Dependency Observations for Mobile
- **Nothing gates a mobile client differently than a web client** — every dependency above is enforced server-side (RLS + service-layer validation), so a mobile app cannot accidentally bypass a gate the web app enforces, provided it goes through the same RPCs/service functions (§22).
- **The measurement-staleness gate is the single most cross-cutting dependency** — it blocks booking, demo-booking, and (implied by the UI copy) session-joining across every entry point; a mobile rebuild must check it at the same points, not just at one "gatekeeper" screen.
- **Chat's dependency on "has ever purchased" (not "has an assigned coach")** means a mobile demo flow must not assume a chat channel exists just because a coach was assigned for the demo.

---

# 29. Mobile Development Backlog

EPIC → MODULE → FEATURE → SCREEN → API → DB → BUSINESS LOGIC → TEST CASE, prioritized P0 (critical/core) through P3 (nice-to-have). The mobile app must achieve full functional parity with the web application per §30's checklist; this backlog sequences that work.

## EPIC 1: Foundation & Auth (P0)
| Module | Feature | Screen | API | DB | Business Logic | Test Case |
|---|---|---|---|---|---|---|
| Auth | Email/password login | Login (role-aware) | `signInWithPassword` | `profiles` | Role-mismatch forced sign-out (§10) | Wrong-role login shows correct error, doesn't crash |
| Auth | Google OAuth | Login/Signup | `signInWithOAuth` + mobile-native OAuth redirect | `profiles` (trigger) | New Google identity always lands `client` | New Google user can never reach coach/admin dashboards |
| Auth | Email/password signup | Signup wizard | `signUp` + OTP actions | `auth.users`, `profiles`, `client_onboarding` | Client-declared role is inert (§10/§24) | Attempting to pass `role:"admin"` in signup payload has zero effect |
| Auth | Phone OTP | Signup step 3, Phone Gate | `sendPhoneOtpAction`/`verifyPhoneOtpAction` | `profiles.phone` | Decide: reproduce the "Skip" bypass or not (§24) | Skip path saves phone unverified if reproduced; OTP path requires real verification if not |
| Nav | Role-based routing shell | App root | JWT claim check | `profiles.role` (claim) | Mirror `middleware.ts`'s redirect-to-login-not-error pattern | Wrong-role deep link bounces to correct login, not a crash |

## EPIC 2: Client Core Loop (P0)
| Module | Feature | Screen | API | DB | Business Logic | Test Case |
|---|---|---|---|---|---|---|
| Dashboard | Journey-stage router | Home | `getMyJourneyStateAction` | `subscriptions`, `client_onboarding`, `recurring_slots`, `bookings` | 9-stage derivation (§6) | Every one of the 9 stages renders/redirects correctly |
| Sessions | List + tabs | My Sessions | `getClientSessionsAction` | `bookings` | 5-tab filter incl. `wasRescheduled` | Rescheduled tab currently always empty (reproduce the known bug, or flag as fixed if the mobile team chooses to fix it — §19.1) |
| Progress | Weekly measurement log | Progress | `submitMyProgressAction` | `progress_logs` | 7-day cap, Weight-only-required | Second submission within 7 days is rejected with the exact server message |
| Profile | Edit profile + photo | Profile | `updateMyProfileAction` | `profiles` | none beyond ownership | Photo uploads to the same `avatars` bucket/path convention |

## EPIC 3: Client Booking Engine (P0)
| Module | Feature | Screen | API | DB | Business Logic | Test Case |
|---|---|---|---|---|---|---|
| Booking | Ad-hoc/demo booking | Book/Demo wizard | `confirmBookingAction`/`bookDemoSessionAction` | `temporary_bookings`, `bookings` | Measurement-stale gate, hold→confirm 2-step | Stale-measurement client is blocked server-side even if the UI check is bypassed |
| Schedule | Recurring setup/change | My Schedule wizard | `matchScheduleAction`→`confirmScheduleAction`/`changeScheduleAction` | `recurring_slots`, `bookings` | 4-rung fallback ladder (existing coach) vs. exact-only (new/first-time) | Ladder falls through all 4 rungs before returning null |
| Cancel/Reschedule | Cutoff-gated actions | My Sessions | `cancelSessionAction`/`rescheduleSessionAction` | `bookings` | 12h/1h cutoffs, 2/week reschedule cap, no-same-day-double-booking | Attempt inside cutoff rejected server-side regardless of client state |

## EPIC 4: Payments & Subscriptions (P0)
| Module | Feature | Screen | API | DB | Business Logic | Test Case |
|---|---|---|---|---|---|---|
| Purchase | Razorpay Checkout (mobile SDK) | Plans | `createPackagePurchaseOrderAction`→`verifyPaymentAction` | `payments`, `subscriptions` | Signature verification is the sole trust boundary | A tampered signature is rejected, payment marked `failed` |
| Activation | Start-date picker | Activate Plan | `activatePlanAction` | `subscriptions` | One-time lock, ≥tomorrow IST | Second activation attempt on the same subscription is rejected |
| Subscription mgmt | Pause/Resume | Subscription | `pauseMySubscriptionAction`/`resumeMySubscriptionAction` | `subscriptions` | Status-guarded (only active→paused, paused→active) | Pausing an already-paused subscription is rejected |
| Renewal | Renewal check-in + schedule | Renewal Check-in, Schedule | `submitRenewalCheckinAction`, `keepRenewalScheduleAction` | `progress_logs`, `recurring_slots` | Bypasses the normal 7-day cap | Renewal check-in succeeds even if a regular log was submitted yesterday |

## EPIC 5: Coach Portal Core (P0)
| Module | Feature | Screen | API | DB | Business Logic | Test Case |
|---|---|---|---|---|---|---|
| Session ops | Join → Attendance → Notes | Session Detail | `markSessionJoinedAction`, `markAttendanceAction`, `submitSessionNotesAction` | `bookings`, `attendance`, `workout_notes` | Server-enforced sequencing gates (§4.B) | Notes submission before attendance-present/late is rejected with the exact server message |
| Roster | Clients list/detail | Clients | `getCoachClientsAction`/`getCoachClientDetailAction` | `client_profiles`, `bookings`, `progress_logs` (assigned-only) | Read-only banner for non-assigned clients reached via search | Global-search-reached client shows the read-only banner and no action buttons |
| Availability | Leave request | Availability | `requestLeaveAction` | `coach_leave` | 24h notice, no bypass, full-day vs. partial validation | Request inside 24h is rejected unconditionally, even for an admin-adjacent test account |

## EPIC 6: Cross-Cutting Client-Coach Features (P1)
| Module | Feature | Screen | API | DB | Business Logic | Test Case |
|---|---|---|---|---|---|---|
| Chat | Realtime messaging | My Chats | `sendChatMessageAction`, Realtime subscription | `conversations`, `messages` | Gated on "has ever purchased," conversation must be `active` | A demo-only client sees no chat channel at all |
| Escalations | Raise/view | My Concerns | `raiseConcernAction`, `listMyConcernsAction` | `escalations` | Category vocabulary matches the DB CHECK constraint exactly | Category dropdown never diverges from the 7 DB-permitted values |
| Coach Change | Request/complete | My Coach | `requestCoachChangeAction`...`completeCoachChangeAction` | `coach_change_requests`, `recurring_slots` | Approved-without-coach requires client self-serve completion | Client cannot re-complete an already-completed request |

## EPIC 7: Notifications Infrastructure (P1 — genuinely new)
| Module | Feature | Screen | API | DB | Business Logic | Test Case |
|---|---|---|---|---|---|---|
| Push | Device token registration | (background, app launch) | **New endpoint required** | **New table required** (device tokens) | No existing pattern to mirror — design fresh | Token registers on login, unregisters on logout |
| Push | Deep-link from notification | any relevant screen | Existing `notifications` table as content source | `notifications` | Map each of the ~40 template keys to a target screen | Tapping a "session reminder" push opens the correct Session Detail |

## EPIC 8: Admin Portal (P2 — scope decision required first, §20)
| Module | Feature | Screen | API | DB | Business Logic | Test Case |
|---|---|---|---|---|---|---|
| Client/Coach mgmt | Search + detail (read+light-write) | Search, Client/Coach Detail | existing admin actions | multiple | Same manual-control gating as web | Mobile-adapted forms enforce the same validation as the web modals |
| Approval queues | Leave/Coach-Change/Escalation | respective queues | existing admin actions | multiple | Same gated workflows (§6) | Escalation resolution is blocked until "Confirm I've Called" on mobile too |
| Bulk ops, Reports, Settings | **Recommend web/tablet-only** (§20) | — | — | — | — | — |

## EPIC 9: Testing & Parity Verification (P0, ongoing)
Systematic pass through every acceptance criterion implied by §6/§11/§19, run against the mobile app, not just re-tested on web. See §31 for the full test-case catalog.

## EPIC 10: Store Release (P1)
Android + iOS submission, including native permission prompts (camera, photo library, push notifications) and Zoom deep-link/SDK integration testing on real devices.

---

# 30. Functional Parity Checklist

Exhaustive. Every web screen/feature identified across all four frontend audits. "Status" is Pending for every row (this document is a specification, not a build log) unless otherwise noted.

## Public / Auth

| ID | Web Function | Web Screen | Mobile Equivalent | API | Status |
|---|---|---|---|---|---|
| F001 | Landing/marketing content | `/` | Mobile-adapted marketing screens (no 3D layer) | `listPublicActivePackages` | Pending |
| F002 | Client login | `/login/client` | Login screen | `signInWithPassword` | Pending |
| F003 | Coach login | `/login/coach` | Login screen (role-aware) | `signInWithPassword` | Pending |
| F004 | Admin login | `/login/admin` | Login screen (role-aware) | `signInWithPassword` | Pending |
| F005 | Google OAuth login/signup | all login pages, signup | Native OAuth flow | `signInWithOAuth` | Pending |
| F006 | Client self-serve signup | `/signup` | Signup wizard | `signUp` + OTP actions | Pending |
| F007 | Email OTP verification | signup step 2 | Signup wizard step | `verifyOtp` | Pending |
| F008 | Phone OTP verification | signup step 3, Phone Gate | Signup wizard step / gate screen | `sendPhoneOtpAction`/`verifyPhoneOtpAction` | Pending |
| F009 | Forgot/Reset password | — (does not exist on web) | **Decision required**: build new, or omit for parity | N/A | **Not implemented anywhere — flag for product decision** |

## Client Portal

| ID | Web Function | Web Screen | Mobile Equivalent | API | Status |
|---|---|---|---|---|---|
| F010 | Dashboard / journey router | `/client/dashboard` | Home tab | `getMyJourneyStateAction`, `getClientDashboardAction` | Pending |
| F011 | Activate plan | `/client/activate` | Activate screen | `activatePlanAction` | Pending |
| F012 | Onboarding intake | `/client/onboarding` | Onboarding wizard | `submitOnboardingAction` | Pending |
| F013 | Ad-hoc/first booking | `/client/book` | Book Session wizard | `confirmBookingAction` | Pending |
| F014 | Demo booking | `/client/demo-booking` | Demo Booking screen | `bookDemoSessionAction` | Pending |
| F015 | Demo feedback gate | embedded in Book | Feedback bottom sheet | `rateSessionAction` | Pending |
| F016 | Plan purchase (Razorpay) | `/client/plans` | Plans screen (mobile SDK checkout) | `createPackagePurchaseOrderAction`/`verifyPaymentAction` | Pending |
| F017 | My Coach view + change request | `/client/coach` | My Coach screen | `getMyCoachAction`, `requestCoachChangeAction` | Pending |
| F018 | Coach-change completion | `/client/coach` | My Coach screen | `findCoachChangeOptionsAction`, `completeCoachChangeAction` | Pending |
| F019 | Raise/track concerns | `/client/concerns` | My Concerns screen | `raiseConcernAction`, `listMyConcernsAction` | Pending |
| F020 | Chat with coach | `/client/chats` | My Chats tab | `sendChatMessageAction` + Realtime | Pending |
| F021 | Sessions list + tabs | `/client/sessions` | My Sessions tab | `getClientSessionsAction` | Pending |
| F022 | Cancel session | `/client/sessions` | My Sessions | `cancelSessionAction` | Pending |
| F023 | Reschedule session (3 sub-flows) | `/client/sessions` | My Sessions | `rescheduleSessionAction`/`rescheduleSessionToSubstituteAction`/`checkRescheduleTimeAction` | Pending |
| F024 | Rate a completed session | `/client/sessions` | My Sessions | `rateSessionAction` | Pending |
| F025 | Recurring schedule setup/change | `/client/schedule` | My Schedule wizard | `matchScheduleAction`/`confirmScheduleAction`/`changeScheduleAction` | Pending |
| F026 | Renewal "keep schedule" shortcut | `/client/schedule` | My Schedule | `keepRenewalScheduleAction` | Pending |
| F027 | Notify support on unmatched schedule | `/client/schedule` | My Schedule | `reportScheduleUnmatchedAction` | Pending |
| F028 | Progress logging | `/client/progress` | Progress tab | `submitMyProgressAction` | Pending |
| F029 | Renewal check-in | `/client/renewal-checkin` | Renewal Check-in screen | `submitRenewalCheckinAction` | Pending |
| F030 | Subscription view + pause/resume | `/client/subscription` | Subscription screen | `pauseMySubscriptionAction`/`resumeMySubscriptionAction` | Pending |
| F031 | Notifications feed | `/client/notifications` | Notifications tab | `listMyNotificationsAction`/`markNotificationReadAction` | Pending |
| F032 | Profile edit + photo | `/client/profile` | Profile tab | `updateMyProfileAction` | Pending |
| F033 | Change password | `/client/profile` | Profile tab | `supabase.auth.updateUser` | Pending |
| F034 | Phone Gate (global) | layout-level modal | Global gate screen/sheet | phone-otp actions | Pending |
| F035 | Measurement Gate (global) | layout-level modal | Global gate screen/sheet | `submitMyProgressAction` | Pending |
| F036 | Sessions-Low Gate (global) | layout-level modal | Global gate screen/sheet | — (navigates to Plans) | Pending |

## Coach Portal

| ID | Web Function | Web Screen | Mobile Equivalent | API | Status |
|---|---|---|---|---|---|
| F037 | Dashboard | `/coach/dashboard` | Home tab | `getCoachDashboardAction` | Pending |
| F038 | Today's/Pending Tasks | Dashboard, Schedule | Home/Schedule widgets | `getCoachTodayTasksAction`/`getCoachPendingTasksAction` | Pending |
| F039 | Pending Tasks gate modal | global (coach layout) | Global soft-nudge screen/sheet | `getCoachPendingTasksAction` | Pending |
| F040 | Schedule (Day/Week) | `/coach/schedule` | Schedule tab | `getCoachScheduleAction` | Pending |
| F041 | Clients list (own roster) | `/coach/clients` | Clients tab | `getCoachClientsAction` | Pending |
| F042 | Client detail (read-only) | `/coach/clients/[id]` | Client Detail screen | `getCoachClientDetailAction` | Pending |
| F043 | Global client search | `/coach/search` | Search screen | `searchAllClientsAction` | Pending |
| F044 | Chats (4-category) | `/coach/chats` | My Chats tab | `getMyChatsAsCoachAction` + Realtime | Pending |
| F045 | Availability view (read-only) + leave request | `/coach/availability` | Availability screen | `getCoachAvailabilityAction`, `requestLeaveAction` | Pending |
| F046 | Renewal opportunities | `/coach/renewals` | Renewals screen | `getRenewalOpportunitiesAction` | Pending |
| F047 | Escalations (read-only) | `/coach/escalations` | Escalations screen | `getCoachEscalationsAction` | Pending |
| F048 | Performance (read-only) | `/coach/performance` | Performance screen | `getMyPerformanceAction`, `getMyActivityAction` | Pending |
| F049 | Profile (edit contact, add skill, password) | `/coach/profile` | Profile tab | `updateMyCoachProfileAction`, `addMySkillAction` | Pending |
| F050 | Notifications | `/coach/notifications` | Notifications tab | `listMyNotificationsAction` | Pending |
| F051 | Session Detail: Join | `/coach/session/[id]` | Session Detail screen | `markSessionJoinedAction` | Pending |
| F052 | Session Detail: Mark Attendance | `/coach/session/[id]` | Session Detail screen | `markAttendanceAction` | Pending |
| F053 | Session Detail: Submit Notes | `/coach/session/[id]` | Session Detail screen | `submitSessionNotesAction` | Pending |

## Admin Portal

| ID | Web Function | Web Screen | Mobile Equivalent | API | Status |
|---|---|---|---|---|---|
| F054 | Dashboard (KPIs) | `/admin/dashboard` | Home tab | `getAdminDashboardAction` | Pending |
| F055 | Activity Log | `/admin/activity-log` | Activity Log screen | `getAuditLogAction` | Pending |
| F056 | Availability Check (cross-coach) | `/admin/availability` | Availability Check screen | `getAvailabilityCheckAction` | Pending |
| F057 | Clients list | `/admin/clients` | Clients tab | `listAdminClientsAction` | Pending |
| F058 | Add Client (migration wizard) | `/admin/clients/new` | Add Client wizard | `createMigratedClientAction`, `checkSlotAvailabilityAction` | Pending |
| F059 | Client Detail + Manual Controls | `/admin/clients/[id]` | Client Detail screen | multiple (adjust/transfer/shadow/pause/measurement/escalation/refund) | Pending |
| F060 | Client Timeline | Client Detail | Client Detail screen | `getClientTimelineAction` | Pending |
| F061 | Admin Client Chats (view-only) | Client Detail | Client Detail screen | `getClientChatsForAdminAction` | Pending |
| F062 | Coaches list | `/admin/coaches` | Coaches tab | `listAdminCoachesAction` | Pending |
| F063 | Add Coach | `/admin/coaches/new` | Add Coach wizard | `createCoachAction` | Pending |
| F064 | Coach Detail + Admin Controls | `/admin/coaches/[id]` | Coach Detail screen | multiple (edit/skills/block/reassign/disable/working-hours) | Pending |
| F065 | Escalations list (global) | `/admin/escalations` | Escalations screen | `listAllEscalationsAction` | Pending |
| F066 | Escalation Detail (gated resolution) | `/admin/escalations/[id]` | Escalation Detail screen | `confirmCalledClientAction`...`resolveEscalationAction` | Pending |
| F067 | Leave Requests (approval + shadow summary) | `/admin/leave-requests` | Leave Requests screen | `resolveLeaveAction` | Pending |
| F068 | Notifications | `/admin/notifications` | Notifications tab | `listMyNotificationsAction` | Pending |
| F069 | Renewal Opportunities | `/admin/renewals` | Renewals screen | `getRenewalOpportunitiesAction` | Pending |
| F070 | Reports (CSV/PDF export ×5) | `/admin/reports` | **Web/tablet-recommend** | `generate*ReportAction` | Pending |
| F071 | Sales list | `/admin/sales` | Sales screen | `listSalesAction` | Pending |
| F072 | Scheduling (grouped activity) | `/admin/scheduling` | Scheduling screen | `getAdminSchedulingViewAction` | Pending |
| F073 | Universal Search | `/admin/search` | Search tab | `searchAdminClientsAction` | Pending |
| F074 | Sessions list + reschedule/cancel | `/admin/sessions` | Sessions screen | `rescheduleSessionAction`/`cancelSessionAction` | Pending |
| F075 | Session Detail (read-only) | `/admin/sessions/[id]` | Session Detail screen | `getAdminSessionDetailAction` | Pending |
| F076 | Settings: Package catalog | `/admin/settings` | **Web/tablet-recommend** | `createPackageAction`/`updatePackageAction`/`deletePackageAction` | Pending |
| F077 | Settings: Session Rules sliders | `/admin/settings` | **Web/tablet-recommend** | `updateSettingAction` | Pending |
| F078 | Shadow Coverage queue + manual assign | `/admin/shadow-coverage` | **Web/tablet-recommend** (or mobile-adapted list) | `listShadowCoverageGapsAction`, `previewShadowAssignmentPlanAction`/`confirmShadowAssignmentPlanAction` | Pending |
| F079 | Coach Change Requests (approval) | `/admin/coach-change-requests` | Coach Change Requests screen | `resolveCoachChangeRequestAction` | Pending |

## Cross-Cutting / New Capabilities

| ID | Feature | Web Equivalent | API | Status |
|---|---|---|---|---|
| F080 | Push notifications | **None exists on web** | New endpoint + device token table required | **Net-new capability, not a port** |
| F081 | Native camera/gallery for uploads | Web `<input type=file>` | Same Storage buckets/paths | Pending (UI-layer swap only) |
| F082 | Session-reminder cron | GitHub Actions → `/api/cron/session-reminders` | Same backend, no mobile-side change needed | N/A — server-side only |

---

# 31. Testing Requirements

For every major feature: happy path, invalid input, unauthorized user, missing data, network failure, API failure, edge case, different roles/subscription states, device sizes, offline/poor-network.

## Authentication
- Happy path: correct-role login succeeds and lands on that role's dashboard.
- Wrong role: correct credentials, wrong portal → forced sign-out + exact error message shown (§10).
- Invalid input: malformed email/short password blocked before any network call.
- Network failure: Supabase unreachable → generic inline error, no crash.
- Edge case: session token expired mid-session → next protected action fails with "Not authenticated"; next navigation triggers middleware's login redirect.
- Edge case: attempt to sign up with `role:"admin"` in the payload → account created as `client` regardless (verify the server-side inertness, §10).

## Booking
- Happy path: eligible client books an open slot → booking created, appears in both parties' schedules.
- Invalid input: past date/time selected → rejected.
- Missing data: no measurement log yet → booking blocked server-side with the exact message, even if a compromised client bypasses the UI disable.
- Different subscription states: `paused`/`expired`/`not_paid` client attempting to book → routed to the appropriate marketing/renewal screen, not a raw booking form.
- Edge case: two devices attempt to book the exact same slot simultaneously → exactly one succeeds (verify the exclusion constraint at the DB level, §7.2).
- Edge case: session-credit exhausted (sessions_remaining=0) → `confirm_booking` rejects with "No sessions remaining on this package."
- Offline: booking attempt while offline → clear error, no partial/duplicate booking on reconnect.

## Cancellation / Reschedule
- Happy path (outside cutoff): both actions succeed.
- Edge case (inside cutoff): both actions rejected server-side with the exact cutoff message, verified independent of client-side button state (simulate a stale client bypassing the disabled attribute).
- Edge case: 3rd reschedule attempt in the same week → rejected ("maximum reschedule limit for this week").
- Edge case: reschedule to a date where the client already has another session → rejected.
- Role variation: admin performs both actions with no cutoff enforcement.

## Payments
- Happy path: Checkout completes, signature verifies, subscription created.
- API failure: Razorpay order-creation call fails → clean error before any Checkout modal opens.
- Edge case: signature tampered/mismatched → `payments.status='failed'`, no subscription created.
- Edge case: payment captured but fulfillment throws (simulate a slot/plan race) → `payments.status='paid_unfulfilled'`, support-reference error shown, verify no money is "lost" (row still exists, flagged).
- Edge case: webhook fires before the client-side callback → `fulfillPaymentByWebhook` completes the purchase; verify the client-side callback arriving afterward is a safe no-op (idempotency check).
- Different roles: admin-driven purchase (`purchaseSubscription`) creates a subscription directly `active`, no Razorpay step — verify this path independently.

## Attendance / Session Notes (Coach)
- Happy path: session ends → Present marked → notes submitted → booking completed.
- Edge case: attendance attempted before session end → rejected server-side.
- Edge case: attendance attempted for today's session without having clicked Join → rejected; verify a backlog (previous-day) session skips this specific check.
- Edge case: notes submitted before attendance is present/late → rejected with the exact message.
- Edge case: Absent marked → verify notes phase never appears, booking is `missed` immediately.
- Race condition: `mark_missed_bookings()` fires (simulate by letting a session go stale) before the coach marks attendance → verify the coach then sees "Booking not found, or not upcoming" (a known, reproducible edge case, §19.3) — confirm mobile handles this gracefully rather than crashing.

## Coach Leave → Shadow Coverage
- Happy path: leave approved, all affected clients get a scored shadow coach assigned.
- Edge case: leave request inside 24h notice → rejected unconditionally (verify no admin-adjacent bypass exists on mobile either).
- Edge case: an occurrence with zero available shadow candidates → verify it's flagged (not silently dropped) and an admin-side alert fires.
- Edge case: the shadow-covered coverage period ends → verify (and document, do not silently "fix") that the booking does NOT automatically revert to the primary coach.
- Edge case: admin's "block a slot" (`createOneDayLeave`) → verify NO shadow cascade runs and no client notification fires.

## Escalations
- Happy path: raise → admin confirms call → classify → resolve → client sees resolution.
- Edge case: any resolution-workflow action attempted before "Confirm I've Called the Client" → rejected server-side (test this via a direct API call, not just via the UI, to confirm it's not merely a UI-hidden control).
- Edge case: `updateEscalationDetails` called with only one of the three fields → verify the other two are nulled (full-replace, not merge — a real, confirmed behavior to test for, §19.1).

## Chat
- Happy path: message sent while conversation is active → delivered, read receipt updates in near-real-time.
- Edge case: message attempted in a closed conversation → rejected (RLS-level).
- Edge case: demo-only client (no subscription ever) → verify no conversation exists at all, no chat entry point renders.
- Edge case: coach reassigned mid-conversation → old thread freezes (still readable by the former coach), a new thread opens with the new coach.
- Offline/poor network: message sent while offline → queued/retried, not silently dropped; verify no duplicate send on reconnect.

## Progress / Measurements
- Happy path: first log ever → succeeds, becomes the Day-1 baseline.
- Edge case: second log attempt within 7 days → rejected with the exact message.
- Edge case: renewal check-in → succeeds even immediately after a regular log (bypasses the cap by design).
- Role variation: admin backfill → no cap applies, and verify it does NOT notify the coach (unlike a client-initiated log).

## Cross-Role / Cross-Platform
- Different device sizes: verify every bottom-sheet/modal mapping from §16 renders correctly on both small phones and tablets.
- Different roles hitting the same feature: verify the permission matrix (§2) is enforced identically to web for every feature above, on mobile.
- Realtime/offline: chat is the one feature requiring live delivery (§45 in the architecture discussion) — verify reconnect-and-catch-up behavior after a network drop; every other feature should degrade gracefully to "stale until refreshed," matching web's own non-realtime behavior.

---

# 32. Final "Source of Truth" Summary

## 1. Complete List of Roles
Client, Coach, Admin (authenticated), Visitor/Prospect (unauthenticated). No sub-roles exist.

## 2. Complete List of Modules
Authentication, Dashboard, Booking/Scheduling, Payments/Subscriptions, Coach Management, Client Management, Coach Change, Leave/Shadow Coverage, Escalations, Chat, Notifications, Progress/Measurements, Reports/Sales/Activity Log, Platform Settings, Public/Marketing.

## 3. Complete List of Screens
64 total routes: 5 public/auth, 17 client (16 routed + index redirect), 13 coach (12 routed + index redirect), 26 admin (25 routed + index redirect) — see §4 and §30 for the full itemized inventory.

## 4. Complete List of Features
82 discrete features cataloged in §30's parity checklist (F001–F082), spanning authentication, booking, payments, coach lifecycle, escalations, chat, notifications, and admin operations.

## 5. Complete List of APIs
No REST/GraphQL API exists — 34 Server Action files (§9.2) + 35 backing service files + ~13 Postgres RPC functions (§7.4) + exactly 2 real HTTP Route Handlers (Razorpay webhook, session-reminders cron).

## 6. Complete List of Database Entities
~28 tables, 19 enums, 6 views, ~13 app-called RPC functions (plus internal helpers/triggers), 4 storage buckets (2 of which are schema-only/unused) — full detail in §7.

## 7. Complete List of Integrations
Razorpay (payments), Zoom (video), Resend (email), MSG91 (SMS+OTP), Supabase (Auth/Storage/Realtime/Postgres), GitHub Actions (the cron trigger). **Confirmed absent:** analytics/tracking, push notifications, any job queue.

## 8. Complete List of Business Rules
Cataloged in §6 (IF/THEN form) and cross-referenced throughout §11 (state machines) and §19 (edge cases) — cutoffs (12h cancel/1h reschedule), caps (2 reschedules/week, 1 rating/7 days, 1 progress log/7 days), gates (measurement-staleness, escalation call-confirmation, attendance-before-notes), and the derived 6-bucket client status.

## 9. Complete List of Workflows
Documented end-to-end in §3 and §8: client acquisition, demo-first entry, regular session loop, cancellation/reschedule, coach change, renewal, escalation (client side); daily operational loop, client management, communication, leave/availability, performance (coach side); client/coach management, coach-change resolution, leave-approval shadow cascade, escalation resolution, manual shadow coverage, platform configuration, reporting (admin side).

## 10. Complete List of Status/State Transitions
9 stateful entities documented in §11: `bookings.status`, `temporary_bookings.status`, `subscriptions.status`, `payments.status`, `attendance.status`, `coach_leave.status`, `escalation_status`, `coach_change_status`, `shadow_coach_assignments.status`, plus the derived (never-stored) `ClientStatus`.

## 11. Complete Mobile Screen Architecture
Three role-branched bottom-tab navigators (Client: 5 tabs + Profile menu; Coach: 4 tabs + Profile menu; Admin: 4 tabs + Profile menu, with several dense screens recommended web/tablet-only) — full detail in §21.

## 12. Web → Mobile Feature Mapping
Complete in §20 and §30 — nearly every web feature maps 1:1 to a mobile screen/interaction; the explicit exceptions (Reports, Settings, Shadow Coverage's manual tool) are recommended web/tablet-only due to genuine ergonomic mismatch, not because the underlying feature is unimportant.

## 13. Backend Reuse Strategy
§22's core finding: **no REST API exists today** — the mobile project's first and most consequential decision is whether to have mobile call Supabase directly (reusing RLS/RPCs as-is, but requiring business logic to be duplicated or migrated to Postgres) or to build a thin Route-Handler wrapper around the existing 35 service files (higher upfront cost, zero logic duplication, one shared path for both platforms). This document does not choose — it is flagged as a required decision.

## 14. Missing / Unclear Areas (Needs Verification)
- Which deployment target (Vercel vs. Netlify) is authoritative for production.
- Whether the four separate Next.js build directories represent genuinely separate deployed instances.
- The exact derivation and edge-case behavior of `hasEverSubscribed` (renewal "expired" classification).
- Whether any max file-size/type restriction exists on Storage uploads beyond RLS scoping.
- CORS configuration on the two Route Handlers.
- Whether any rate-limiting exists at the Supabase or hosting-platform infrastructure level.
- Exact Supabase-side password policy configuration.
- Whether recording is a supported Zoom feature in this deployment (no code evidence either way).
- Whether an invoice/receipt-generation feature exists anywhere (none found).
- The very first admin account's provisioning method (no in-app path exists).

## 15. Recommended Implementation Sequence
Per §29's ten-epic backlog: Foundation & Auth → Client Core Loop → Client Booking Engine → Payments & Subscriptions → Coach Portal Core → Cross-Cutting Client-Coach Features → Notifications Infrastructure → Admin Portal (scope-decided) → Testing & Parity Verification (continuous) → Store Release. The single highest-leverage decision gating all of this is §22's API-architecture choice, which should be resolved before any other epic begins.