# LEANR Mobile — FINAL UI/UX & Functionality Specification

**Hand this document directly to the AI agent working in VS Code on `leanr-mobile-app`. It is the final, decisive word on navigation, screen composition, and UI quality — it does not replace `LEANR_PT_MOBILE_PRD.md` (business logic, database, RPC contracts) or `LEANR_PT_NEXTGEN_APP_PRD.md` (brand/motivation layer), it resolves every open UI question those two left and locks the navigation for good. Read those two documents first if you haven't; this one assumes them.**

Audited directly against the live `leanr-mobile-app` repo and the deployed web app on 2026-09-04. Every claim below is grounded in an actual file in this repo — no invented screens, no guessed structure.

---

## 0. Why this document exists

The client (Saket) reviewed the current build and is not happy with the UI — specifically, buttons and layout that look inconsistent or placed without a clear system ("randomly created ui and buttons on bottom"). This is a real, findable problem, not a vague impression — see §1. This document's job is to remove all ambiguity so the next build pass fixes it properly instead of adding another inconsistent layer on top.

**Ground rule for every change you make from here on:** never touch `src/lib/data/*.ts`, `src/lib/auth/*`, or anything in `supabase/` to fix a UI complaint. The data layer and business logic are correct and already proven against the live database — the problem is entirely in the presentation layer (`src/app/**`'s JSX/styling and a handful of legacy components). If a screen looks wrong, fix its layout and components; do not touch what it fetches or how it mutates data unless this document explicitly asks you to (§6, two net-new screens only).

---

## 1. Diagnosis: what's actually causing the inconsistent-UI complaint

The repo has **two button systems living side by side**, and that's almost certainly what reads as "random":

- The current design system: `components/ui/button.tsx` (`PrimaryButton`, `DestructiveButton`, `IconButton`, etc.) — pill-shaped, 44pt+ height, press-scale micro-interaction, used consistently across **28 screens**.
- A legacy system: `components/tappable.tsx` (`CtaButton`, `TextLink`) — an older, differently-shaped button that predates the redesign.

**These 7 screens still use the legacy component** and visually clash with everything else in the app:

- `app/(auth)/book-free-demo.tsx`
- `app/(auth)/otp.tsx`
- `app/(client)/book-session.tsx`
- `app/(client)/demo-booking.tsx`
- `app/(client)/plans.tsx`
- `app/(client)/sessions.tsx`
- `components/avatar-editor.tsx`

Two of those — **Book a Session** and **Plans** — are among the highest-traffic screens in the whole client app (booking and purchasing), so this isn't a cosmetic edge case; it's front and center.

**Required fix (§6.1):** migrate all 7 off `CtaButton`/`TextLink` onto the `components/ui/button.tsx` family, and delete `components/tappable.tsx` once nothing imports it. This alone will resolve most of what reads as "random."

Beyond that specific bug, §3 below sets hard rules so no future screen can drift back into this state.

---

## 2. Brand system — already correct, do not redesign it

`src/constants/theme.ts` already carries the verified web-matching tokens (`#060606` background, `#F5D90A` brand yellow, Anton display font, Manrope body font, the glass blur/gradient recipe). **Keep it exactly as-is.** The problem is inconsistent *application* of these tokens across screens (§1), not the tokens themselves. Do not introduce new colors, new fonts, or a second card style — every surface in the app must be built from the three existing primitives:

| Primitive | File | Use for |
|---|---|---|
| `PrimaryButton` / `DestructiveButton` / `IconButton` | `components/ui/button.tsx` | Every tappable action, full stop. Never a raw `Pressable` with hand-rolled styling for anything that behaves like a button. |
| `GlassCard` / `GlassPanel` | `components/ui/glass-card.tsx` | Hero surfaces, section containers, anything that should read as "elevated." Flat `Brand.bgElevated` fills are correct only for dense list rows (per that file's own comment) — not a license to invent a third card style. |
| `BottomSheet` | `components/ui/bottom-sheet.tsx` | Every confirm/reschedule/cancel/filter interaction. Never a native `Alert.alert` for anything richer than a single yes/no, and never a full-screen modal for something that's really a sheet. |

If a screen needs something these three don't cover, extend the shared component — don't create a one-off.

---

## 3. UI quality bar — non-negotiable rules

These exist specifically so "random buttons on the bottom" can't happen again:

1. **One bottom-anchored persistent element only: the `FloatingTabBar`.** No screen may add its own floating/fixed button pinned to the bottom edge that competes with it visually, except the documented Book-a-Session FAB pattern (§4), which must use the same floating-glass-pill visual language as the tab bar itself — not a different shape, color, or elevation style.
2. **One primary action per screen, always in the same place.** For a scrolling screen, the primary action is the last element in the content flow (e.g. `HomeScreen`'s `PrimaryButton` at the bottom of its scroll content) — never floating independently. For a form/wizard screen, the primary action is pinned above the safe area in a consistent footer bar, matching how `BottomSheet` already pins its actions.
3. **Secondary actions live inside a `GlassCard`'s `MenuRow` list or a `BottomSheet`, never scattered as standalone buttons.** If a screen has more than two actions, that's a sign it needs a sheet or a menu, not more buttons in the layout.
4. **Every touch target is 44pt minimum** — already enforced by `button.tsx`'s `SIZE_HEIGHT`; don't override it downward anywhere.
5. **Spacing comes from a single scale, not eyeballed values.** Reuse the gap/padding values already established in `HomeScreen`'s `styles` (4 / 8 / 10 / 14 / 16 / 20) — don't introduce arbitrary numbers like 13 or 17.
6. **No screen invents its own icon set.** Stick to `@expo/vector-icons` Ionicons, outline variant when inactive / filled when active, exactly as `FloatingTabBar` and every `_layout.tsx` already do.
7. **Before marking any screen "done," visually diff it against the two or three nearest screens already using the current system** (e.g. a new client screen against `HomeScreen`/`ProgressScreen`) — if a button, card, or spacing choice doesn't match, that's a bug, not a style choice.

---

## 4. FINAL locked navigation — no further changes without a product decision

This is decisive. The structure below is what's already built and confirmed correct against both PRDs — treat it as final, not a proposal.

### Client — 5 tabs
```
[Home] [Sessions] [Coach] [Progress] [More]
```
- **Home** (`index.tsx`) — hero card (next session, join CTA), streak chip, this-month stat, primary CTA.
- **Sessions** (`sessions.tsx`) — segmented Upcoming / Schedule / History. Book-a-Session surfaces as a FAB only while the client has no recurring schedule yet.
- **Coach** (`coach.tsx`) — coach card + chat thread, one screen.
- **Progress** (`progress.tsx`) — ring, photos, trend, weekly log.
- **More** (`more.tsx`) → Subscription & Plans, My Concerns, Notifications, Profile.
- Pushed, not tabbed: `book-session.tsx`, `reschedule/[id].tsx`, `my-schedule.tsx`, `demo-booking.tsx`.
- Top-right, every screen: account button (`ProfileButton`) → identity + role badge → "View profile" + "Sign out." Two actions. Never expand this into a bigger menu — that was an earlier, since-corrected proposal.

### Coach — 3 tabs + More
```
[Home] [Schedule] [Clients] [More]
```
- **More** → Availability, Chats, Escalations, Performance, Search, Renewals, Notifications, Profile.
- Pushed: `session/[id].tsx`, `chat/[id].tsx`, and the new `clients/[id].tsx` (§6.3).

### Admin — 3 tabs + More
```
[Escalations] [Leave] [Coverage] [More]
```
- **More** is sign-out only. Everything else in the 18-screen web admin console (Dashboard, Coaches, Clients CRUD, Sessions master list, Sales, Reports, Settings, etc.) stays **web/tablet-only, intentionally** — this was a scope decision already made in `LEANR_PT_MOBILE_PRD.md` Phase 12, not an omission. Do not add more admin screens to mobile without a direct product decision from Saket.

If any part of this contradicts what a screen currently does, **the screen is wrong, not this document.**

---

## 5. Full feature-parity checklist

Every feature the web app has (`LEANR_PT_MOBILE_PRD.md` §6, 45 features total), mapped to where it lives on mobile. Anything marked 🔴 is a real gap — build it. Anything not on this list at all that you find in the web app must be added to the most fitting existing tab/More-row above, using the existing visual language — never invented as a new nav destination without checking this table first.

### Client (14 features)
| Feature | Mobile location | Status |
|---|---|---|
| Book a Session (ad-hoc) | Sessions tab → FAB → `book-session.tsx` | ✅ built |
| Recurring Schedule Setup/Change | Sessions tab → `my-schedule.tsx` | ✅ built |
| Reschedule Session | Sessions tab → `reschedule/[id].tsx` | ✅ built |
| Cancel Session | Sessions tab, in-screen | ✅ built |
| Rate Session / Feedback | Sessions tab, in-screen | ✅ built |
| Purchase Plan (Razorpay) | More → Subscription & Plans (`plans.tsx`) | ✅ built |
| Book Free Demo | Reached from Plans / dashboard CTA (`demo-booking.tsx`) | ✅ built |
| **Onboarding (initial assessment)** | — | 🔴 missing — no route in repo |
| **Renewal Check-in** | — | 🔴 missing — no route in repo |
| **Activate Plan (pick start date)** | — | 🔴 missing — no route in repo |
| Weekly Progress/Measurements Log | Progress tab | ✅ built |
| My Coach / Request Coach Change | Coach tab | ✅ built |
| Raise a Concern (Escalation) | More → My Concerns (`concerns.tsx`) | ✅ built |
| Chat with Coach | Coach tab (merged) | ✅ built |
| Notifications | More → Notifications | ✅ built |
| Subscription & Payment History | More → Subscription & Plans | ✅ built |

### Coach (13 features)
| Feature | Mobile location | Status |
|---|---|---|
| View Availability / Request Leave | More → Availability | ✅ built |
| Coach Dashboard Stats | Home tab | ✅ built |
| Today/Pending/Upcoming task widgets | Home tab | ✅ built |
| Client Roster | Clients tab | ✅ built |
| **Client Detail (read-only)** | — | 🔴 missing — code comment confirms "left for a later pass" |
| In-Session Workflow (Join→Attendance→Notes→Complete) | `session/[id].tsx` | ✅ built |
| Global Client Search | More → Search | ✅ built |
| Coach Performance Dashboard | More → Performance | ✅ built |
| Client Escalations (read-only) | More → Escalations | ✅ built |
| Coach Profile / Password Change | More → Profile | ✅ built |
| Renewal Opportunities (view) | More → Renewals | ✅ built |
| Chat with Clients | More → Chats → `chat/[id].tsx` | ✅ built |
| Notifications | More → Notifications | ✅ built |

### Admin (18 features)
| Feature | Mobile location | Status |
|---|---|---|
| Escalation Resolution Workflow | Escalations tab → `escalation/[id].tsx` | ✅ built |
| Coach Leave Approval | Leave tab | ✅ built |
| Shadow Coach Coverage | Coverage tab | ✅ built |
| Platform Dashboard/KPIs | — | Web-only, by design |
| Availability Check | — | Web-only, by design |
| Coach Roster Management | — | Web-only, by design |
| Client Roster Management | — | Web-only, by design |
| Scheduling Oversight | — | Web-only, by design |
| Sessions Master List | — | Web-only, by design |
| Session Detail (forensics) | — | Web-only, by design |
| Coach Performance Panel | — | Web-only, by design |
| Activity Log/Audit Trail | — | Web-only, by design |
| Coach Change Request Resolution | — | Web-only, by design |
| Reports Export | — | Web-only, by design |
| Sales Ledger | — | Web-only, by design |
| Global Client Search | — | Web-only, by design |
| Platform Settings & Packages | — | Web-only, by design |
| Notifications | — | Web-only, by design |

Admin's "Web-only, by design" rows are the deliberate Phase-12 scope decision (§4) — not gaps to close silently.

---

## 6. Required builds

### 6.1 Finish the button/component migration (do this first — highest visual impact for the least risk)
Migrate these 7 files off `CtaButton`/`TextLink` (`components/tappable.tsx`) onto `components/ui/button.tsx`'s `PrimaryButton`/`DestructiveButton`/`IconButton`, matching the visual pattern already used in `HomeScreen`, `progress.tsx`, and the other 28 already-migrated screens exactly:
- `app/(auth)/book-free-demo.tsx`
- `app/(auth)/otp.tsx`
- `app/(client)/book-session.tsx`
- `app/(client)/demo-booking.tsx`
- `app/(client)/plans.tsx`
- `app/(client)/sessions.tsx`
- `components/avatar-editor.tsx`

Once nothing imports `components/tappable.tsx`, delete it. Do not leave the legacy component around "just in case."

### 6.2 Build the missing client journey-stage flows
Build `onboarding.tsx`, `activate.tsx`, and `renewal-checkin.tsx` under `app/(client)/`, gated the same way the web app auto-redirects into them (per `LEANR_PT_MOBILE_PRD.md` §5/§25's gated-flow description) — presented as friendly full-screen guided flows (a "Step 2 of 4" stepper per `LEANR_PT_NEXTGEN_APP_PRD.md` §7), not bare forms, and built from the same `GlassCard`/`PrimaryButton` primitives as everything else. These are unskippable stacks pushed on top of Home when the client's journey stage requires it — never a tab, never in More.

### 6.3 Build the coach Client Detail screen
Add `app/(coach)/clients/[id].tsx` — a read-only detail push from the Clients tab roster, matching `/coach/clients/[id]` on web (full client profile: contact info, plan status, session history — read-only, coaches cannot edit client data from here per the web's own permission model).

---

## 7. Do not

1. Do not touch anything in `src/lib/data/*.ts`, `src/lib/auth/*`, or `supabase/` to fix a UI complaint — the bug is in the presentation layer.
2. Do not add new bottom-nav tabs or new top-level destinations beyond §4 without checking §5 first — almost everything already has a home.
3. Do not expand the admin app beyond Escalations/Leave/Coverage without a direct decision from Saket.
4. Do not invent a fourth card/button/sheet style — extend the three primitives in §2.
5. Do not leave `components/tappable.tsx` in place "for now" once §6.1 is done — a live legacy component is exactly how this problem started.
6. Do not build §6.2's gated flows as plain forms — they must use the stepper treatment already specified in the NEXTGEN doc.

---

## 8. Acceptance checklist

Before calling any of this done:

- [ ] Every button in the app is a `PrimaryButton`/`DestructiveButton`/`IconButton` — zero references to `CtaButton`/`TextLink` remain in the codebase.
- [ ] `components/tappable.tsx` is deleted.
- [ ] A client can complete onboarding → activation → first booking → renewal check-in entirely on mobile, matching the web's gating logic exactly.
- [ ] A coach can tap any client in their roster and see a real detail screen, not a dead row.
- [ ] Every row in §5's feature tables is ✅ or explicitly "Web-only, by design" — nothing silently missing.
- [ ] A screen-by-screen visual pass confirms no floating button competes with the tab bar, no ad-hoc card style, no off-scale spacing (§3).
- [ ] Both `LEANR_PT_MOBILE_PRD.md`'s Build status table and this document's checklist above are updated to reflect what actually shipped.
