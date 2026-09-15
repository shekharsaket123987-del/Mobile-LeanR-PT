# Audit Section 9: Admin Escalations Module — Screen-Level Parity

Scope: `leanr-mobile-app` Admin Escalations (list + detail) vs web `src/app/admin/escalations/**`. Cross-reference: `05-admin-coach-crossdeps-navigation.md` §A2/ADM-004 already confirmed the DB-trigger call-gate WORKING CORRECTLY — not re-litigated here. This pass covers what that one didn't: full field/filter/action parity on both screens.

Web reference files: `src/app/admin/escalations/page.tsx`, `src/app/admin/escalations/[id]/page.tsx`, `src/components/admin/AdminEscalationsClient.tsx`, `src/components/admin/AdminEscalationDetailClient.tsx`, `src/lib/actions/admin-escalations.actions.ts`, `src/lib/services/escalations.service.ts`, `src/lib/constants/concern-categories.ts`.

Mobile files (all edited this pass): `src/lib/data/admin-escalations.ts`, `src/app/(admin)/admin-escalations.tsx`, `src/app/(admin)/escalation/[id].tsx`.

---

## Findings

### ESC-001. Assessment form never prefilled from saved data — BROKEN, fixed
`escalation/[id].tsx` (pre-fix) initialized `issueType`/`fault`/`summary`/`resolutionNotes` state to `null`/`''` unconditionally and never synced them once `escalation` loaded async via `useAsync`. Web's equivalent (`AdminEscalationDetailClient.tsx:36-39`) initializes directly from the `escalation` prop, which is already loaded server-side before the component mounts — an option not available to a client-fetched screen.

Effect: opening an already-assessed escalation (e.g. one already `in_progress` with issue type/fault/summary previously saved) showed a blank assessment form. Hitting "Save assessment" again — even just to add a note-adjacent edit — would silently overwrite `admin_issue_type`/`fault`/`admin_summary` back to null/empty, destroying prior work invisibly.

**Fix**: added a `useEffect` keyed on `escalation.id` (via a ref, not on every `data` object change) that prefills the four fields once per escalation, so a mid-session `reload()` (from adding a note, marking in-progress) never clobbers unsaved in-progress edits. `escalation/[id].tsx:96-104`.

### ESC-002. Assessment + Notes locked read-only after resolution — IMPLEMENTED BUT DIFFERENT, fixed
Web keeps the "Admin Assessment" and "Progress Notes" cards editable/addable regardless of `status` — only the separate "Resolve" action card swaps for a read-only "Resolved" badge card once resolved (`AdminEscalationDetailClient.tsx:97-217`, no `isResolved` gating on the assessment/notes cards themselves). Mobile (pre-fix) disabled every chip/field and hid both "Save assessment" and "Add note" whenever `isResolved`, contradicting web's actual behavior of allowing continued case notes/reclassification after close (e.g. correcting a fault classification discovered after resolution, or logging a client follow-up call).

**Fix**: removed all `disabled={isResolved}` / `editable={!isResolved}` / `{!isResolved && (...)}` gates around the assessment chips/field/save-button and the notes field/add-button. `escalation/[id].tsx:143-207`. The separate resolved-vs-active "Resolve" card logic (already correct) is untouched.

### ESC-003. Notes shown with no author or timestamp — NOT IMPLEMENTED, fixed
Web's Progress Notes list shows `{authorName} · {date} · {time}` per note (`AdminEscalationDetailClient.tsx:154-160`), backed by `escalation_notes.select("*, author:profiles(full_name)")` (`escalations.service.ts:177-186`). Mobile's `getEscalationNotes` selected only `id, note, created_at` and the UI rendered note text alone — no author, no date, no time, even though `created_at` was already being fetched and simply never displayed.

**Fix**: extended the select to `id, note, created_at, author:profiles(full_name)`, added `authorName` to the `EscalationNote` type, and render `{authorName ?? 'Admin'} · {date} · {time}` under each note. `admin-escalations.ts:60,111-121`; `escalation/[id].tsx:184-192`.

### ESC-004. Detail summary card missing client code, raised/resolved date+time, and category shown as raw enum value — PARTIALLY IMPLEMENTED, fixed
Web's "Client's Report" card shows the client code (or a short id fallback), a human category label, and both raised and resolved date+time (`AdminEscalationDetailClient.tsx:65-77`). Mobile's card showed only `Category: slot_not_available` (raw DB value, unmapped), no client code, and no timestamps at all beyond a date in the screen subtitle.

**Fix**: added client code / id-fallback line, a `categoryLabel()` mapping (mirrors `CONCERN_CATEGORIES`), raised date+time, and resolved date+time (conditional on `resolved_at`). Also added the "Called the client on {date}·{time}" line web shows once `called_client_at` is set (`AdminEscalationDetailClient.tsx:99-101`), which mobile omitted entirely. `escalation/[id].tsx:130-142`; data layer extended with `resolved_at`/`clientCode` fields (`admin-escalations.ts:27-42,60-78`).

### ESC-005. List cards missing client code, category badge, description preview, resolution-notes preview — PARTIALLY IMPLEMENTED, fixed
Web's list card (`AdminEscalationsClient.tsx:60-80`) shows client code, category badge, status badge, raised date, resolved date (if resolved), client name + package name, reason, description preview, and a resolution-notes preview on resolved cards. Mobile's card showed only date, status badge, reason, client name — the rest were silently dropped, making the list far less scannable for triage (an admin couldn't tell issue category or see any description/resolution context without opening every card).

**Fix**: added client code, a category badge, resolved-date suffix, description preview, and resolution-notes preview (resolved tab only). `admin-escalations.tsx:56-90` + new `categoryLabel()` helper (`:33-45`) + styles.

**Not fixed — package name**: web additionally shows `· {packageName}` next to the client name on the list (from the client's active subscription → package tier). Requires an additional join (`subscriptions` → `package_tiers`) not present in `getAllEscalations`'s current select. Low information value relative to effort/risk of a broader query change on a list endpoint; left out. **Requires product decision** if wanted — not a technical blocker, just scoped out of this pass.

### ESC-006. Doc/code mismatch in file header — cosmetic, fixed
`admin-escalations.ts`'s header claimed the call-gate was "enforced client-side here... AND by a DB trigger," but no function body contained a client-side pre-check (already flagged as cosmetic-only in `05-admin-coach-crossdeps-navigation.md` ADM-004). Corrected the comment to accurately describe the DB-trigger-only enforcement, since the UI simply hides the gated sections rather than re-checking. `admin-escalations.ts:9-16`.

### ESC-007. List tabs, filtering, empty/error/loading states — WORKING CORRECTLY
Active/Resolved segmented tabs (client-side filter matching web's tab logic exactly: `resolved` vs `not resolved`), empty state per tab, loading/error states with retry — all already correct, no web-side search/sort/pagination exists on this screen to diff against (web has none either — confirmed by reading `AdminEscalationsClient.tsx` in full, no search input, no sort control, no pagination, just the two tabs).

### ESC-008. Call-gate empty state and confirm-call button — WORKING CORRECTLY
Minor pre-existing redundant `&& !isResolved` condition on the confirm-call button removed as part of ESC-004's edit (harmless no-op since `isResolved` implies `called` already true, but now matches web's simpler single-ternary structure exactly). Functionally unchanged.

---

## Matrix Rows

| ID | Area | Functionality | Location | Web Behavior | App Behavior (pre-fix) | Status | Fix |
|---|---|---|---|---|---|---|---|
| ESC-001 | Escalation detail | Assessment form prefill | `escalation/[id].tsx` | Prefilled from loaded escalation | Always blank on open, silently overwrites saved data on re-save | BROKEN → FIXED | Added id-keyed prefill `useEffect` |
| ESC-002 | Escalation detail | Editing after resolution | `escalation/[id].tsx` | Assessment/notes stay editable after resolve | Locked read-only after resolve | IMPLEMENTED BUT DIFFERENT → FIXED | Removed `isResolved` disable/hide gates |
| ESC-003 | Escalation detail | Note attribution | `admin-escalations.ts`, `escalation/[id].tsx` | Author + date + time per note | Note text only | NOT IMPLEMENTED → FIXED | Joined `author:profiles(full_name)`, render meta line |
| ESC-004 | Escalation detail | Summary card fields | `escalation/[id].tsx` | Client code, category label, raised/resolved timestamps, called-at timestamp | Raw category value, no code, no timestamps | PARTIALLY IMPLEMENTED → FIXED | Added fields + `categoryLabel()` |
| ESC-005 | Escalations list | Card fields | `admin-escalations.tsx` | Code, category badge, resolved date, description, resolution preview, package name | Date, status badge, reason, client name only | PARTIALLY IMPLEMENTED → MOSTLY FIXED | Added all except package name |
| ESC-006 | Data layer | Header comment accuracy | `admin-escalations.ts` | N/A | Overstated client-side enforcement | Cosmetic → FIXED | Corrected comment |
| ESC-007 | Escalations list | Tabs/empty/error/loading | `admin-escalations.tsx` | Active/Resolved tabs, no search/sort/pagination | Same | WORKING CORRECTLY | — |
| ESC-008 | Escalation detail | Call-gate button condition | `escalation/[id].tsx` | Single ternary on `called` | Redundant extra `!isResolved` check (harmless) | WORKING CORRECTLY | Simplified for parity |

## Requires product/schema decision
- **Package name on list cards** (ESC-005): would need `getAllEscalations` to also resolve each client's active subscription → package tier name. Scoped out this pass; not a schema change, just a bigger query — revisit if triage-by-package turns out to matter to admins.

## Verification
`npx tsc --noEmit` — clean, zero errors across the whole project after all edits (checked full output, not just escalation files).
