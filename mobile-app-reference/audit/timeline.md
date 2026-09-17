 # Client Timeline — Full Workflow Spec (for mobile app parity)

Source of truth: this is how the existing **web app** (Next.js + Supabase) implements the client's activity timeline — a permanent, chronological audit trail of everything that happens on a client's account (bookings, plan changes, coach changes, measurements, escalations, refunds, etc.), viewable by **Admin and Coach only**. Replicate this exact data model and rendering logic in the mobile app — same event types, same "internal vs customer" split, same immutability guarantee — not just the UI shape.

---

## 1. Concept

The Timeline is **not a separate feature with its own business logic** — it's a passive, append-only log that every other service in the app writes a row to whenever something meaningful happens to a client. Key properties:

- Single table, `client_timeline_events` — one row per event, tagged with a fixed `event_type` enum (25 values today), a human title, an optional longer description, optional structured `metadata` (JSON), an optional `actor_id` (who did it, if anyone), and `created_at`.
- **Append-only / immutable.** No update or delete RLS policy exists for any role (admin included) — once written, a row can never be edited or removed by the application layer. This is a deliberate design choice: the timeline is a trustworthy historical record, not an editable log.
- **Not a UI-driven feature.** There is no "add timeline entry" button anywhere. Every row is written as a **side effect** of some other action (booking a session, purchasing a plan, an admin adjusting pause-days, etc.) — the same pattern the codebase uses for notifications (`createFromTemplate()`).
- **Visible to Admin (any client) and Coach (their own linked clients, or read-only via Global Search for any client) — never to the client themselves.** The client-facing "Progress" screen shows a related but distinct thing: their own session/measurement history, not this internal/customer-labeled timeline.
- Two logical "sides" per event — **internal** (LEANR/staff-side actions: coach assigned, session cancelled by staff, plan purchased, etc.) and **customer** (things fundamentally about the client's own interaction: onboarding, raising a concern, logging measurements). This split is **fixed per event type**, not derived from who technically clicked the button — e.g. an admin backfilling a client's weight on their behalf still renders as a customer-side "measurement logged" event, not an admin action. Two event types (`session_cancelled`, `session_rescheduled`) are the sole exception — they're actor-dependent, because both a client and staff can trigger them, and the UI should reflect which one actually did.

---

## 2. Data model

### 2.1 Event type enum (25 values)
```
plan_purchased | plan_activated | onboarding_completed | coach_assigned | slot_assigned |
session_completed | session_missed | attendance_marked_present | session_cancelled |
coach_notes_uploaded | weekly_measurements_updated | client_raised_concern |
escalation_created | escalation_resolved | pause_started | pause_ended | coach_changed |
shadow_coach_assigned | manual_session_added | session_rescheduled | plan_extended |
plan_renewed | refund_requested | refund_approved | plan_completed | plan_promise_adjusted |
client_status_changed
```
(`refund_approved` and `plan_completed` exist in the type/label/icon maps but currently have **no write call site anywhere in the codebase** — reserved for future use, not yet wired to any action. Don't treat their absence as a bug to fix; just know they're dormant.)

### 2.2 Row shape
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `client_id` | uuid (FK) | whose timeline this belongs to |
| `event_type` | enum (above) | |
| `title` | text | short display title, set by the caller (e.g. "Coach assigned") |
| `description` | text, nullable | longer free text (e.g. a cancellation reason) |
| `metadata` | jsonb, nullable | structured extra fields shown in an expandable detail view (e.g. `{fromCoachId, toCoachId}`) |
| `actor_id` | uuid, nullable (FK to profiles) | who did it; null = system/automated |
| `created_at` | timestamp | |
| `updated_at` | — | **does not exist as a real column today** — always rendered as null; kept on the display row shape only so a future "revisable session notes" feature can populate it later without another shape change. Don't build editing around this. |

### 2.3 Side classification (fixed table, not derived per-row)
```
internal: plan_purchased, plan_activated, coach_assigned, slot_assigned, session_completed,
          session_missed, attendance_marked_present, session_cancelled*, coach_notes_uploaded,
          pause_started, pause_ended, coach_changed, shadow_coach_assigned, manual_session_added,
          session_rescheduled*, plan_extended, plan_renewed, refund_requested, refund_approved,
          plan_completed, plan_promise_adjusted, client_status_changed

customer: onboarding_completed, weekly_measurements_updated, client_raised_concern,
          escalation_created, escalation_resolved

* session_cancelled / session_rescheduled: the table above is only the FALLBACK for a
  null/unresolved actor. In practice, these two are actor-dependent — resolved per-row
  at read time using the actual actor's role (client → "customer" side, anyone else →
  "internal" side), since both clients and staff can trigger a cancel/reschedule and the
  UI needs to reflect which one actually did it.
```

### 2.4 "Added by" resolution (who gets credit on the card)
```
IF event_type is session_cancelled/session_rescheduled AND an actor exists:
  actor.role === 'client'  → side="customer", actor_source="customer", label=actor's name
  actor.role !== 'client'  → side="internal", actor_source="staff",    label=actor's name
ELSE (fixed-side event types):
  side = the fixed table above
  IF an actor exists       → actor_source = actor.role==='client' ? "customer" : "staff", label=actor's name
  ELSE IF side="internal"  → actor_source="system", label="SYSTEM"   (automated transition, no human actor)
  ELSE (side="customer", no actor) → actor_source="unknown", label="N/A"  (e.g. admin logs
                                       a concern on the client's behalf with no actor recorded)
```

---

## 3. Complete event-type → trigger mapping

Every row currently written in the app, with what triggers it and who (which role) can cause it:

| Event type | Title logged | Triggered by | Who can cause it |
|---|---|---|---|
| `plan_purchased` | "Purchased {package}" / "Migrated onto {package}" | Plan purchase completes (Razorpay success), or admin manually migrates a client onto a package | Client (self-serve purchase) or Admin |
| `plan_activated` | "Plan activated" | Client picks a start date on `/client/activate` | Client |
| `onboarding_completed` | "Onboarding Completed" | Client submits the one-time intake form | Client |
| `coach_assigned` | "Coach assigned" | A recurring schedule is first set up (new client or renewal) | System, as a result of Client/Admin action |
| `slot_assigned` | "Recurring schedule set" | Recurring weekly slot pattern created/changed | Client (schedule setup) or Admin |
| `session_completed` | "Session Done" (attendance: present/late) | Coach submits session notes after marking attendance present/late | Coach |
| `session_missed` | "Session Done" (attendance: absent) | Coach marks attendance absent | Coach |
| `attendance_marked_present` | "Attendance marked" | (see session_completed — logged alongside) | Coach |
| `session_cancelled` | "Session cancelled" | Any session (incl. demo) is cancelled | Client, Coach, or Admin |
| `coach_notes_uploaded` | "Session Note Updated" | Coach submits session notes | Coach |
| `weekly_measurements_updated` | "Weekly measurements updated" | Client logs measurements (or admin backfills on their behalf) | Client (or Admin on client's behalf — still renders "customer" side) |
| `client_raised_concern` | *(the concern's own reason text)* | Client raises a support concern | Client |
| `escalation_created` | — | An escalation is logged against the client | Admin (escalation intake) |
| `escalation_resolved` | "Escalation resolved" | Admin marks an escalation resolved | Admin |
| `pause_started` | "Subscription paused" | Subscription paused | Admin |
| `pause_ended` | "Subscription resumed" | Subscription resumed | Admin |
| `coach_changed` | "Coach changed" | A coach-change request completes, or admin directly reassigns | Client (via approved request) or Admin |
| `shadow_coach_assigned` | "Shadow coach assigned" / "Shadow coach reassigned" | Admin assigns/reassigns a shadow coach for leave coverage | Admin |
| `manual_session_added` | "Session added" | A one-off (non-recurring) booking is created — includes demo bookings | Client or Admin |
| `session_rescheduled` | "Session rescheduled" / "Recurring schedule changed" | A session is rescheduled, or a client's recurring pattern is changed | Client, Coach, or Admin |
| `plan_extended` | "Plan extended to {N} sessions" | Admin adjusts a subscription's total session count | Admin |
| `plan_renewed` | "Plan renewed" | A renewal purchase/scheduling flow completes | Client (renewal flow) |
| `refund_requested` | "Refund requested: ₹{amount}" | Admin logs a refund request (audit-only — no real payment gateway call) | Admin |
| `refund_approved` | *(dormant — no current write path)* | — | — |
| `plan_completed` | *(dormant — no current write path)* | — | — |
| `plan_promise_adjusted` | "Pause-days allowance increased/decreased by {N}" | Admin grants/revokes pause-day allowance | Admin |
| `client_status_changed` | "Status changed to {label}" | The derived client status (§8.6 of the demo-booking brief) changes as a side effect of any booking/subscription mutation | System (computed automatically around booking/status-affecting actions) |

---

## 4. Where it's viewed (UI placement)

**Admin Client Detail** (`/admin/clients/[id]`) — section titled **"Client Journey Timeline"**, rendered near the bottom of the page below client info, coach assignment, escalations, and chat. Admin sees the full timeline for **any** client, no restriction.

**Coach Client Detail** (`/coach/clients/[id]`) — section titled **"Progress Timeline"**, same component, same data shape. A coach sees the timeline for:
- Any client currently assigned to them, in full.
- Any *other* client found via Global Search, in **read-only** mode with a banner: *"Read-only — this client isn't assigned to you, found via Global Search. Billing, progress, and session details are only visible to their assigned coach."* (Note: the timeline itself is still shown even in this case — RLS was deliberately widened so any coach can read any client's `client_timeline_events`/`client_profiles` row for lookup purposes, though `progress_logs` stays assigned-coach-only.)

**Client portal:** the client **never sees this component**. Their closest equivalent is the "Progress" screen, which shows their own measurement history and session/coach-notes list — a different, purpose-built view, not this internal/customer-tagged audit log.

---

## 5. UI/UX design (exact behavior to replicate)

### 5.1 Two display modes, toggled by the user
- **Split view** (default): two columns with a vertical divider and a center icon rail. Column headers: **"LEANR Event"** (left) / **"Customer Event"** (right). Each event card renders in the column matching its `side` — internal on the left, customer on the right — with a colored icon badge (teal for internal, orange for customer) sitting on the center divider between them.
- **Merged view**: single column, every event in one chronological list, icon badge to the left of each card (same teal/orange coloring by side).
- Both modes group events by **timestamp** (date + time-to-the-minute) — multiple events firing within the same minute (e.g. `coach_assigned` + `slot_assigned` from one schedule-setup action) share one date/time header instead of repeating it per card.

### 5.2 Filtering
A single dropdown: "Filter by event type/source: All" or any specific event type that actually appears in this client's history (the dropdown only lists types present in the data, not the full 25-value enum unconditionally).

### 5.3 Event card
- Bold title line (e.g. "Coach assigned").
- Optional description below it, in a lighter weight (multi-line safe — literal `<br>` tags from any legacy data source are converted to real line breaks; no raw HTML is ever rendered).
- Thin divider, then a colored **"Added by: {name / SYSTEM / N/A}"** line (teal text on internal cards, orange text on customer cards).
- If the row has any `metadata` keys, the whole card becomes clickable (chevron icon shown) and opens a **detail modal**: header repeats the timestamp + title, then description, then every metadata key/value pair rendered as a "humanized label → value" list (e.g. `fromCoachId` → "From Coach Id").
- Cards with no metadata are not clickable (no chevron, no pointer cursor).

### 5.4 Icon per event type
Each of the 25 event types maps to a distinct icon (shopping-bag for plan purchased, user-plus for coach assigned, calendar-plus for schedule set, check-circle for session completed, x-circle for missed/cancelled, pencil for notes uploaded, scale for measurements, message-warning for concerns raised, alert-octagon for escalation created, pause/play-circle for pause/resume, user-cog for coach/shadow changes, rotate-ccw for reschedule, trending-up for plan extended, refresh for renewed, banknote for refund events, gift for pause-days adjusted, arrow-left-right for status changed, etc.) — a fallback clock icon covers any unmapped type. Exact icon choice is cosmetic; the important part to replicate is **one distinct icon per event type**, not a shared generic icon.

### 5.5 Pagination
Loads 20 events at a time (`events` already arrive newest-first from the query — no client-side re-sort needed). An intersection-observer sentinel at the bottom auto-loads 20 more when scrolled into view (200px pre-trigger margin); a "Load more…" text button is also always available as a manual fallback. Switching the type filter resets the visible count back to 20.

### 5.6 Standalone banner (not a timeline row)
If the client's measurements are stale, a red banner ("Measurements overdue — last updated {date}" or "— never logged") is rendered **above** the timeline list, not injected as a fake event row. This is because staleness is a **live-computed** fact (re-evaluated every time the page loads), not a permanent historical record — injecting it as a timeline row would make it appear/disappear on repeated views depending on when someone looks, which would be misleading for what's supposed to be an immutable history.

---

## 6. Business rules to replicate exactly

1. **Append-only, no edit/delete, ever, for any role.** Enforce this at the data-access layer (no update/delete policy), not just by hiding an edit button in the UI.
2. **The "side" (internal vs customer) is a property of the event type, not of who clicked the button** — except for the two explicitly actor-dependent types (cancel/reschedule). Don't derive side generically from "was this call made by a client-role user" for every event type, or an admin backfilling a client's data will misleadingly show up as if the client did it themselves (or vice versa).
3. **`actor_id` can legitimately be null** — some events are system-triggered (an automated status recompute) and some are deliberately actor-less by design (e.g. admin logging a concern on the client's behalf) — the UI must distinguish "system" (fixed internal-side automated event) from "unknown"/N/A (customer-side event with no actor), not collapse both into one generic "—".
4. **Never surface this to the client.** It is an internal/coach-facing tool for understanding a client's history, and several event descriptions (e.g. escalation "who's at fault" type notes elsewhere in the app) are explicitly staff-only in spirit even where this particular table doesn't carry that specific field — don't add a client-facing timeline screen as a shortcut without confirming that's actually wanted.
5. **RLS/authorization scoping:** Admin = any client. Coach = their own linked clients in full; any other client read-only via search (same data, just paired with a "not assigned to you" banner in the surrounding page — the timeline component itself doesn't need its own separate read-only mode, the restriction is that a non-assigned coach shouldn't be linked here in the first place except via the search fallback).
6. **One write helper, called from many places.** Don't scatter ad-hoc inserts — every part of the app that needs to log a timeline event should go through a single shared function (`logTimelineEvent(clientId, eventType, title, {description?, metadata?, actorId?})`) so the row shape / immutability / RLS bypass (system-role write) stays consistent everywhere.

---

## 7. Actual source code (reference implementation)

### 7.1 Core service (`timeline.service.ts`)

```ts
import { getCallerContext } from "./_auth";
import { supabaseAdmin } from "@/lib/supabase/admin-client";

export type TimelineEventType =
  | "plan_purchased"
  | "plan_activated"
  | "onboarding_completed"
  | "coach_assigned"
  | "slot_assigned"
  | "session_completed"
  | "session_missed"
  | "attendance_marked_present"
  | "session_cancelled"
  | "coach_notes_uploaded"
  | "weekly_measurements_updated"
  | "client_raised_concern"
  | "escalation_created"
  | "escalation_resolved"
  | "pause_started"
  | "pause_ended"
  | "coach_changed"
  | "shadow_coach_assigned"
  | "manual_session_added"
  | "session_rescheduled"
  | "plan_extended"
  | "plan_renewed"
  | "refund_requested"
  | "refund_approved"
  | "plan_completed"
  | "plan_promise_adjusted"
  | "client_status_changed";

/** Which timeline column an event belongs to -- "internal" is staff/coach/
 * admin/system action on the client's record, "customer" is something the
 * client did themselves (or a record that's fundamentally about the
 * client's own interaction history, e.g. a concern they raised). Fixed per
 * event_type rather than derived from who technically clicked the button,
 * so e.g. an admin backfilling a client's weight on their behalf still
 * renders as a customer-side measurement, not an admin action. */
export type TimelineSide = "internal" | "customer";

/** cancelBooking()/rescheduleBooking() are callable by both staff and the
 * client themselves -- for these two, the fixed event_type default below is
 * only a fallback for a null/unresolved actor; listClientTimeline() overrides
 * it per-row using the actual actor's role, so a client's own reschedule
 * renders on their side, not staff's. */
export const ACTOR_DEPENDENT_SIDE_TYPES: ReadonlySet<TimelineEventType> = new Set(["session_cancelled", "session_rescheduled"]);

export const TIMELINE_EVENT_SIDE: Record<TimelineEventType, TimelineSide> = {
  plan_purchased: "internal",
  plan_activated: "internal",
  onboarding_completed: "customer",
  coach_assigned: "internal",
  slot_assigned: "internal",
  session_completed: "internal",
  session_missed: "internal",
  attendance_marked_present: "internal",
  session_cancelled: "internal",
  coach_notes_uploaded: "internal",
  weekly_measurements_updated: "customer",
  client_raised_concern: "customer",
  escalation_created: "customer",
  escalation_resolved: "customer",
  pause_started: "internal",
  pause_ended: "internal",
  coach_changed: "internal",
  shadow_coach_assigned: "internal",
  manual_session_added: "internal",
  session_rescheduled: "internal",
  plan_extended: "internal",
  plan_renewed: "internal",
  refund_requested: "internal",
  refund_approved: "internal",
  plan_completed: "internal",
  plan_promise_adjusted: "internal",
  client_status_changed: "internal",
};

/** Who/what to show on the card's "Added by" line. "staff" and "customer"
 * come from the actor's own profiles.role; "system" is the fallback for an
 * internal-side event with no actor (an automated transition); "unknown"
 * renders as N/A -- e.g. an admin logging a concern on a client's behalf,
 * where the row deliberately has no actor. */
export type TimelineActorSource = "staff" | "system" | "customer" | "unknown";

/** System-level: called internally as a side effect of another service's
 * mutation (booking completed, coach changed, escalation raised, etc), same
 * pattern as notifications.service.ts's createFromTemplate() -- a
 * supabaseAdmin-backed helper, not exposed to any portal directly. Entries
 * are permanent: client_timeline_events has no update/delete RLS policy for
 * any role, so nothing in the app layer can delete history either. */
export async function logTimelineEvent(
  clientId: string,
  eventType: TimelineEventType,
  title: string,
  options?: { description?: string; metadata?: Record<string, unknown>; actorId?: string | null }
) {
  const { error } = await supabaseAdmin.from("client_timeline_events").insert({
    client_id: clientId,
    event_type: eventType,
    title,
    description: options?.description ?? null,
    metadata: options?.metadata ?? null,
    actor_id: options?.actorId ?? null,
  });
  if (error) throw error;
}

export interface TimelineEventRow {
  id: string;
  event_type: TimelineEventType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
  /** Always null today -- client_timeline_events is append-only (no
   * update/delete RLS policy for any role), so no write path can ever
   * populate this yet. Kept on the row shape so the timeline UI's
   * "Updated At" sub-line is ready the moment an editable event source
   * (e.g. revisable session notes) exists, without another shape change. */
  updated_at: string | null;
  side: TimelineSide;
  actor_source: TimelineActorSource;
  actor_name: string | null;
}

type ActorEmbed = { full_name: string | null; role: "admin" | "coach" | "client" } | null;

/** RLS-scoped read: admin sees any client's timeline, coach sees their
 * linked clients' (and any client's, read-only, via widened search RLS).
 * Resolves each row's actor (for the "Added by" line) and column (internal
 * vs customer) so the two-column timeline UI stays a pure display layer. */
export async function listClientTimeline(accessToken: string, clientId: string): Promise<TimelineEventRow[]> {
  const ctx = await getCallerContext(accessToken);
  const { data, error } = await ctx.client
    .from("client_timeline_events")
    .select("id, event_type, title, description, metadata, actor_id, created_at, actor:profiles(full_name, role)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data as unknown as (Omit<TimelineEventRow, "updated_at" | "side" | "actor_source" | "actor_name"> & { actor: ActorEmbed })[]).map(
    (row) => {
      const actor = row.actor;
      const isClientActor = actor?.role === "client";
      const side: TimelineSide =
        ACTOR_DEPENDENT_SIDE_TYPES.has(row.event_type) && actor
          ? isClientActor
            ? "customer"
            : "internal"
          : TIMELINE_EVENT_SIDE[row.event_type] ?? "internal";
      const actor_source: TimelineActorSource = actor ? (isClientActor ? "customer" : "staff") : side === "internal" ? "system" : "unknown";
      return {
        id: row.id,
        event_type: row.event_type,
        title: row.title,
        description: row.description,
        metadata: row.metadata,
        actor_id: row.actor_id,
        created_at: row.created_at,
        updated_at: null,
        side,
        actor_source,
        actor_name: actor?.full_name ?? null,
      };
    }
  );
}
```

### 7.2 Server action wrapper (`admin-timeline.actions.ts`)

```ts
"use server";

import { getAccessToken } from "@/lib/supabase/server-client";
import { ActionResult, runAction } from "./action-result";
import { listClientTimeline, TimelineEventRow } from "@/lib/services/timeline.service";

async function requireToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");
  return token;
}

export async function getClientTimelineAction(clientId: string): Promise<ActionResult<TimelineEventRow[]>> {
  return runAction(async () => {
    const token = await requireToken();
    return listClientTimeline(token, clientId);
  });
}
```

Note: this exact same action + `ClientTimeline` component is reused as-is by the **coach** portal's client-detail page (`getCoachClientDetailAction` in `coach-portal.actions.ts` calls `listClientTimeline()` directly rather than going through a separate coach-specific action) — there is only one timeline read path in the whole app, shared by both portals, differing only in which client IDs each caller is allowed to pass in (enforced by RLS, not by having two different query functions).

### 7.3 Full timeline UI component (`ClientTimeline.tsx`, React — used by both Admin and Coach detail pages)

```tsx
"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingBag, UserPlus, CalendarPlus, CheckCircle2, XCircle, ClipboardCheck, Pencil, Scale,
  MessageCircleWarning, AlertOctagon, CheckCheck, PauseCircle, PlayCircle, RefreshCw, UserCog2,
  CalendarClock, RotateCcw, TrendingUp, Banknote, Clock3, ShieldCheck, Gift, AlertTriangle,
  ChevronRight, X, ArrowRightLeft,
} from "lucide-react";
import Card from "@/components/ui/Card";
import { TimelineEventRow, TimelineEventType } from "@/lib/services/timeline.service";

const EVENT_ICONS: Record<TimelineEventType, any> = {
  plan_purchased: ShoppingBag, plan_activated: PlayCircle, onboarding_completed: ClipboardCheck,
  coach_assigned: UserPlus, slot_assigned: CalendarPlus, session_completed: CheckCircle2,
  attendance_marked_present: ShieldCheck, session_missed: XCircle, session_cancelled: XCircle,
  coach_notes_uploaded: Pencil, weekly_measurements_updated: Scale, client_raised_concern: MessageCircleWarning,
  escalation_created: AlertOctagon, escalation_resolved: CheckCheck, pause_started: PauseCircle,
  pause_ended: PlayCircle, coach_changed: UserCog2, shadow_coach_assigned: UserCog2,
  manual_session_added: CalendarClock, session_rescheduled: RotateCcw, plan_extended: TrendingUp,
  plan_renewed: RefreshCw, refund_requested: Banknote, refund_approved: Banknote,
  plan_completed: CheckCheck, plan_promise_adjusted: Gift, client_status_changed: ArrowRightLeft,
};

const EVENT_LABELS: Record<TimelineEventType, string> = {
  plan_purchased: "Subscription purchased", plan_activated: "Subscription activated",
  onboarding_completed: "Onboarding completed", coach_assigned: "Coach assigned",
  slot_assigned: "Schedule set", session_completed: "Session done (present)",
  attendance_marked_present: "Attendance marked", session_missed: "Session done (absent)",
  session_cancelled: "Session cancelled", coach_notes_uploaded: "Session note updated",
  weekly_measurements_updated: "Measurement logged", client_raised_concern: "Concern raised",
  escalation_created: "Support ticket created", escalation_resolved: "Support ticket closed",
  pause_started: "Subscription paused", pause_ended: "Subscription resumed",
  coach_changed: "Coach changed", shadow_coach_assigned: "Shadow coach assigned",
  manual_session_added: "Session added", session_rescheduled: "Session rescheduled",
  plan_extended: "Plan extended", plan_renewed: "Plan renewed",
  refund_requested: "Refund requested", refund_approved: "Refund approved",
  plan_completed: "Plan completed", plan_promise_adjusted: "Pause days adjusted",
  client_status_changed: "Client status changed",
};

const PAGE_SIZE = 20;

function formatHeaderDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

function formatHeaderTime(date: string) {
  const d = new Date(date);
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

function timestampKey(date: string) {
  // Groups by minute -- same rendered header (date + "HH:MM AM/PM") means no repeat.
  return `${formatHeaderDate(date)} ${formatHeaderTime(date)}`;
}

function addedByLabel(event: TimelineEventRow): string {
  if (event.actor_source === "system") return "SYSTEM";
  if (event.actor_source === "unknown") return "N/A";
  return event.actor_name ?? "N/A";
}

/** Renders a plain-text description safely: converts literal <br> variants
 * into real line breaks and strips any other stray markup, without ever
 * using dangerouslySetInnerHTML. */
function MultilineText({ text, className }: { text: string; className?: string }) {
  const lines = useMemo(() => text.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[a-z][^>]*>/gi, "").split("\n"), [text]);
  return (
    <p className={className}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </p>
  );
}

function humanizeKey(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function DetailModal({ event, onClose }: { event: TimelineEventRow; onClose: () => void }) {
  const entries = Object.entries(event.metadata ?? {});
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-bg-elevated p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-white/40">{formatHeaderDate(event.created_at)} · {formatHeaderTime(event.created_at)}</p>
            <h3 className="text-display mt-0.5 text-lg font-bold italic">{event.title}</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white/5">
            <X className="h-5 w-5" />
          </button>
        </div>
        {event.description && <MultilineText text={event.description} className="mb-4 text-sm text-white/65" />}
        {entries.length > 0 && (
          <div className="space-y-2 rounded-xl bg-white/[0.03] p-3.5">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-3 text-xs">
                <span className="font-semibold text-white/45">{humanizeKey(key)}</span>
                <span className="text-right font-medium text-white/75">{String(value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventCard({ event, onExpand }: { event: TimelineEventRow; onExpand: (event: TimelineEventRow) => void }) {
  const hasDetail = !!event.metadata && Object.keys(event.metadata).length > 0;
  const accent = event.side === "internal" ? "teal" : "orange";
  return (
    <Card className={accent === "teal" ? "border-teal-600/15 p-3.5" : "border-orange-500/20 p-3.5"}>
      <button
        type="button"
        onClick={hasDetail ? () => onExpand(event) : undefined}
        className={`flex w-full items-start justify-between gap-2 text-left ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
        disabled={!hasDetail}
      >
        <p className="text-sm font-bold leading-snug">{event.title}</p>
        {hasDetail && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />}
      </button>
      {event.description && <MultilineText text={event.description} className="mt-1 text-xs leading-relaxed text-white/55" />}
      <div className="my-2.5 border-t border-white/[0.06]" />
      <p className={`text-[11px] font-semibold ${accent === "teal" ? "text-teal-700" : "text-orange-600"}`}>Added by: {addedByLabel(event)}</p>
      {event.updated_at && (
        <p className="mt-1 text-[11px] font-semibold text-emerald-400">
          Updated At: {formatHeaderDate(event.updated_at)}, {formatHeaderTime(event.updated_at)}
        </p>
      )}
    </Card>
  );
}

function IconBadge({ type, side }: { type: TimelineEventType; side: "internal" | "customer" }) {
  const Icon = EVENT_ICONS[type] ?? Clock3;
  return (
    <div className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${side === "internal" ? "bg-teal-600" : "bg-orange-500"}`}>
      <Icon className="h-4 w-4 text-white" />
    </div>
  );
}

interface TimestampGroup {
  key: string;
  date: string;
  time: string;
  events: TimelineEventRow[];
}

function groupByTimestamp(events: TimelineEventRow[]): TimestampGroup[] {
  const groups: TimestampGroup[] = [];
  for (const event of events) {
    const key = timestampKey(event.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.events.push(event);
    } else {
      groups.push({ key, date: formatHeaderDate(event.created_at), time: formatHeaderTime(event.created_at), events: [event] });
    }
  }
  return groups;
}

/** measurementsStale/lastMeasurementAt are live-computed (not persisted
 * timeline rows) -- rendered as a standalone banner above the timeline
 * rather than injected as a fake event, since re-checking staleness on
 * every render would otherwise mean a new row appearing and disappearing
 * depending on when this is viewed. */
export default function ClientTimeline({
  events,
  measurementsStale,
  lastMeasurementAt,
}: {
  events: TimelineEventRow[];
  measurementsStale?: boolean;
  lastMeasurementAt?: string | null;
}) {
  const [mode, setMode] = useState<"split" | "merged">("split");
  const [filterType, setFilterType] = useState<TimelineEventType | "all">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<TimelineEventRow | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const availableTypes = useMemo(() => {
    const seen = new Set<TimelineEventType>();
    events.forEach((e) => seen.add(e.event_type));
    return Array.from(seen);
  }, [events]);

  // events already arrive newest-first from listClientTimeline().
  const filtered = useMemo(
    () => (filterType === "all" ? events : events.filter((e) => e.event_type === filterType)),
    [events, filterType]
  );

  useEffect(() => setVisibleCount(PAGE_SIZE), [filterType]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const groups = useMemo(() => groupByTimestamp(visible), [visible]);

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore]);

  return (
    <div className="space-y-5">
      {measurementsStale && (
        <Card className="flex items-center gap-3 border-red-500/30 bg-red-500/5 p-3.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm font-semibold text-red-400">
            Measurements overdue{lastMeasurementAt ? ` — last updated ${formatHeaderDate(lastMeasurementAt)}` : " — never logged"}.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1">
          <button type="button" onClick={() => setMode("split")} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${mode === "split" ? "bg-brand-yellow text-black" : "text-white/50 hover:text-white"}`}>
            Split view
          </button>
          <button type="button" onClick={() => setMode("merged")} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${mode === "merged" ? "bg-brand-yellow text-black" : "text-white/50 hover:text-white"}`}>
            Merged view
          </button>
        </div>

        <select value={filterType} onChange={(e) => setFilterType(e.target.value as TimelineEventType | "all")} className="rounded-xl border border-white/15 bg-bg-elevated px-3 py-1.5 text-xs font-semibold text-white/70">
          <option value="all">Filter by event type/source: All</option>
          {availableTypes.map((t) => (
            <option key={t} value={t}>{EVENT_LABELS[t] ?? t}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 && <p className="text-sm text-white/45">No timeline events yet.</p>}

      {mode === "split" ? (
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10" />
          <div className="mb-3 flex items-center justify-between px-1 text-[11px] font-bold uppercase text-white/35">
            <span>LEANR Event</span>
            <span>Customer Event</span>
          </div>
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-white/50">{group.date}</span>
                  <span className="text-xs font-bold text-white/50">{group.time}</span>
                </div>
                <div className="space-y-3">
                  {group.events.map((event) => (
                    <div key={event.id} className="grid grid-cols-[1fr_2.5rem_1fr] items-start gap-x-3">
                      <div>{event.side === "internal" && <EventCard event={event} onExpand={setExpanded} />}</div>
                      <div className="flex justify-center pt-0.5">
                        <IconBadge type={event.event_type} side={event.side} />
                      </div>
                      <div>{event.side === "customer" && <EventCard event={event} onExpand={setExpanded} />}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-bold text-white/50">{group.date}</span>
                <span className="text-xs font-bold text-white/50">{group.time}</span>
              </div>
              <div className="space-y-3">
                {group.events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3">
                    <IconBadge type={event.event_type} side={event.side} />
                    <div className="min-w-0 flex-1">
                      <EventCard event={event} onExpand={setExpanded} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-2">
          <button type="button" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className="text-xs font-bold text-white/40 hover:text-white/70">
            Load more…
          </button>
        </div>
      )}

      {expanded && <DetailModal event={expanded} onClose={() => setExpanded(null)} />}
    </div>
  );
}
```

### 7.4 Representative write call-sites (one per pattern, illustrating how services log events)

```ts
// bookings.service.ts -- logged as a side effect of cancelBooking()
await Promise.all([
  cleanupZoomMeeting(bookingId, booking.zoom_meeting_id ?? null),
  logTimelineEvent(booking.client_id, "session_cancelled", "Session cancelled", {
    description: reason,
    actorId: ctx.userId,
    metadata: { bookingId },
  }),
]);

// bookings.service.ts -- logged as a side effect of createBooking() for any one-off (incl. demo) booking
if (!input.recurringSlotId) {
  await logTimelineEvent(input.clientId, "manual_session_added", "Session added", {
    description: new Date(input.slotStart).toLocaleString(),
    metadata: { bookingId, coachId: input.coachId },
  });
}

// subscriptions.service.ts -- logged as a side effect of an admin pause-days grant
await logTimelineEvent(
  sub.client_id,
  "plan_promise_adjusted",
  `Pause-days allowance ${additionalDays > 0 ? "increased" : "decreased"} by ${Math.abs(additionalDays)}`,
  { actorId: ctx.userId, metadata: { subscriptionId, additionalDays } }
);

// clientStatus.ts -- logged automatically whenever the derived client status changes
// (called from any booking/subscription-mutating action as a "before/after" comparison)
await logTimelineEvent(clientId, "client_status_changed", `Status changed to ${CLIENT_STATUS_LABELS[after]}`, {
  actorId,
  metadata: { from: before, to: after },
});
```

**The pattern to replicate:** every mutation that matters to a client's history calls `logTimelineEvent()` once, inline, as a side effect — never as a separate step the caller has to remember. Building the mobile backend, wire this the same way: one shared logging function, called from inside each mutating service function itself (booking creation, cancellation, subscription changes, escalations, etc.), not bolted on afterward from the UI layer.


