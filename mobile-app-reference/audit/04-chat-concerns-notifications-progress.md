# Audit Section 4: Chat, Concerns/Escalations, Notifications, Push, Progress

Scope: leanr-mobile-app. Compared against `ClientPortal.md` (CP.md) §11 (Diet/Plan mapping — progress/workout_notes), §15 (Notifications), §16 (Communication/Coach Interaction), §17.

**This section contains the single highest-severity, highest-confidence finding of the entire audit (COM-001 below) — a client-facing dead-end that appears to make the free-demo funnel entirely unreachable for brand-new prospects.**

## Functionality Inventory

| # | Functionality | File(s) |
|---|---|---|
| 1 | Real-time chat (Supabase Realtime) | `src/lib/data/chat.ts` |
| 2 | Chat image attachment upload | `chat.ts:133-145` |
| 3 | Read receipts (recipient-only) | `chat.ts:148-156` |
| 4 | Past/closed conversations (read-only) | `chat.ts:60-76` |
| 5 | My Concerns (raise/read, no edit) | `src/lib/data/concerns.ts` |
| 6 | Escalation call-gate (DB trigger) | `supabase/migrations/20260907120000_escalation_call_gate_trigger.sql` |
| 7 | In-app notifications list, mark-read | `src/lib/data/notifications.ts` |
| 8 | Notification tap-to-navigate routing | `notifications.ts:70-89`, `use-notification-tap.ts` |
| 9 | Push token registration | `src/lib/notifications/register-push-token.ts` |
| 10 | Push send (DB-trigger driven) | `supabase/functions/send-push/index.ts`, `20260819120000_push_tokens_and_send_trigger.sql` |
| 11 | Progress/measurement logging | `src/lib/data/progress.ts` |
| 12 | Weekly rate-limit + renewal-checkin bypass | `progress.ts:42-65` |
| 13 | Milestones / streak (mobile-only, additive) | `src/lib/data/milestones.ts` |
| 14 | Notification fan-out helpers | `src/lib/data/notify.ts` |

## Workflow Traces

### Chat — messaging
```
coach.tsx (Chats tab, enrolled only): getMyActiveConversation() + getMyPastConversations() + getMyCoach()
  → getMessages(conversationId) → subscribeToConversation(id, onChange) [Supabase Realtime,
    postgres_changes on messages INSERT/UPDATE, filtered to this conversation] → markMessagesRead(id,'coach')
    [flips read_at on the COACH's unread messages only — a client can never mark their own sent
    messages read, matching WhatsApp-style semantics]
  → onSend: uploadChatImage(if attached) → sendMessage(conversationId,{body,attachmentUrl})
      → INSERT messages row → best-effort notifyProfile(other participant, 'new_chat_message')
        [in-app only; failure swallowed, never blocks the send]
```
RLS (confirmed via live introspection, chat.ts:1-35): `messages_insert_participant` requires
`sender_profile_id = auth.uid()` AND `conversations.status='active'` AND (for a client) `client_id = my_client_id()` — **DB-enforced**, not just app logic, matching CP.md §16's "restriction on sending is enforced at the RLS layer, not just the UI." **STATUS: WORKING CORRECTLY.**

### Chat — conversation creation — **CRITICAL GAP, see COM-002**
The code's own header comment (chat.ts:14-19) states as a confirmed fact: **"Conversations are never created by this app"** — there is no client/coach INSERT RLS policy on `conversations` (only `conversations_admin_all`), and no DB trigger auto-creates one. Cross-referencing every other module audited in this pass (Section 2's `recurring-schedule.ts` `setUpRecurringSchedule`/`carryOverRecurringSchedule`, Section 3's activation/renewal flows, `demo-booking.ts`): **none of them contain a `conversations` insert.** The only code path anywhere in this repository that creates a `conversations` row is `coach-change-actions/index.ts` (the privileged edge function for coach-change completion — see Section 2). CP.md §8/§12 describes web's `ensureConversationForCoachAssignment()` as firing automatically "the moment a coach is linked via a recurring slot or booking" — i.e. at ordinary first-time schedule setup, not only at coach-change completion. **This mechanism has no equivalent anywhere in the mobile app.** A first-time or renewal client who sets up (or carries over) a recurring schedule through the normal flow gets no conversation at all; "Chats" would permanently show "No conversation with your coach yet" until an admin manually creates one out-of-band (chat.ts's own comment: "creation is an admin-side action outside this app's scope"). **STATUS: NOT IMPLEMENTED — this is a materially different, and almost certainly broken, chat-availability outcome compared to CP.md's described behavior for the majority of clients.**

### My Concerns
```
concerns.tsx: getMyConcerns() + getNotesForConcerns(ids) → raise via raiseConcern({reason, description,
  category}) → INSERT escalations {client_id, coach_id: current coach or null, raised_by, reason,
  description, category} → best-effort notifyProfile(current coach, 'escalation_raised_to_coach')
```
`category` is validated against a real DB CHECK constraint (`escalations_category_check`) — the code's own comment candidly documents that an earlier implementation pass had incorrectly assumed this was free-text and shipped an invented 5-value set before being corrected to the real DB-enforced 7 values (concerns.ts:9-12) — a **self-corrected historical bug**, not a current gap. **Not purchase-gated** — deliberately, matching CP.md's "works with no plan required" exactly, and the code comment explicitly documents overriding a stale mockup annotation to preserve this. **STATUS: WORKING CORRECTLY.**

### Escalation call-gate — DB-enforced, exemplary pattern
`20260907120000_escalation_call_gate_trigger.sql` installs two triggers: `escalations_call_gate` (BEFORE UPDATE — rejects any status/issue-type/fault/summary/resolution-notes change unless `called_client_at` is already set, or is being set in this same update) and `escalation_notes_call_gate` (BEFORE INSERT — rejects any note unless `called_client_at` is set). The migration's own comment states this was "previously enforced client-side only... mobile writes directly to Supabase with no trusted server layer in front of it... a client-side-only gate is bypassable by any modified client... this trigger makes the DB the real trust boundary." **This is the exact fix that Sections 2/3 found missing for the reschedule weekly cap, same-day conflict, and rating cap** — proof the team both understands this risk class and knows how to close it, which makes those other gaps (SES-002/003/004) look like inconsistent application of a known-good pattern rather than a blind spot. **STATUS: WORKING CORRECTLY, and a positive architectural reference point for the rest of the app.**

### Notifications — in-app
```
notifications.tsx: getMyNotifications() (limit 50, newest-first) → tap → markNotificationRead(id) →
  routeCategoryForTemplateKey(template_key) [substring match against 'chat'/'escalation|concern'/
  'coach_change'/'session|schedule|booking|attendance|notes|leave|shadow'] → router.push to
  /sessions, /coach, or /concerns accordingly
```
`related_entity_type`/`related_entity_id` deep-link columns exist on the schema but the code's own header comment states they were **confirmed null on every one of 32 real sampled notification rows** — i.e. the intended precise deep-link mechanism is unused in practice by the live backend regardless of what any PRD describes, so the mobile team correctly built a best-effort `template_key`-substring router instead of trusting a column that never gets populated. **STATUS: WORKING CORRECTLY (pragmatic, evidence-based adaptation).**

### Push notifications — fully wired, trigger-driven
```
register-push-token.ts: requests OS permission → Notifications.getExpoPushTokenAsync() →
  upsert push_tokens{user_id, expo_push_token} (one row per user, last-write-wins)
DB trigger notifications_send_push (AFTER INSERT ON notifications) → net.http_post to send-push
  edge function with {notificationId}
send-push/index.ts: loads the notification + the recipient's push_tokens row → POSTs to Expo's push
  API (https://exp.host/--/api/v2/push/send) → no-ops cleanly if no token registered (not an error)
use-notification-tap.ts: cold/background tap → router.push to role-appropriate notifications screen
```
Because push fires from a DB trigger on **every** `notifications` INSERT, it automatically mirrors the exact same trigger/recipient set as every in-app notification audited across Sections 1-4 (any future `notifyProfile`/`notifyAdmins` call gets push for free) — this is precisely CP.md §15's own recommendation for how a mobile app should add push as new capability ("mirror the trigger and recipient list... the channel can change... but who it goes to must not"). **STATUS: WORKING CORRECTLY**, and a well-executed piece of genuinely new (no-web-precedent) functionality. Two minor, self-documented notes: (a) `send-push`'s endpoint has `verify_jwt:false` with no shared-secret check since its only caller is Postgres itself — the function's own comment assesses the worst case of a guessed-notificationId call as "one extra push resend to that notification's own recipient," a reasonable risk acceptance, not a data-exposure hole; (b) push tokens are **never removed on logout** — no code path in `signOut()` (auth-context.tsx, Section 1) or elsewhere deletes a device's `push_tokens` row, so a shared/resold device or a user who logs into a different account on the same device could keep receiving the previous account's pushes until the token is naturally overwritten by a new registration. **Flagged as a minor gap (COM-006).**

### Progress / measurements — **CRITICAL GAP, see COM-001**
```
progress.tsx: if (!subscriptionLoading && !subscription) → "You need an active plan before you can
  log progress." + "View plans" CTA — HARD GATE, no form rendered at all
Otherwise: getProgressLogs() → chart (metric/range filters) + weekly log form → logProgress(entry)
  → rate-limit check (7 days) unless skipWeeklyLimit → INSERT progress_logs → best-effort
    notifyProfile(current coach, 'progress_updated_coach')
```
The screen's own header comment (progress.tsx:15-22) explicitly documents the reasoning: a mockup poster listed Progress/Measurements under "NOT Available Until Plan Purchase," and the developer applied that gate here "mirror[ing] book-session.tsx's exact gate treatment" for defense-in-depth consistency with other purchase-gated screens. **This directly contradicts CP.md §6's explicit statement**: *"Access progress | Yes | Weekly measurement logging works pre-purchase — it is in fact a prerequisite gate for booking a demo."* CP.md's own measurement-status.ts equivalent (Section 1 of this audit, `measurement-status.ts:9-16`) already flags the theoretical risk of this exact rule "always blocking a brand-new prospect's first demo" — but on **web**, that risk stays theoretical precisely *because* Progress is reachable pre-purchase, so a prospect can always log a first measurement before attempting to book. **On mobile, Progress now requires a subscription, closing off that escape hatch entirely.**

**COM-001 — Full failure chain, verified against this audit's own Section 1/2 findings:**
```
1. New signup, never logged any measurement, no subscription yet.
2. GlobalGates (Section 1, AUTH-008) computes measurementStale=true (no progress_logs exist) →
   MeasurementGateModal shown on first authenticated screen. "Update now" → router.push('/progress').
3. progress.tsx: subscription is null → hard gate: "You need an active plan before you can log
   progress." + "View plans" CTA. No form is rendered. The client CANNOT log a measurement here.
4. Separately, if the client instead tries "Book Free Demo Session" directly: demo-booking.ts's
   confirmHold() → assertMeasurementsFresh() (Section 2 workflow trace) throws "Please update your
   measurements before booking a session or joining." — booking fails.
5. The client has no remaining path to satisfy the measurement gate without an admin manually
   inserting a progress_logs row on their behalf, or bypassing the entire demo flow and purchasing a
   paid plan outright (purchasePackage/payments.ts has no measurement-freshness check anywhere —
   confirmed in Section 3 — so a direct paid purchase is NOT blocked by this).
```
**Net effect: a brand-new prospect can purchase a plan directly, but cannot ever complete the FREE demo booking flow** — the specific low-commitment funnel entry point CP.md describes as central to the pre-purchase experience (§6, §21 "Pre-Purchase" diagram: `marketing → /client/plans (browse) → optionally /client/demo-booking`). This is a self-inflicted, mobile-only regression (the web app has no equivalent lockout, by design) introduced by a screen-level gate that was added by analogy to other purchase-gated screens without cross-checking this specific screen's role as the measurement-gate's own escape hatch. **STATUS: BROKEN.** This is the highest-confidence, highest-severity functional defect found in this entire audit.

## Business Rules

| Rule | Trigger | Condition | Action | Enforced where | Result | Next state |
|---|---|---|---|---|---|---|
| One active conversation, DB-enforced | Message send attempt | conversation not 'active' or sender not participant | Reject | **RLS (DB)** | Insert fails | unchanged |
| Escalation call-gate | Admin edits an escalation/note | called_client_at not yet set | Reject | **DB trigger** | Update/insert fails | unchanged |
| Progress weekly cap | Log progress | Last log <7 days ago (unless skipWeeklyLimit) | Reject | **Client-side only** (progress.ts:53-65, no DB backstop found in local migrations) | Error thrown | unchanged |
| Progress requires subscription | Open /progress | No active-ever subscription | Hard block, no form | Client-side screen gate | Cannot log at all | **Breaks the measurement-gate escape hatch — see COM-001** |
| Push mirrors in-app notification triggers | Any notifyProfile/notifyAdmins call | notifications row inserted | DB trigger fires send-push | **DB trigger** | Push sent if token exists | — |

## State Transition Map

`conversations.status`: `active ⇄` (none observed transitioning back) `→ closed` (only via `coach-change-actions` edge function; no other writer found). `escalations.status`: `open → in_progress → resolved`, transitions gated by `called_client_at` (admin-only, out of client-portal scope but the DB gate itself was directly verified here).

## Notification Trigger/Recipient Matrix

Cross-referencing every `notifyProfile`/`notifyAdmins`/edge-function notification call found across all four audit sections against CP.md §15's ~17-item web trigger list:

| CP.md §15 Trigger | Mobile equivalent found? | Location | Channel(s) |
|---|---|---|---|
| Plan purchased → client | Yes | razorpay/index.ts:266-272 | In-app (+push via DB trigger) |
| Plan activated → client | Yes | subscription-lifecycle/index.ts:129 | In-app (+push) |
| Subscription paused/resumed → client+coach | Yes | subscription-lifecycle/index.ts:144-148,163-167 | In-app (+push) |
| Session booked → client+coach | **Not found** in `booking-wizard.ts`'s `confirmHold`/`holdSlot` — no `notifyProfile` call present for a fresh regular/demo booking | — | **NOT IMPLEMENTED — gap** |
| Session cancelled (client-initiated) → coach+admins | Yes | bookings.ts:90-97 | In-app (+push) |
| Session cancelled (coach/admin-initiated) → client | Out of client-portal scope (coach/admin app) — not traced | — | UNKNOWN |
| Session rescheduled → client+coach+admins | Yes | bookings.ts:199-210 | In-app (+push) |
| Attendance marked → client+coach | Out of scope (coach app) — not traced this pass | — | UNKNOWN |
| Session reminder (~6h before) → client+coach | **No cron/scheduled job found anywhere in this repo** (no `supabase/functions/*reminder*`, no cron config) | — | **NOT IMPLEMENTED — gap, confirmed absent** |
| New chat message → other participant | Yes | chat.ts:109-123 | In-app (+push) |
| Progress updated → coach | Yes | progress.ts:82-92 | In-app (+push) |
| Coach-change approved/rejected → client | Presumed admin-side (out of scope); completion itself has no explicit client notify call found in `coach-change-actions/index.ts` | — | UNKNOWN / possible gap |
| Schedule changed / coach changed → client | Not explicitly found as a standalone notify call in `recurring-schedule.ts`'s setup functions | — | UNKNOWN / possible gap |
| Shadow coach assigned → client+shadow coach | Out of scope (admin-driven) — not traced this pass | — | UNKNOWN |
| Escalation raised (with coach) → coach | Yes | concerns.ts:113-118 | In-app (+push) |
| Escalation resolved → client | Out of scope (admin-side) — not traced this pass | — | UNKNOWN |

**COM-003 — Two confirmed, high-confidence NOT IMPLEMENTED gaps**: (a) no notification fires when a client books a regular or demo session (`booking-wizard.ts` has no `notify*` call anywhere in `holdSlot`/`confirmHold`) — CP.md §15 explicitly lists "Session booked (regular)" and "Demo booked" as notifying both client and coach; (b) **the entire session-reminder mechanism (~6h-before cron job) does not exist anywhere in this repository** — CP.md §10/§15 describes this as "the only purely time-triggered notification in the app," and no cron configuration, scheduled edge function, or equivalent was found. Both are real, confirmed-absent functionality, not merely unverified.

## Gaps vs Web Reference

**COM-001 — Progress screen's purchase gate breaks the measurement-freshness gate's only escape hatch for pre-purchase clients (CRITICAL).** See full trace above. Recommended fix direction (not implemented as part of this audit, which is documentation-only): remove the subscription gate from `progress.tsx`, matching CP.md's explicit "works pre-purchase" requirement.

**COM-002 — No conversation auto-creation on ordinary schedule setup; chat only becomes available via the coach-change-completion edge function (HIGH).** See full trace above.

**COM-003 — No "session booked" notification; no session-reminder cron job at all (HIGH, confirmed absent).** See Notification Matrix above.

**COM-004 — Several CP.md-documented notification triggers could not be confirmed either way** because their trigger point lives in the coach/admin app, out of this section's traced scope (coach-change resolution, shadow-coach assignment, escalation resolution, attendance marking, coach/admin-initiated cancellation). Cross-reference Section 5's admin/coach audit for these.

**COM-005 — Pause-days usage (Section 3's SUB-005) has no bearing here; noted only as a cross-reference.**

**COM-006 — Push tokens are never cleared on logout (LOW-MEDIUM).** See Push workflow trace above.

**COM-007 — Progress rate-limit has no DB-level backstop (MEDIUM, same architectural class as Section 2's SES-002/003/004).** Only a client-side pre-check exists in `logProgress()`; no trigger enforcing the 7-day cap was found in the 5 local migrations, unlike the escalation call-gate's DB-trigger pattern shown to be both known and available to this team.

## Edge Cases Observed

- Chat send failure after image upload succeeds: `sendMessage`'s catch block restores both `draft` and `pendingImage` state so the client doesn't lose their composed message on a transient failure (coach.tsx:200-207) — good defensive UX.
- Past/closed conversation viewing: explicit "This coach is no longer assigned to you — you can still see this history" notice, read-only rendering, matches CP.md §16 verbatim.
- Notification "Mark all as read" only appears when `hasUnread` is true — minor polish, not a gap.
- Progress chart empty/sparse states: explicit "Log a couple more weeks to see your trend" rather than a broken/empty chart render.
- Photos tab: explicitly disabled with "coming soon" copy — correctly matches CP.md's "no client UI writes photo_url... not an implemented feature despite the column's existence," faithfully reproducing a documented web gap rather than inventing new scope.

## Data-Exposure/Security Notes

- **Client visibility into coach-authored session notes** (`workout_notes` — the `homework`/`exercises_performed`/`performance_rating`/`improvements`/`additional_remarks` fields CP.md §11 says must stay coach/admin-only) was **not traced in this section** — no `workout_notes` reference appears in any file read across Sections 1-4's client-portal scope (bookings.ts's `BOOKING_SELECT_WITH_COACH` selects only `coach_profiles(profiles(full_name))`, no `workout_notes` join). This suggests the client Sessions/Progress screens in this codebase may not currently surface coach notes **at all** (neither the permitted `notes` field nor the restricted ones) — which would be a narrower, not wider, data-exposure surface than web (a missing-feature gap, not a leak), but this could not be fully confirmed without re-grepping every screen for a `workout_notes`/"coach notes" UI element. **UNKNOWN — REQUIRES VERIFICATION** (flagged as a possible additional missing-functionality item: "Coach notes" display on Sessions/Progress, present on web per CP.md §11, not confirmed present on mobile).
- **One-active-conversation-per-client rule is DB-enforced** (RLS + presumed unique-partial-index, matching CP.md §16's "enforced at the database level" claim) — confirmed via the code's own live-introspection comments, not merely app-logic. **Positive finding.**
- **Escalation call-gate is DB-enforced**, closing exactly the kind of "client-side-only business rule" risk class flagged repeatedly elsewhere in this audit (Sections 2/3). **Positive finding, and evidence the gaps found elsewhere are inconsistency, not a systemic blind spot.**

## Matrix Rows

| ID | Area | Workflow | Functionality | Location | Current Behavior | Expected/Intended Behavior | Status | Root Cause | Frontend | Backend/API | Database | Dependencies | Severity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| COM-001 | Progress | Progress screen purchase gate | Blocks pre-purchase measurement logging | progress.tsx:142-151 | Hard-gated behind an active-ever subscription | CP.md §6: must work pre-purchase, is a demo-booking prerequisite | BROKEN | Gate added by analogy to other screens without checking this screen's role as the measurement-gate escape hatch | progress.tsx | progress.ts | progress_logs | Blocks demo-booking funnel entirely for new prospects | **Critical** |
| COM-002 | Chat | Conversation auto-creation | No conversation created on ordinary schedule setup | recurring-schedule.ts (absence), coach-change-actions/index.ts (only writer) | Chat only works after a formal coach-change completion | CP.md §8/§12: auto-created the moment a coach is linked via a recurring slot or booking | NOT IMPLEMENTED | No client-writable path (RLS blocks it) and no equivalent trigger/edge-function built | coach.tsx | — | conversations | "My Chats" unusable for most clients | High |
| COM-003a | Notifications | Session-booked notification | Missing on regular/demo booking | booking-wizard.ts | No notify call in holdSlot/confirmHold | CP.md §15: client+coach notified on booking | NOT IMPLEMENTED | Not built | book-session.tsx, demo-booking.ts | booking-wizard.ts | notifications | — | High |
| COM-003b | Notifications | Session reminder (~6h before) | Entire mechanism absent | — (no file found) | No cron/scheduled job exists | CP.md §10/§15: the one time-triggered notification | NOT IMPLEMENTED | Not built | — | — | — | — | High |
| COM-004 | Notifications | Several triggers unverifiable in this pass | Coach-change/shadow/escalation-resolved/attendance notifications | Coach/admin app (out of section scope) | Unknown | Should exist per CP.md §15 | UNKNOWN — REQUIRES VERIFICATION | Out of traced scope | — | — | — | Cross-ref Section 5 | Medium |
| COM-005 | Push | Token not cleared on logout | Stale device token risk | auth-context.tsx signOut(), register-push-token.ts | No push_tokens delete on sign-out | Should clear/rotate on logout | PARTIALLY IMPLEMENTED | Not built | — | — | push_tokens | Shared-device privacy | Low-Medium |
| COM-006 | Progress | Weekly rate-limit has no DB backstop | Client-side-only enforcement | progress.ts:53-65 | No trigger found | Should be DB-enforced, per the team's own escalation-call-gate precedent | WORKING BUT INCORRECT (architectural) | Inconsistent application of a pattern the team already uses elsewhere | progress.tsx | progress.ts | progress_logs | Same class as SES-002/003/004 | Medium |
| COM-007 | Chat | Coach session-notes visibility on client screens | workout_notes not referenced anywhere in traced client code | bookings.ts, sessions.tsx (Section 2) | No coach-notes display found | CP.md §11: client should see workout_notes.notes (read-only) | UNKNOWN — REQUIRES VERIFICATION (possible missing feature, not a leak) | Not confirmed present or absent conclusively | sessions.tsx, progress.tsx | — | workout_notes | — | Medium |
| COM-008 | Chat | Message send/RLS enforcement | DB-level restriction on sending | chat.ts RLS (messages_insert_participant) | Enforced at DB layer | Matches CP.md §16 | WORKING CORRECTLY | — | — | — | messages | — | — |
| COM-009 | Concerns | Escalation call-gate | DB trigger enforcement | 20260907120000_escalation_call_gate_trigger.sql | Enforced at DB layer | Matches CP.md's intent | WORKING CORRECTLY | — | — | — | escalations, escalation_notes | Exemplary pattern | — |
| COM-010 | Notifications | Push send pipeline | DB-trigger → edge fn → Expo push API | send-push/index.ts, migration 20260819120000 | Fully wired, mirrors every in-app trigger automatically | New capability, correctly designed per CP.md §15's own recommendation | WORKING CORRECTLY | — | register-push-token.ts | send-push edge fn | push_tokens, notifications | — | — |
