# Shadow Coach Assignment — Full Workflow Spec (for mobile app parity)

Source of truth: this is how the existing **web app** (Next.js + Supabase) implements temporary coach coverage when a client's regular coach is unavailable — across the Client, Coach, and Admin portals. Replicate this exact logic in the mobile app — same trigger paths, same matching/scoring algorithm, same grouping rule, same notifications — not just the UI shape. Reverse-engineered from `coachChange.service.ts`, `scheduling.service.ts`, `availability.service.ts`, migrations `0006`/`0011`/`0026`/`0039`, and `FEATURE_SPEC_PORTAL_ENHANCEMENTS.md` §4.2.

---

## 1. Governing principle — exactly two trigger paths, nothing else

1. **Automatic — the only path for documented leave.** Coach applies for leave → admin reviews and approves it → the system automatically finds and assigns shadow coach(es) for every affected session, with no separate "assign shadow coach" action required from anyone. This is the standard path and covers the large majority of cases.
2. **Manual — scoped to one specific situation.** A coach is absent but **never applied for leave in the system at all** (genuine emergency: sick same-day, no-show, anything with no `coach_leave` record to trigger off of). Since nothing was formally submitted, there's no approval event to auto-trigger the shadow search, so admin assigns a shadow coach directly from the client's profile.

This manual tool is **not** a general-purpose override of path 1, and it is **not** a separate "emergency leave" type inside the leave-request system — leave requests always require the same minimum notice, with no in-system fast-track. The manual tool is also reused for one other circumstance: resolving a properly-submitted leave where the automatic search came up with no candidate for some occurrences (§6). There is only one manual-assignment surface in the whole product, not a third workflow.

---

## 2. Data model

```
shadow_coach_assignments
  id, client_id, primary_coach_id, shadow_coach_id
  starts_on date, ends_on date (>= starts_on)
  reason text (nullable)
  status  'active' | 'cancelled'
  created_at, updated_at
  constraint: shadow_coach_id <> primary_coach_id
```

**Critical invariant:** the client's *permanent* coach relationship lives entirely in `recurring_slots.coach_id`. Shadow assignment **never writes to it**. Only individual `bookings.coach_id` rows inside the assignment's date range get repointed to the shadow coach. This is what makes "primary coach automatically resumes after leave ends" free: `generate_bookings_from_recurring_slot()` always reads the coach from `recurring_slots`, so any occurrence generated after `ends_on` carries the primary coach again with zero explicit revert code. Verify this falls out naturally from your generation logic — don't build a "restore primary coach" step.

---

## 3. Automatic flow — triggered by leave approval (`resolveLeave`)

Runs entirely as one admin action: approving a `coach_leave` row.

```
1. Flip coach_leave.status -> 'approved'. Notify the coach (leave_approved).
2. Find every client currently active under this coach (their recurring pattern
   points at this coach) -- this is the affected-client set for BOTH the
   "you're on leave" notice below AND the shadow-matching loop that follows;
   deliberately the same set, not two different derivations.
3. Notify every one of those clients: coach_on_leave_client
   (coach_name, starts_on, ends_on) -- unconditional, regardless of whether a
   shadow coach is later found for them.
4. If the leave is PARTIAL-day (leave_type='partial', with partial_start_time/
   partial_end_time): only sessions whose time window actually overlaps that
   partial window are "affected" -- sessions outside it must NOT be pulled into
   matching at all (they'd otherwise be needlessly reassigned or wrongly
   flagged as uncovered).
5. For each affected client:
   a. Expand their recurring pattern into concrete date+time occurrences
      inside [leave.starts_on, leave.ends_on] (§4).
   b. Resolve replacement candidates PER OCCURRENCE (§4) and rank by score (§5).
   c. Group consecutive same-coach occurrences into minimal assignment
      ranges (§6) and call assign_shadow_coach() once per group (§7).
   d. Occurrences with zero free candidates -> pushed to an "uncovered" list;
      notify admin, do NOT cancel the session (§8).
6. Separately: also re-check clients where THIS coach is currently covering as
   a SHADOW for someone else's leave -- their own new leave means those
   borrowed sessions need a fresh search too (§9, the cascading case).
```

---

## 4. Per-occurrence candidate search (`findShadowCoachCandidates`)

This is the one rule most likely to be implemented wrong if approximated: **resolution happens per session occurrence, never once for the whole leave date range.**

```
occurrences = every (date, time) where date is in [startsOn, endsOn]
              and date's day-of-week matches one of the client's
              active recurring_slots for this primary coach
for each occurrence:
    candidates = every OTHER active coach who is:
        - within their working hours for that exact slot
          (availability template / shift for that date, not on their own leave), AND
        - free of any scheduling conflict (no other booking/hold at that time)
    rank candidates by weighted score (§5), best first
    occurrence.candidates = ranked list (possibly empty)
```

A coach free on day 1 of the leave but booked on day 3 is **still a valid candidate for day 1** — do not disqualify a coach from the entire range because they fail on one occurrence. Different shadow coaches covering different days for the same client during one leave period is the **correct, expected** outcome, not an edge case to prevent.

Coach *leave* for the shadow candidate themselves must disqualify them for the overlapping occurrences (unlike first-time recurring-pattern setup, which deliberately ignores leave — this is the opposite case: leave is exactly what's being checked against here).

---

## 5. Compatibility scoring (`scoreShadowCandidate`)

A single weighted function, not a hardcoded priority ladder — keep the weights tunable in one place.

| Factor | Points |
|---|---|
| Candidate's specialization exactly matches primary coach's specialization | **+40** |
| (else) primary's specialization is one of candidate's *secondary* specializations | **+20** |
| Shared languages with primary coach | **+10 per language, capped at 3 languages (max +30)** |
| Coach rating (0–5 scale) | **rating × 6 (max +30)** |
| Utilization % (lower is better) | **(100 − utilization_pct) × 0.2 (max +20)** |

Specialization match and secondary-specialization match are mutually exclusive (only the higher one applies). Total is rounded to 1 decimal. Two fields from a broader reference wishlist are **deliberately not modeled**: gender preference and team/shift grouping — treat as optional future fields, not required for parity.

---

## 6. Turning per-occurrence results into assignments (`planShadowAssignments`)

```
lastCoachId = null
assignments = []
uncoveredDates = []
for each occurrence in date order:
    top = occurrence.candidates[0]
    if no top candidate:
        uncoveredDates.push(occurrence.date)
        lastCoachId = null          # force a new group after any gap
        continue
    if assignments is non-empty AND lastCoachId == top.coachId:
        extend the last assignment's endsOn to this occurrence's date
    else:
        start a new assignment: { shadowCoachId: top.coachId, startsOn: date, endsOn: date }
    lastCoachId = top.coachId
return { assignments, uncoveredDates }
```

**Why the gap must force a new group, precisely:** if an uncovered day sits between two occurrences that both resolve to the same coach, and the grouping didn't reset `lastCoachId`, the resulting date range would span across the uncovered day. Since the assignment step (§7) does a **date-range update** (not a per-booking list), that wider range would incorrectly reassign a booking on the uncovered day to a coach who was never actually confirmed free for it. Resetting on every gap is what keeps the date-range write safe.

This function is shared by **both** the automatic leave-approval path and the manual admin tool — same grouping/ranking logic, two different triggers.

---

## 7. Committing an assignment (`assign_shadow_coach`)

```
1. Insert shadow_coach_assignments row: (client_id, primary_coach_id,
   shadow_coach_id, starts_on, ends_on, reason, status='active').
2. Update bookings: set coach_id = shadow_coach_id
   WHERE client_id = this client AND coach_id = primary_coach_id
     AND status = 'upcoming' AND date(scheduled_start) BETWEEN starts_on AND ends_on.
3. Return the new assignment id.
```

Note step 2 matches on `coach_id = primary_coach_id`, not on `recurring_slot_id` — it only ever touches bookings currently sitting with the primary coach in that window, which is exactly the set the per-occurrence search already confirmed as affected.

Then, in parallel: log a timeline event (`shadow_coach_assigned`, internal/coach+admin visibility — **not** shown on the client's own narrative timeline, since the client gets the dedicated banner/badge instead, §10) and fire the two notifications in §11.

---

## 8. Never cancel for lack of coverage

If an occurrence has zero free candidates, it is **left assigned to the primary coach** (who is on leave) and pushed into an "uncovered" list. The system:
- Notifies admin immediately (a generic alert naming the client, the uncovered dates, and the leave window).
- Surfaces it persistently in the admin coverage queue (§9) until an admin manually resolves it via the same manual-assignment tool (§12).

A session must never be silently cancelled or left invisible just because no shadow coach was found.

---

## 9. Cascading case — a shadow coach goes on leave while covering someone else

Not obvious, easy to miss in a port: `assign_shadow_coach()` only ever matches bookings by `coach_id = primary_coach_id`. If the coach currently *covering* as a shadow (for some other client/primary-coach pair) then submits and gets approved for their **own** leave, those borrowed bookings are sitting at `coach_id = shadow_coach_id`, which the normal flow would never find or touch. Handle this as an explicit second pass whenever a leave is approved:

```
1. Find every active shadow_coach_assignments row where shadow_coach_id =
   the coach who just went on leave, and where [starts_on, ends_on] overlaps
   the new leave window.
2. For each such row, scope the re-search to ONLY the overlap between the
   existing shadow assignment and the new leave window (outside that overlap
   the shadow coach is still genuinely available).
3. Run the same per-occurrence search + scoring + grouping (§4-§6), but this
   time resolve against the OUTGOING shadow coach's id, not the original
   primary's.
4. For each resulting group: mark the old shadow_coach_assignments row(s)
   covering that stretch 'cancelled', insert a new active row for the
   replacement shadow coach, and move the affected bookings'
   coach_id from the outgoing shadow to the new one.
5. Notify the client and the NEW shadow coach with the same templates as a
   fresh assignment (§11). The outgoing shadow coach is NOT separately
   notified here -- their own leave-approval notification already told them.
6. Any occurrence with no replacement found -> same "uncovered" handling as §8.
```

---

## 10. What each portal actually shows

### Client
- **Dismissible banner** on the sessions screen: *"Temporary coach assigned"* with the notification message (§11). Sourced from the client's most recent **unread** `shadow_coach_assigned` notification — show only the single latest one, not a stack (once acknowledged, the per-session badge below already shows which bookings are affected). Dismissal is an explicit **"Acknowledge"** action that marks the notification read — never auto-dismiss on view.
- **Per-session badge**: any affected booking shows a "Shadow Coach" badge plus subtext *"Covering for {primaryCoachName} while they're away"*. A session card must never show just the shadow coach's name with no indication it's temporary — that reads as a silent permanent coach change.
- The `shadow_coach_assigned` timeline event is **internal** visibility — it does *not* appear on the client's own narrative activity timeline (the banner + badge already cover this for them); it's for coach/admin-facing timelines only.

### Shadow coach
- **Notification** on assignment (§11).
- The covered client's affected sessions simply **appear in their normal upcoming session list** (since the booking's `coach_id` now points to them) — no separate "shadow inbox," no accept/decline step (explicitly out of scope for this pass).
- **Activity/timeline entry**: e.g. *"Shadow coach assigned for {client} (covering {primaryCoach}, {startsOn} – {endsOn})"*.
- Own list of *all* their shadow assignments (past + active), scoped to themselves only.

### Primary coach
- **No new UI, no separate notification about the shadow assignment itself** — their own leave-approval notification already told them they're off for that window. Nothing else changes for them; their permanent ownership of the client (`recurring_slots.coach_id`) is untouched throughout, so post-leave everything looks exactly like before without any explicit revert action.

### Admin
- **Live "Shadow Coverage Required" queue.** Deliberately **not** a stored table — derive it live: any `upcoming` booking whose current `coach_id` still equals a coach who has *approved* leave covering that exact occurrence (respecting partial-day windows) is a gap — i.e., no shadow was ever found/assigned for it. Resolving it (via the manual tool) changes that booking's coach, so it naturally disappears from the next read with nothing to keep in sync.
- **Manual "Assign Shadow Coach" tool**, reachable from a client's profile: admin picks a date range → **preview** (same per-occurrence search + scoring + grouping as the automatic path) shown as a list of "{shadow coach} — {date range}" plus any uncovered dates in a clearly separate/warning section → admin optionally adds a free-text reason → **confirm**, which fires one assignment call per previewed group. Never skip the preview — admin must see the plan before committing.
- **Platform-wide list of all shadow assignments** (active + past, every client/coach) for general visibility in the scheduling view, separate from the flat session list.

---

## 11. Notifications — exact copy and recipients

| Event | Recipient | Template |
|---|---|---|
| Shadow assigned (new or reassigned) | Client | *"{{shadow_coach_name}} will cover your sessions with {{primary_coach_name}} from {{starts_on}} to {{ends_on}}."* |
| Shadow assigned (new or reassigned) | Shadow coach | *"You've been assigned as shadow coach for {{client_name}}, covering {{primary_coach_name}} from {{starts_on}} to {{ends_on}}."* |
| Leave approved, coach has active clients | Every affected client | *"coach_on_leave_client"* — coach_name, starts_on, ends_on. Fires unconditionally, independent of whether shadow coverage was found. |
| Occurrence(s) with no free shadow candidate | Admin | Generic alert naming the client, uncovered dates, and the leave window — "manual reassignment needed." |
| Outgoing shadow (going on their own leave) | *(none)* | Not notified about losing shadow coverage — their own leave-approval notification already covers it. |

---

## 12. Manual assignment tool — exact flow (`ShadowCoachAssignModal` equivalent)

```
Inputs: clientId, primaryCoachId, startsOn, endsOn, reason (optional)

1. "Find Coverage" -> run findShadowCoachCandidates(clientId, primaryCoachId,
   startsOn, endsOn) -> planShadowAssignments(occurrences). Show the result:
   - one line per assignment group: "{shadowCoachName} — {startsOn}–{endsOn}"
   - a distinct warning block listing any uncoveredDates
   - if the client has no sessions with that coach in the range at all,
     say so explicitly rather than showing an empty list
2. Admin reviews, may edit the reason text.
3. "Confirm Assignment(s)" -> for each group in the plan, call the assignment
   commit (§7) independently -- different shadow coaches on different date
   sub-ranges must be assigned as separate calls, never merged into one.
4. On success, close and refresh whatever list/queue launched this tool.
```

This exact function pair (search → plan → confirm) is reused both for undocumented absences and for resolving items surfaced by the coverage queue (§10, Admin) — never build a second matching implementation for either case.

---

## 13. Business rules checklist (replicate exactly)

1. **Exactly two trigger paths** — automatic (leave approval) and manual (undocumented absence / resolving an automatic-search miss). No third path, no in-system "emergency leave" fast-track, no bypass of the leave system's minimum-notice rule.
2. **Resolution is per-occurrence, never a whole-range binary check.** A coach failing on one date must still be considered for the others.
3. **Consecutive same-coach occurrences collapse into one assignment**; any gap (uncovered day or a different top coach) forces a new group — required for the date-range update in §7 to stay safe, not just for tidiness.
4. **Shadow assignment only ever repoints individual `bookings.coach_id`, never the client's permanent recurring-pattern coach.** Reversion to the primary coach after `ends_on` must be a natural consequence of how future occurrences are generated, not an explicit "restore" step.
5. **A shadow coach's own leave triggers a fresh per-occurrence search** for exactly the sessions they were covering, matched against their own id (not the original primary's), and marks the superseded assignment `cancelled`.
6. **Never cancel a session for lack of shadow coverage** — always leave it assigned to whoever currently holds it and flag for manual admin resolution.
7. **Scoring is one weighted function** (specialization match, language overlap, rating, utilization) — not a hardcoded tier ladder — so it can be re-tuned without restructuring the matching code.
8. **Partial-day leave only affects sessions whose time window actually overlaps the leave's partial window** — sessions outside it must be excluded from matching entirely, not reassigned or flagged.
9. **The client-facing banner shows only the single latest unread assignment notice**, dismissed via an explicit acknowledge action; the per-session badge is what shows which specific bookings are affected, so the two are complementary, not redundant.
10. **The `shadow_coach_assigned` timeline event is internal (coach/admin) visibility, not shown on the client's own narrative timeline** — the client's dedicated banner + badge are the client-facing surface for this, not the timeline.
11. **The admin coverage queue is derived live from current data (approved leave + bookings still on that coach), never a separately maintained table** — resolving an item is just reassigning the booking's coach, which removes it from the query automatically.
12. **Primary coach gets no separate notification or UI for the shadow assignment itself** — their leave-approval notification already covers the "you're off" fact.

---

## 14. Reference source code (verbatim)

Given so a mobile build can be a faithful port. Adapt Supabase RPC / Postgres specifics to your backend's DB client; do not change the algorithm or order of operations.

### 14.1 Schema (migration `0006_continuity.sql`)
```sql
create table shadow_coach_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client_profiles(id) on delete cascade,
  primary_coach_id uuid not null references coach_profiles(id) on delete cascade,
  shadow_coach_id uuid not null references coach_profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  reason text,
  status shadow_assignment_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shadow_coach_differs_from_primary check (shadow_coach_id <> primary_coach_id)
);
create index shadow_assignments_client_idx on shadow_coach_assignments(client_id);
create index shadow_assignments_status_idx on shadow_coach_assignments(status);
```

### 14.2 Commit RPC (migration `0011_scheduling_functions.sql`)
```sql
create or replace function assign_shadow_coach(
  p_client_id uuid, p_primary_coach_id uuid, p_shadow_coach_id uuid,
  p_starts_on date, p_ends_on date, p_reason text default null
)
returns uuid
language plpgsql
as $$
declare
  assignment_id uuid;
begin
  insert into shadow_coach_assignments (client_id, primary_coach_id, shadow_coach_id, starts_on, ends_on, reason, status)
  values (p_client_id, p_primary_coach_id, p_shadow_coach_id, p_starts_on, p_ends_on, p_reason, 'active')
  returning id into assignment_id;

  update bookings
  set coach_id = p_shadow_coach_id
  where client_id = p_client_id and coach_id = p_primary_coach_id and status = 'upcoming'
    and scheduled_start::date between p_starts_on and p_ends_on;

  return assignment_id;
end;
$$;
```

### 14.3 Cascading re-cover RPC (migration `0039_shadow_reassignment.sql`)
```sql
create or replace function reassign_shadow_coverage(
  p_client_id uuid, p_old_shadow_coach_id uuid, p_new_shadow_coach_id uuid, p_primary_coach_id uuid,
  p_starts_on date, p_ends_on date, p_reason text default null
)
returns uuid
language plpgsql
as $$
declare
  assignment_id uuid;
begin
  update shadow_coach_assignments
  set status = 'cancelled'
  where client_id = p_client_id and shadow_coach_id = p_old_shadow_coach_id and status = 'active'
    and starts_on <= p_ends_on and ends_on >= p_starts_on;

  insert into shadow_coach_assignments (client_id, primary_coach_id, shadow_coach_id, starts_on, ends_on, reason, status)
  values (p_client_id, p_primary_coach_id, p_new_shadow_coach_id, p_starts_on, p_ends_on, p_reason, 'active')
  returning id into assignment_id;

  update bookings
  set coach_id = p_new_shadow_coach_id
  where client_id = p_client_id and coach_id = p_old_shadow_coach_id and status = 'upcoming'
    and (scheduled_start at time zone 'Asia/Kolkata')::date between p_starts_on and p_ends_on;

  return assignment_id;
end;
$$;
```

### 14.4 Scoring + per-occurrence search (`scheduling.service.ts`)
```ts
export interface ShadowCoachCandidate {
  coachId: string;
  name: string;
  specialization: string | null;
  utilizationPct: number;
  score: number;
}

export interface ShadowOccurrence {
  slotStart: string; // ISO instant of this specific session occurrence
  durationMinutes: number;
  candidates: ShadowCoachCandidate[]; // ranked best-first, [] if none free
}

function scoreShadowCandidate(
  candidate: { specialization: string | null; secondarySpecializations: string[]; languages: string[]; rating: number; utilizationPct: number },
  primary: { specialization: string | null; languages: string[] }
): number {
  let score = 0;
  if (primary.specialization && candidate.specialization === primary.specialization) score += 40;
  else if (primary.specialization && candidate.secondarySpecializations.includes(primary.specialization)) score += 20;

  const sharedLanguages = candidate.languages.filter((l) => primary.languages.includes(l)).length;
  score += Math.min(sharedLanguages, 3) * 10; // up to 30

  score += candidate.rating * 6; // 0-5 -> 0-30
  score += (100 - candidate.utilizationPct) * 0.2; // 0-100 -> 0-20, lower utilization scores higher
  return Math.round(score * 10) / 10;
}

/** Resolved PER OCCURRENCE, not once for the whole date range -- a coach free
 * on 3 of 5 sessions is a real candidate for those 3. Different shadow
 * coaches covering different days for the same client during one leave
 * period is the correct, expected outcome, not an edge case to prevent. */
export async function findShadowCoachCandidates(
  accessToken: string,
  input: { clientId: string; primaryCoachId: string; startsOn: string; endsOn: string }
): Promise<ShadowOccurrence[]> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["admin"]);

  const [{ data: slots, error: slotsError }, { data: primary, error: primaryError }, { data: coaches, error: coachesError }, { data: util, error: utilError }] =
    await Promise.all([
      ctx.client.from("recurring_slots").select("day_of_week, start_time, duration_minutes")
        .eq("client_id", input.clientId).eq("coach_id", input.primaryCoachId).eq("status", "active"),
      ctx.client.from("coach_profiles").select("specialization, languages").eq("id", input.primaryCoachId).maybeSingle(),
      ctx.client.from("coach_profiles")
        .select("id, specialization, secondary_specializations, languages, rating, profile:profiles(full_name)")
        .eq("status", "active").neq("id", input.primaryCoachId),
      ctx.client.from("coach_utilization_view").select("coach_id, utilization_pct"),
    ]);
  if (slotsError) throw slotsError;
  if (!slots || slots.length === 0) return [];

  const start = new Date(`${input.startsOn}T00:00:00Z`);
  const end = new Date(`${input.endsOn}T00:00:00Z`);
  if (end < start) throw new Error("End date must be on or after start date");

  const occurrences: { slotStart: string; durationMinutes: number }[] = [];
  for (const slot of slots) {
    const cursor = new Date(start);
    while (cursor <= end) {
      if (cursor.getUTCDay() === slot.day_of_week) {
        const slotStart = istWallClockToInstant(cursor.toISOString().slice(0, 10), slot.start_time.slice(0, 5));
        occurrences.push({ slotStart: slotStart.toISOString(), durationMinutes: slot.duration_minutes });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  if (occurrences.length === 0) return [];
  occurrences.sort((a, b) => new Date(a.slotStart).getTime() - new Date(b.slotStart).getTime());

  if (primaryError) throw primaryError;
  const primaryProfile = { specialization: (primary as any)?.specialization ?? null, languages: ((primary as any)?.languages as string[] | null) ?? [] };

  if (coachesError) throw coachesError;
  if (!coaches || coaches.length === 0) return occurrences.map((occ) => ({ ...occ, candidates: [] }));

  if (utilError) throw utilError;
  const utilByCoach = new Map((util ?? []).map((u) => [u.coach_id, u.utilization_pct]));

  const occurrenceCandidates: ShadowCoachCandidate[][] = occurrences.map(() => []);

  await Promise.all(
    (coaches as any[]).map(async (coach) => {
      const freePerOccurrence = await Promise.all(
        occurrences.map(async (occ) => {
          const [{ data: withinHours, error: hoursError }, { data: hasConflict, error: conflictError }] = await Promise.all([
            ctx.client.rpc("is_slot_within_working_hours", { p_coach_id: coach.id, p_slot_start: occ.slotStart, p_duration_minutes: occ.durationMinutes }),
            ctx.client.rpc("has_scheduling_conflict", { p_coach_id: coach.id, p_slot_start: occ.slotStart, p_duration_minutes: occ.durationMinutes }),
          ]);
          if (hoursError) throw hoursError;
          if (conflictError) throw conflictError;
          return Boolean(withinHours) && !hasConflict;
        })
      );

      const utilizationPct = utilByCoach.get(coach.id) ?? 0;
      const candidate: ShadowCoachCandidate = {
        coachId: coach.id,
        name: coach.profile?.full_name ?? "Coach",
        specialization: coach.specialization ?? null,
        utilizationPct,
        score: scoreShadowCandidate(
          {
            specialization: coach.specialization ?? null,
            secondarySpecializations: (coach.secondary_specializations as string[] | null) ?? [],
            languages: (coach.languages as string[] | null) ?? [],
            rating: Number(coach.rating ?? 0),
            utilizationPct,
          },
          primaryProfile
        ),
      };

      freePerOccurrence.forEach((free, i) => { if (free) occurrenceCandidates[i].push(candidate); });
    })
  );

  return occurrences.map((occ, i) => ({ ...occ, candidates: occurrenceCandidates[i].sort((a, b) => b.score - a.score) }));
}
```

### 14.5 Grouping into minimal assignments (`scheduling.service.ts`)
```ts
export interface ShadowAssignmentPlanItem {
  shadowCoachId: string;
  shadowCoachName: string;
  startsOn: string; // date, inclusive
  endsOn: string;   // date, inclusive
}

export interface ShadowAssignmentPlan {
  assignments: ShadowAssignmentPlanItem[];
  uncoveredDates: string[]; // occurrence dates with zero free candidates
}

export function planShadowAssignments(occurrences: ShadowOccurrence[]): ShadowAssignmentPlan {
  const uncoveredDates: string[] = [];
  const assignments: ShadowAssignmentPlanItem[] = [];
  let lastCoachId: string | null = null; // any gap forces a new group

  for (const occ of occurrences) {
    const date = occ.slotStart.slice(0, 10);
    const top = occ.candidates[0];
    if (!top) {
      uncoveredDates.push(date);
      lastCoachId = null;
      continue;
    }
    const last = assignments[assignments.length - 1];
    if (last && lastCoachId === top.coachId) {
      last.endsOn = date;
    } else {
      assignments.push({ shadowCoachId: top.coachId, shadowCoachName: top.name, startsOn: date, endsOn: date });
    }
    lastCoachId = top.coachId;
  }

  return { assignments, uncoveredDates };
}
```

### 14.6 Live coverage-gap query (`scheduling.service.ts`)
```ts
export interface ShadowCoverageGap {
  bookingId: string; scheduledStart: string;
  clientId: string; clientName: string; clientCode: string | null;
  coachId: string; coachName: string;
  leaveId: string; leaveReason: string | null; leaveStartsOn: string; leaveEndsOn: string;
}

/** Deliberately derived live rather than a new table: a booking is a coverage
 * gap if its coach currently has approved leave covering that exact
 * occurrence (respecting partial-day time windows) and the booking is STILL
 * assigned to that same coach -- i.e. no shadow coach was ever found or
 * manually assigned for it. Resolving it changes bookings.coach_id away from
 * the primary coach, so the row disappears from this list on the next read
 * with nothing extra to keep in sync. */
export async function listShadowCoverageGaps(accessToken: string): Promise<ShadowCoverageGap[]> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["admin"]);

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const { data: leaves, error: leavesError } = await ctx.client
    .from("coach_leave")
    .select("id, coach_id, starts_on, ends_on, reason, leave_type, partial_start_time, partial_end_time")
    .eq("status", "approved").gte("ends_on", todayIso);
  if (leavesError) throw leavesError;
  if (!leaves || leaves.length === 0) return [];

  const coachIds = [...new Set((leaves as any[]).map((l) => l.coach_id))];
  const { data: bookings, error: bookingsError } = await ctx.client
    .from("bookings")
    .select("id, scheduled_start, duration_minutes, coach_id, client:client_profiles(id, client_code, profile:profiles(full_name)), coach:coach_profiles(profile:profiles(full_name))")
    .in("coach_id", coachIds).eq("status", "upcoming").gt("scheduled_start", now.toISOString());
  if (bookingsError) throw bookingsError;

  const gaps = new Map<string, ShadowCoverageGap>();
  for (const leave of leaves as any[]) {
    let windowMin: { start: number; end: number } | null = null;
    if (leave.leave_type === "partial" && leave.partial_start_time && leave.partial_end_time) {
      const [psH, psM] = leave.partial_start_time.split(":").map(Number);
      const [peH, peM] = leave.partial_end_time.split(":").map(Number);
      windowMin = { start: psH * 60 + psM, end: peH * 60 + peM };
    }

    for (const booking of (bookings as any[]).filter((b) => b.coach_id === leave.coach_id)) {
      if (gaps.has(booking.id)) continue;
      const bookingDate = istDateString(booking.scheduled_start);
      if (bookingDate < leave.starts_on || bookingDate > leave.ends_on) continue;

      if (windowMin) {
        const startMin = istTimeOfDayMinutes(booking.scheduled_start);
        const endMin = startMin + booking.duration_minutes;
        if (!(startMin < windowMin.end && endMin > windowMin.start)) continue;
      }

      gaps.set(booking.id, {
        bookingId: booking.id, scheduledStart: booking.scheduled_start,
        clientId: booking.client?.id ?? "", clientName: booking.client?.profile?.full_name ?? "Client", clientCode: booking.client?.client_code ?? null,
        coachId: leave.coach_id, coachName: booking.coach?.profile?.full_name ?? "Coach",
        leaveId: leave.id, leaveReason: leave.reason, leaveStartsOn: leave.starts_on, leaveEndsOn: leave.ends_on,
      });
    }
  }

  return [...gaps.values()].sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
}
```

### 14.7 Orchestration on leave approval (`availability.service.ts::resolveLeave`, condensed)
```ts
export async function resolveLeave(accessToken: string, leaveId: string, status: "approved" | "rejected"): Promise<LeaveResolutionSummary> {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["admin"]);
  const { data: leave } = await supabaseAdmin.from("coach_leave").update({ status }).eq("id", leaveId).select().single();

  const { data: coach } = await supabaseAdmin.from("coach_profiles").select("profile_id, profile:profiles(full_name)").eq("id", leave.coach_id).maybeSingle();
  if (coach) await notifyUser(coach.profile_id, status === "approved" ? "leave_approved" : "leave_rejected", { starts_on: leave.starts_on, ends_on: leave.ends_on });

  const summary: LeaveResolutionSummary = { leave: { id: leave.id, coachId: leave.coach_id, startsOn: leave.starts_on, endsOn: leave.ends_on, status: leave.status }, assigned: [], unassignedFlagged: [] };
  if (status !== "approved") return summary;

  const clientIds = await listActiveClientIdsForCoach(accessToken, leave.coach_id);
  if (clientIds.length === 0) return summary;

  const { data: profiles } = await supabaseAdmin.from("client_profiles").select("id, profile_id, profile:profiles(full_name)").in("id", clientIds);
  const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.profile?.full_name ?? "Client"]));
  const coachName = (coach as any)?.profile?.full_name ?? "Your coach";

  await Promise.all((profiles ?? []).map((p: any) => notifyUser(p.profile_id, "coach_on_leave_client", { coach_name: coachName, starts_on: leave.starts_on, ends_on: leave.ends_on })));

  let partialWindowMin: { start: number; end: number } | null = null;
  if (leave.leave_type === "partial" && leave.partial_start_time && leave.partial_end_time) {
    const [psH, psM] = leave.partial_start_time.split(":").map(Number);
    const [peH, peM] = leave.partial_end_time.split(":").map(Number);
    partialWindowMin = { start: psH * 60 + psM, end: peH * 60 + peM };
  }

  for (const clientId of clientIds) {
    let occurrences = await findShadowCoachCandidates(accessToken, { clientId, primaryCoachId: leave.coach_id, startsOn: leave.starts_on, endsOn: leave.ends_on });
    if (partialWindowMin) {
      occurrences = occurrences.filter((occ) => {
        const occStartMin = istTimeOfDayMinutes(occ.slotStart);
        const occEndMin = occStartMin + occ.durationMinutes;
        return occStartMin < partialWindowMin!.end && occEndMin > partialWindowMin!.start;
      });
    }
    const clientName = nameById.get(clientId) ?? "Client";
    const { assignments, uncoveredDates } = planShadowAssignments(occurrences);

    for (const plan of assignments) {
      await assignShadowCoach(accessToken, { clientId, primaryCoachId: leave.coach_id, shadowCoachId: plan.shadowCoachId, startsOn: plan.startsOn, endsOn: plan.endsOn, reason: "Auto-assigned: primary coach on approved leave" });
    }
    if (assignments.length > 0) {
      summary.assigned.push({ clientId, clientName, shadowCoaches: assignments.map((a) => ({ shadowCoachId: a.shadowCoachId, shadowCoachName: a.shadowCoachName, startsOn: a.startsOn, endsOn: a.endsOn })) });
    }
    if (uncoveredDates.length > 0) {
      summary.unassignedFlagged.push({ clientId, clientName, uncoveredDates });
      await notifyAdmins("admin_alert", { alert_message: `No shadow coach available for ${clientName} on ${uncoveredDates.join(", ")} during coach leave ${leave.starts_on}-${leave.ends_on} -- manual reassignment needed.` });
    }
  }

  // Cascading case (§9): this coach might ALSO be covering OTHER clients as a
  // shadow for a different primary -- their own leave means those sessions
  // need a fresh shadow search too, scoped to the overlap window.
  const { data: shadowingRows } = await supabaseAdmin
    .from("shadow_coach_assignments").select("client_id, primary_coach_id, starts_on, ends_on")
    .eq("shadow_coach_id", leave.coach_id).eq("status", "active")
    .lte("starts_on", leave.ends_on).gte("ends_on", leave.starts_on);

  for (const row of shadowingRows ?? []) {
    const overlapStart = row.starts_on > leave.starts_on ? row.starts_on : leave.starts_on;
    const overlapEnd = row.ends_on < leave.ends_on ? row.ends_on : leave.ends_on;
    let occurrences = await findShadowCoachCandidates(accessToken, { clientId: row.client_id, primaryCoachId: row.primary_coach_id, startsOn: overlapStart, endsOn: overlapEnd });
    const { data: clientProfile } = await supabaseAdmin.from("client_profiles").select("id, profile:profiles(full_name)").eq("id", row.client_id).maybeSingle();
    const clientName = (clientProfile as any)?.profile?.full_name ?? "Client";
    const { assignments, uncoveredDates } = planShadowAssignments(occurrences);

    for (const plan of assignments) {
      await reassignShadowCoverage(accessToken, { clientId: row.client_id, oldShadowCoachId: leave.coach_id, newShadowCoachId: plan.shadowCoachId, primaryCoachId: row.primary_coach_id, startsOn: plan.startsOn, endsOn: plan.endsOn, reason: "Auto-reassigned: shadow coach also went on approved leave" });
    }
    if (assignments.length > 0) summary.assigned.push({ clientId: row.client_id, clientName, shadowCoaches: assignments.map((a) => ({ shadowCoachId: a.shadowCoachId, shadowCoachName: a.shadowCoachName, startsOn: a.startsOn, endsOn: a.endsOn })) });
    if (uncoveredDates.length > 0) {
      summary.unassignedFlagged.push({ clientId: row.client_id, clientName, uncoveredDates });
      await notifyAdmins("admin_alert", { alert_message: `No replacement shadow coach available for ${clientName} on ${uncoveredDates.join(", ")} -- their shadow coach also went on leave during this period, manual reassignment needed.` });
    }
  }

  return summary;
}
```

### 14.8 Commit + notify (`coachChange.service.ts`)
```ts
export async function assignShadowCoach(
  accessToken: string,
  input: { clientId: string; primaryCoachId: string; shadowCoachId: string; startsOn: string; endsOn: string; reason?: string }
) {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["admin"]);
  const { data, error } = await ctx.client.rpc("assign_shadow_coach", {
    p_client_id: input.clientId, p_primary_coach_id: input.primaryCoachId, p_shadow_coach_id: input.shadowCoachId,
    p_starts_on: input.startsOn, p_ends_on: input.endsOn, p_reason: input.reason ?? null,
  });
  if (error) throw error;

  const [, { data: client }, { data: shadowCoach }, { data: primaryCoach }] = await Promise.all([
    logTimelineEvent(input.clientId, "shadow_coach_assigned", "Shadow coach assigned", {
      description: input.reason, actorId: ctx.userId,
      metadata: { primaryCoachId: input.primaryCoachId, shadowCoachId: input.shadowCoachId, startsOn: input.startsOn, endsOn: input.endsOn },
    }),
    supabaseAdmin.from("client_profiles").select("profile_id, profile:profiles(full_name)").eq("id", input.clientId).maybeSingle(),
    supabaseAdmin.from("coach_profiles").select("profile_id, profile:profiles(full_name)").eq("id", input.shadowCoachId).maybeSingle(),
    supabaseAdmin.from("coach_profiles").select("profile:profiles(full_name)").eq("id", input.primaryCoachId).maybeSingle(),
  ]);
  const primaryCoachName = (primaryCoach as any)?.profile?.full_name ?? "your coach";
  await Promise.all([
    client ? notifyUser((client as any).profile_id, "shadow_coach_assigned", { shadow_coach_name: (shadowCoach as any)?.profile?.full_name ?? "A coach", primary_coach_name: primaryCoachName, starts_on: input.startsOn, ends_on: input.endsOn }) : Promise.resolve(),
    shadowCoach ? notifyUser((shadowCoach as any).profile_id, "shadow_assignment_for_coach", { client_name: (client as any)?.profile?.full_name ?? "a client", primary_coach_name: primaryCoachName, starts_on: input.startsOn, ends_on: input.endsOn }) : Promise.resolve(),
  ]);
  return data as string; // assignment id
}

/** §9: re-covers sessions when the SHADOW coach (not the primary) goes on
 * leave themselves. Matches bookings on the outgoing shadow's id, not the
 * primary's, and marks the superseded assignment 'cancelled'. */
export async function reassignShadowCoverage(
  accessToken: string,
  input: { clientId: string; oldShadowCoachId: string; newShadowCoachId: string; primaryCoachId: string; startsOn: string; endsOn: string; reason?: string }
) {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["admin"]);
  const { data, error } = await ctx.client.rpc("reassign_shadow_coverage", {
    p_client_id: input.clientId, p_old_shadow_coach_id: input.oldShadowCoachId, p_new_shadow_coach_id: input.newShadowCoachId,
    p_primary_coach_id: input.primaryCoachId, p_starts_on: input.startsOn, p_ends_on: input.endsOn, p_reason: input.reason ?? null,
  });
  if (error) throw error;

  const [, { data: client }, { data: newShadowCoach }, { data: primaryCoach }] = await Promise.all([
    logTimelineEvent(input.clientId, "shadow_coach_assigned", "Shadow coach reassigned", {
      description: input.reason, actorId: ctx.userId,
      metadata: { primaryCoachId: input.primaryCoachId, oldShadowCoachId: input.oldShadowCoachId, newShadowCoachId: input.newShadowCoachId },
    }),
    supabaseAdmin.from("client_profiles").select("profile_id, profile:profiles(full_name)").eq("id", input.clientId).maybeSingle(),
    supabaseAdmin.from("coach_profiles").select("profile_id, profile:profiles(full_name)").eq("id", input.newShadowCoachId).maybeSingle(),
    supabaseAdmin.from("coach_profiles").select("profile:profiles(full_name)").eq("id", input.primaryCoachId).maybeSingle(),
  ]);
  const primaryCoachName = (primaryCoach as any)?.profile?.full_name ?? "your coach";
  await Promise.all([
    client ? notifyUser((client as any).profile_id, "shadow_coach_assigned", { shadow_coach_name: (newShadowCoach as any)?.profile?.full_name ?? "A coach", primary_coach_name: primaryCoachName, starts_on: input.startsOn, ends_on: input.endsOn }) : Promise.resolve(),
    newShadowCoach ? notifyUser((newShadowCoach as any).profile_id, "shadow_assignment_for_coach", { client_name: (client as any)?.profile?.full_name ?? "a client", primary_coach_name: primaryCoachName, starts_on: input.startsOn, ends_on: input.endsOn }) : Promise.resolve(),
  ]);
  return data as string;
}

/** Backs the coach's own "My Shadow Assignments" list. */
export async function listMyShadowAssignments(accessToken: string) {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["coach"]);
  const { data: coach } = await ctx.client.from("coach_profiles").select("id").eq("profile_id", ctx.userId).single();
  const { data, error } = await ctx.client
    .from("shadow_coach_assignments")
    .select("id, client:client_profiles(id, profile:profiles(full_name)), primary_coach:coach_profiles!primary_coach_id(profile:profiles(full_name)), starts_on, ends_on, status, created_at")
    .eq("shadow_coach_id", coach!.id).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Backs the client's per-session "Shadow Coach" badge -- their OWN active
 * shadow coverage only. */
export async function listMyShadowAssignmentsAsClient(accessToken: string) {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["client"]);
  const { data: client } = await ctx.client.from("client_profiles").select("id").eq("profile_id", ctx.userId).single();
  const { data, error } = await ctx.client
    .from("shadow_coach_assignments")
    .select("id, shadow_coach_id, primary_coach:coach_profiles!primary_coach_id(profile:profiles(full_name)), starts_on, ends_on, status")
    .eq("client_id", client!.id).eq("status", "active");
  if (error) throw error;
  return data;
}

/** Admin's platform-wide "Shadow Sessions" list. */
export async function listAllShadowAssignments(accessToken: string) {
  const ctx = await getCallerContext(accessToken);
  requireRole(ctx, ["admin"]);
  const { data, error } = await ctx.client
    .from("shadow_coach_assignments")
    .select("id, client:client_profiles(id, profile:profiles(full_name)), primary_coach:coach_profiles!primary_coach_id(profile:profiles(full_name)), shadow_coach:coach_profiles!shadow_coach_id(profile:profiles(full_name)), starts_on, ends_on, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
```

### 14.9 Manual admin actions (`admin-shadow-coach.actions.ts`)
```ts
export async function listShadowCoverageGapsAction(): Promise<ActionResult<ShadowCoverageGap[]>> {
  return runAction(async () => {
    const token = await requireToken();
    return listShadowCoverageGaps(token);
  });
}

/** Manual assignment for a coach who never applied for leave -- shares the
 * exact per-occurrence matching + grouping logic the automatic leave-approval
 * path uses, just triggered on demand. Returns a plan for admin review before
 * anything is actually assigned. */
export async function previewShadowAssignmentPlanAction(clientId: string, primaryCoachId: string, startsOn: string, endsOn: string): Promise<ActionResult<ShadowAssignmentPlan>> {
  return runAction(async () => {
    const token = await requireToken();
    const occurrences = await findShadowCoachCandidates(token, { clientId, primaryCoachId, startsOn, endsOn });
    return planShadowAssignments(occurrences);
  });
}

/** Executes a previewed plan: one assign_shadow_coach() call per (coach,
 * date-range) group, so different shadow coaches on different days are
 * assigned independently rather than one overwriting another's coverage. */
export async function confirmShadowAssignmentPlanAction(input: { clientId: string; primaryCoachId: string; plan: ShadowAssignmentPlanItem[]; reason?: string }): Promise<ActionResult<{ assignmentIds: string[] }>> {
  return runAction(async () => {
    const token = await requireToken();
    const assignmentIds: string[] = [];
    for (const item of input.plan) {
      assignmentIds.push(await assignShadowCoach(token, { clientId: input.clientId, primaryCoachId: input.primaryCoachId, shadowCoachId: item.shadowCoachId, startsOn: item.startsOn, endsOn: item.endsOn, reason: input.reason }));
    }
    return { assignmentIds };
  });
}
```

### 14.10 Client-side session enrichment (`timeline.service.ts` / `client-portal.actions.ts`)
```ts
interface ShadowAssignmentLite { shadowCoachId: string; startsOn: string; endsOn: string; primaryCoachName: string; }

function findShadowCoverage(coachId: string | undefined, sessionDateIST: string, assignments: ShadowAssignmentLite[]): ShadowAssignmentLite | null {
  if (!coachId) return null;
  return assignments.find((a) => a.shadowCoachId === coachId && sessionDateIST >= a.startsOn && sessionDateIST <= a.endsOn) ?? null;
}

// In the row-to-view mapper, per session:
const shadowMatch = row.coach ? findShadowCoverage(row.coach.id, istDateString(row.scheduled_start), shadowAssignments) : null;
// ...
isShadowCoach: !!shadowMatch,
primaryCoachName: shadowMatch?.primaryCoachName ?? null,
```

### 14.11 Notification templates (migrations `0008`, `0024`)
```sql
-- client-facing
('shadow_coach_assigned', 'system', 'Temporary coach assigned',
 '{{shadow_coach_name}} will cover your sessions with {{primary_coach_name}} from {{starts_on}} to {{ends_on}}.')

-- coach-facing
('shadow_assignment_for_coach', 'system', 'Shadow session assigned',
 'You''ve been assigned as shadow coach for {{client_name}}, covering {{primary_coach_name}} from {{starts_on}} to {{ends_on}}.')
```

---

## 15. Suggested mobile implementation shape

- Keep `findShadowCoachCandidates` (per-occurrence search + scoring) and `planShadowAssignments` (grouping) as two clearly separate, reusable functions — both the automatic leave-approval path and the manual admin tool must call the *same* two functions, never duplicate logic between them.
- Keep the commit step (`assignShadowCoach` / `reassignShadowCoverage` equivalents) as thin wrappers: insert-assignment-row + date-ranged booking update + timeline log + two notifications, nothing else. Resist folding matching logic into the commit step.
- Model the coverage queue as a **query, not a table** — same reasoning as the "one row per day-of-week" rule from the recurring-schedule engine: derived data should stay derived, not duplicated into a second source of truth that can drift.
- Treat the cascading "shadow-of-a-shadow" case (§9) as a first-class code path from day one, not an afterthought — it's easy to ship the primary-coach-leave flow, forget this one, and only discover the gap when a shadow coach happens to also request leave in production.
- Surface the client-facing banner and per-session badge as two distinct UI affordances (one acknowledgeable/dismissible, one persistent per booking) rather than trying to collapse them into one — they answer different questions ("was I told?" vs. "which of my sessions does this affect?").
