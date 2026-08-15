# LEANR by Fitelo — Next-Gen Mobile App PRD
### Product & UX Blueprint for a High-Retention, Motivating iOS + Android PT App

![LEANR by Fitelo](image.png)

**Document type:** Product/UX PRD (business + design specification), companion to `LEANR_PT_MOBILE_PRD.md` (the technical web-to-mobile conversion spec).
**Relationship to the existing doc:** `LEANR_PT_MOBILE_PRD.md` is the *functional* source of truth — every feature, screen, business rule, and data model in this document is inherited from it unchanged. This document does **not** change what the app does. It changes **how it feels to use** — the visual language, motivation layer, information architecture, and screen-level UX — and adds a competitive analysis to justify each change. Where the two documents conflict on a UI detail, this document wins; where they conflict on a business rule (cutoff hours, validation, role permissions), the original PRD wins.
**Brand assets used as-is:** the "LEANR" wordmark (bold italic Oswald, yellow-on-black) and "By Fitelo" sub-lockup from `image.png` are the canonical logo — carried forward, not redesigned. Same brand name, same logo, same core black/yellow theme.

---

## 1. Vision & Positioning

**One line:** *LEANR is the live, human-coached PT app that feels less like enterprise software and more like a trainer who's genuinely in your corner — every day, not just at session time.*

The underlying business (live 1:1 coaching, real coaches, real Zoom sessions, real accountability — see original PRD §1–§9) is already differentiated and doesn't need to change. What the top-rated competitors in this space have and LEANR's current web-derived UI does not:

- A reason to **open the app between sessions** (streaks, daily nudges, progress rings)
- A **simple, almost gym-front-desk-simple** golden path (Planet Fitness: 4.87★/770K ratings on pure simplicity)
- A **premium, personal, "my coach knows me" feel** at first use (Future, Trainwell: 4.9★ built on coach-matching + unlimited chat + video check-ins)
- **Visible momentum** — rings, streaks, milestone celebrations (Technogym, cult.fit, gamified fitness apps generally)

This PRD's job is to bolt a genuine **motivation and simplicity layer** onto LEANR's existing, real feature set, expressed through the existing black/yellow brand — not to invent new business logic.

---

## 2. Competitive Analysis

Researched directly (via the four links provided) plus the category leaders in human-coached PT apps, to ground every UX recommendation below in what's actually working at scale.

| App | Model | Rating / Volume | What's genuinely working | Where it falls short | What LEANR should take |
|---|---|---|---|---|---|
| **cult.fit** (`fit.cure.android`) | India "super-app": gym + home workouts + live classes + nutrition + mental health, one login | Tens of millions of installs, category leader in India | Live-class energy, habit streaks, bundling creates daily-open reasons even on non-session days | Bloated — five products in one app, overwhelming IA, notification fatigue | Daily-open reasons (streaks, "today's move"), but keep LEANR's IA **narrow and single-purpose** — don't bundle |
| **Technogym App** (`com.technogym.tgapp`) | Equipment-connected fitness ecosystem, syncs gym hardware to app | 4.38★, ~3.6M downloads | Premium dark UI, seamless data sync, clean progress visualization, feels "professional-grade" | Cold/clinical — little human warmth, no coach relationship | Its **visual polish and data-viz quality** (rings, trend lines) — not its equipment-dependency |
| **Planet Fitness App** (App Store id `399857015`) | Gym membership companion: on-demand workouts, crowd meter, digital check-in | **4.87★, 770K+ ratings** — highest of any app researched | Radical simplicity: one-tap check-in, huge friendly buttons, no clutter, low cognitive load | No personal coaching, purely self-serve, no relationship depth | The **simplicity discipline** — every screen in §9 below is designed to this bar: one primary action, huge tap target, zero unnecessary choices |
| **BTFIT** (`com.btfit`, Bodytech) | Online PT: trainer-prescribed workouts + live group classes, 7-day free trial | Strong regional (Brazil) traction | Low-friction trial funnel, prescribed-workout clarity, hybrid 1:1 + group model | Generic template UI, little brand personality | The **frictionless trial → paid funnel** shape for LEANR's demo → plan journey |
| **Future** | Human coach, $200+/mo premium | **4.9★, 9,400+ reviews** (Apple) | Coach-matching quiz on day one, unlimited chat, video check-ins, feels like a real relationship from minute one | Expensive, iOS-first polish (Android weaker) | The **"meet your coach" first-run moment** — LEANR already assigns a coach; make that assignment feel like a match, not a database write |
| **Trainwell** | Human coach + AI-adapted plan | 4.9★ iOS / 3.9★ Android (parity gap) | In-workout voice guidance, real-time coach messaging, visible plan adaptation | Android experience visibly behind iOS | Build **iOS and Android to true parity from day one** — do not let one platform lag |
| **Fitbod / Caliber** | Algorithmic or periodized programming | High ratings in self-serve/strength niches | Best-in-class progress analytics and workout logging polish | No human coach (Fitbod); LEANR's model is stronger here | Their **analytics/chart quality** for the Progress tab only |

**Synthesis — the four traits every top app in this space shares, that LEANR's current design does not yet express:**
1. A **daily reason to open the app**, not just a session-day reason.
2. **Radical per-screen simplicity** (Planet Fitness' 4.87★ is earned almost entirely by this).
3. A **visible, personal coach relationship** from the first screen (Future/Trainwell).
4. **Visible momentum** — rings, streaks, trend lines, milestone moments (Technogym, cult.fit, Fitbod).

Everything from §6 onward is built to deliver these four traits **without adding a single feature that isn't already in the original PRD's scope** — this is a UI/UX and motivation-layer upgrade, not a scope expansion.

---

## 3. Personas (grounded in the existing client journey, §7a of the original PRD)

| Persona | Profile | Core need from the app | Primary screens they live in |
|---|---|---|---|
| **"New Nisha"** — prospective client | Browsing, hasn't committed, comparing to gym-chain apps | Trust fast, frictionless demo booking, feels premium not corporate | Landing → Demo Booking → Coach match reveal |
| **"Active Aman"** — subscribed, mid-journey | Has a recurring schedule, 2–3 sessions/week | Momentum, don't let me lose my streak, quick reschedule, feel coached between sessions | Home, My Sessions, Progress, Chat |
| **"Renewal Riya"** — approaching plan end | Has results, deciding whether to continue | See her own progress proof visually, feel recognized/rewarded for consistency | Progress, Renewal Check-in, Dashboard milestone banner |

---

## 4. Brand System (extends original §23 — same tokens, expanded for a mobile-native motivational feel)

### 4.1 Colors — same core palette, extended with functional/motivational tokens

| Token | Hex | Usage (unchanged from original) |
|---|---|---|
| `brand.black` | `#000000` | primary dark surface, hero backgrounds |
| `brand.charcoal` | `#111111` | body text on light surfaces |
| `brand.charcoal2` | `#1A1A1A` | secondary surfaces, pressed states |
| `brand.yellow` | `#F5E400` | primary accent — CTAs, active nav, progress rings |
| `brand.yellow2` | `#FFE600` | pressed/hover state, gradient end |
| Page background | `#FAFAFA` | light-mode body |
| Card/white | `#FFFFFF` | light-mode cards |

**New — motivation/semantic tokens (additive, never replace the above):**

| Token | Hex | Usage |
|---|---|---|
| `streak.ember` | `#FF7A18` → `#F5E400` gradient | streak flame icon, "N-day streak" chip |
| `success.emerald` | `#10B981` (Tailwind emerald-500, already used in web) | completed session check, positive progress delta |
| `alert.red` | `#EF4444` (Tailwind red-500, already used) | cancellations, unread badges — unchanged |
| `glow.yellow` | `rgba(245,228,0,0.25–0.4)` | soft glow behind rings/CTA on dark surfaces (already exists as `shadow-glow`, now used more deliberately for celebration moments) |

**Dark mode is the primary mode**, not an afterthought — the brand is black-first (`brand.black` as the base surface is literally token #1 in the existing system). Light mode (`#FAFAFA`/white cards) is the secondary, "daytime/legibility" mode. Both are fully supported; the app opens in the device's system theme, defaulting to dark on first install to match the existing web app's bold black hero sections and to feel more premium/energetic (in line with Technogym's dark, professional-grade feel).

### 4.2 Typography — unchanged font pairing, clarified hierarchy for mobile
- **Display / motivational numbers**: Oswald 600/700, **bold + italic**, used for: streak counts, headline stats ("12 sessions completed"), screen titles, celebration moments. This is LEANR's most distinctive visual signature — lean into it harder on mobile than the web app does (bigger, bolder, used for every "big number" moment).
- **Body**: Manrope 400/500/600/700 — all UI copy, chat, form labels, list content.
- Minimum body size 15sp (up from typical 14px web) for mobile legibility; display numbers scale up to 40–56sp on hero cards.

### 4.3 Shape, motion, elevation
- Radius unchanged: `16px` buttons, `20px` cards, full-round badges/avatars/rings.
- **New — motion principles** (the single biggest gap vs. Technogym/Future's "premium" feel): every state change gets a purposeful, short (150–300ms) animation — progress rings fill rather than snap, streak flames pulse, completed-session checkmarks draw themselves, plan-purchase success triggers a brief confetti burst in brand yellow. Motion is used to communicate *progress*, never as decoration.
- Shadows: reuse `shadow-soft`/`shadow-card`/`shadow-glow` from the original system; `shadow-glow` gets **promoted** from a decorative hero touch to the standard treatment behind every ring/streak/celebration element — it's the brand's visual shorthand for "achievement."

### 4.4 Logo usage
The `image.png` lockup (yellow "LEANR" wordmark, bold italic, on black, with the white "By Fitelo" sub-lockup and mark) is used exactly as supplied:
- App icon: the mark alone (the small circular "By Fitelo" glyph) or a simplified single-letter/monogram treatment on a black tile — **OPEN QUESTION for design team**, same as flagged in the original PRD §23/§32, since no standalone icon-only asset exists yet. Recommend cropping/extracting the circular "F"-mark from `image.png` as the app-icon starting point rather than commissioning a new mark.
- Splash screen: full lockup centered on black, per the existing brand.
- In-app: full wordmark on auth/marketing screens only; a simplified icon-only mark in the app header elsewhere (standard mobile pattern — the full wordmark is a first-impression asset, not a persistent chrome element).

---

## 5. Design Principles

1. **One primary action per screen.** Planet Fitness earns 4.87★ largely on this discipline. Every screen in §9 has exactly one obvious, large, yellow-on-black primary CTA — everything else is secondary/ghost.
2. **Show momentum, always.** Streaks, rings, and trend lines are not a separate "gamification module" — they're woven into the Home screen and Progress tab as the default view, not an opt-in extra.
3. **The coach is a person, not a database field.** Every screen that references "your coach" shows their photo, name, and a human touch (a quick note, an emoji reaction) — never just "Coach: Assigned."
4. **Big touch targets, minimal typing.** Chip/slot selection over free text everywhere possible (already mostly true in the original booking flows — extended here to progress logging, feedback, and concern-raising with quick-select categories before free text).
5. **Consistent, not novel.** Every screen reuses the same six components (StatCard, ProgressRing, SessionCard, CoachAvatarBadge, PrimaryButton, StreakChip) — never introduce a new pattern for a single screen.

---

## 6. Information Architecture & Navigation

Same nav *items* as the original PRD §25 (do not invent new destinations) — restructured for a motivation-first hierarchy.

### Client app — bottom tab bar (5 slots)
```
┌──────────────────────────────────────────────────────┐
│   🏠 Home     📅 Sessions   💬 Coach    📈 Progress   ≡ More │
└──────────────────────────────────────────────────────┘
```
- **Home** replaces "Dashboard" as the tab label (friendlier, matches competitor naming conventions) — same `getClientDashboardAction`-backed screen, redesigned per §9.1.
- **Sessions** merges "My Sessions" + "My Schedule" + "Book a Session" into one tab with a segmented header (Upcoming / Schedule / History) — reduces 3 nav concepts to 1, per Design Principle #1. The "Book a Session" FAB still surfaces contextually (only while no recurring schedule exists, per original §25).
- **Coach** replaces "My Coach" and absorbs "My Chats" once unlocked — the coach relationship becomes a first-class tab instead of buried in "More" (directly answers Future/Trainwell's biggest strength).
- **Progress** — unchanged destination, elevated to a primary tab (was in "More" implicitly via nav order in the original) because visible momentum is core to retention.
- **More** — Subscription, My Concerns, Notifications, Profile (unchanged from original).

### Coach app — bottom tab bar
```
🏠 Home   📅 Schedule   👥 Clients   💬 Chats   ≡ More
```
Unchanged from original PRD §25 — the coach app is a professional tool, not a motivation surface, so it keeps the denser, task-first layout as-is.

### Admin
Unchanged recommendation from original PRD §25 (§26): tablet-first / deprioritized for phase 1 mobile, desk-bound workflow.

---

## 7. Core Modules — Same Feature, Enhanced Treatment

Every row below is a feature that **already exists** per the original PRD (§5–§10). Nothing new is added; only the presentation changes.

| Module (original PRD ref) | Original web treatment | Next-gen mobile treatment |
|---|---|---|
| Dashboard (§5 client) | Journey-stage banner, cards in a grid | **Hero card** with coach photo + next-session countdown ring + streak chip, single scroll, one primary CTA at all times |
| Book a Session (§5, §8a) | 3-step inline wizard | Full-screen step flow, large day/time chips (44pt+), animated confirmation with checkmark draw-in |
| My Schedule (§5) | Pattern picker + slot grid | Weekly calendar strip (native-feeling, swipeable), pattern shown as a visual weekly "streak map" |
| My Sessions (§5, §8e/f) | 5 desktop tabs | Segmented control, swipe-between-tabs, session cards double as streak-contributing units (a completed session lights up that day on the streak map) |
| Progress (§5) | Charts + log form | Full-bleed **progress ring** (sessions this month / goal), before/after photo strip, Recharts-equivalent trend line in brand yellow-on-black, one-tap "Log This Week" |
| My Coach + Chats (§5) | Separate nav items | Unified **Coach tab**: coach card up top (photo, bio, "message" + "call" affordances), chat thread below — the relationship is the whole screen |
| Plans / Purchase (§5, §8g) | Pricing table + Razorpay Checkout.js | Card-carousel plan picker, native Razorpay SDK, **celebration animation** (confetti in brand yellow) on `verifyPaymentAction` success — this is the single highest-emotion moment in the funnel and currently gets a plain modal |
| Onboarding/Activate/Renewal Check-in (§5, gated flows) | Auto-redirect full-page forms | Same gating logic, presented as a friendly **progress-stepper** ("Step 2 of 4") instead of a bare form — removes the "why am I filling out a form" feeling |
| Notifications (§5, §26) | In-app list only | Same list **plus real push** (see §11) — the original PRD flags this as the single biggest net-new backend requirement (§26); this document treats it as non-negotiable for a motivating mobile experience, not optional polish |
| Coach Dashboard/Session workflow (§5 coach) | Task-row list | Kept dense/functional per Design Principle #5 (coach app ≠ motivation surface), but attendance/notes buttons enlarged to 44pt+ touch targets per original §26 |

---

## 8. New Motivation & Engagement Layer

This is the connective tissue that turns "an app you open on session days" into "an app you open daily" — built entirely from data the original PRD already tracks (bookings, attendance, progress_logs, subscriptions), no new backend entities required except where noted.

| Mechanic | Data source (already exists) | Where it appears |
|---|---|---|
| **Session streak** ("5-week streak" flame chip) | Consecutive weeks with ≥1 `bookings.status='completed'` | Home hero, Sessions tab header |
| **Progress ring** (sessions completed vs. this month's plan) | `bookings` count vs. subscription cadence | Home hero, Progress tab |
| **Milestone celebrations** (10th/25th/50th session, first renewal) | `bookings.status='completed'` count, `subscriptions` renewal event | Full-screen confetti moment, shareable card (image export — new, lightweight client-side feature) |
| **Weekly recap card** ("This week: 3 sessions, 45 min avg, coach note highlight") | `bookings` + `workout_notes` for the past 7 days | Push notification (Sunday evening) + pinned Home card |
| **Coach note highlight** — coach's session notes surfaced as a personal message, not buried data | `workout_notes.additional_remarks` | Home feed, Coach tab |
| **Renewal recognition** — "You've trained consistently for 12 weeks" framing on the existing Renewal Check-in screen | `subscriptions` history | Renewal Check-in intro screen (reframes an existing required step as a reward moment) |
**Explicitly excluded from this document, by design:** anything that is a *feature* borrowed from a competitor rather than a *presentation* treatment of an existing LEANR feature — cult.fit's leaderboards/social challenges, multi-vertical bundling (nutrition/mental-health super-app), Fitbod's algorithmic-programming replacement of a human coach, Technogym's equipment-pairing. Every mechanic in the table above is a new **visual/motivational treatment of data the original PRD already stores** (bookings, attendance, progress_logs, subscriptions) — not a new capability. Per the brief, competitor research informs *how one app looks, feels, and motivates*; it does not add scope. If a genuinely new feature (e.g. a social leaderboard) is wanted later, it must be scoped as a deliberate, separate product decision — not folded in here.

---

## 9. Key Screen Specs

### 9.1 Home (Client)
```
┌─────────────────────────────────┐
│  Hi Aman 👋              🔔 3    │  ← Manrope, warm greeting + notif bell
│                                   │
│  ┌─────────────────────────────┐ │
│  │  🔥 5-week streak             │ │  ← streak.ember chip
│  │  ◔ Next session in 2h 14m    │ │  ← ProgressRing / countdown, glow.yellow
│  │  with Coach Riya  [Join]     │ │  ← coach avatar + PrimaryButton
│  └─────────────────────────────┘ │
│                                   │
│  This month: ●●●○○ 3/5 sessions  │  ← StatCard, Oswald bold italic number
│                                   │
│  📝 Coach note from your last     │
│     session: "Great form on..."  │  ← human-touch card
│                                   │
│  [ Log this week's progress ]    │  ← secondary CTA, only if due
└─────────────────────────────────┘
```
One primary action (Join / next relevant CTA per journey stage — same state machine as original PRD §7a), everything else glanceable, no more than one scroll.

### 9.2 Book a Session — full-screen step flow
Step 1 intro (assessment badge if first session) → Step 2 slot chips (large, 2-column grid, selected state = yellow fill + black text) → Step 3 review & confirm (coach photo, date/time restated in plain language: "Tuesday, 6:00 PM with Coach Riya") → success screen with a subtle checkmark draw-in animation. Matches original PRD §7b/§8a exactly; only the chip sizing, copy tone, and success-state animation change.

### 9.3 Progress tab
```
┌─────────────────────────────────┐
│         Your Progress            │
│                                   │
│        ╭───────────╮             │
│        │   ◔ 78%    │             │  ← full-bleed ring, glow behind it
│        │  12 / 15    │             │
│        ╰───────────╯             │
│                                   │
│  Weight trend        [▲ -2.4kg]  │  ← trend line, brand-yellow on black card
│  ╱‾╲___╱‾‾‾╲___                  │
│                                   │
│  [ Before ] [ Now ]  ← photo strip│
│                                   │
│  [  Log this week's update  ]    │  ← single primary CTA
└─────────────────────────────────┘
```

### 9.4 Plans / Paywall — the highest-emotion screen in the funnel
Card-carousel (swipeable) of packages, price in large Oswald bold-italic numerals, "Most Popular" badge in brand yellow. On successful `verifyPaymentAction` (original PRD §8g): full-screen brand-yellow confetti burst over a black background, coach-photo reveal if not yet assigned, single CTA "Set up my schedule →" leading straight into My Schedule setup — collapses the original's separate "Congratulations modal → dashboard → My Schedule" hop into one continuous celebratory motion.

### 9.5 Coach tab (merged My Coach + Chats)
Top: coach card (large photo, name, specialty tags, "message"/"request change" affordances). Below: chat thread, native-feeling bubbles, read receipts (already in original scope), image attachment via native picker (original §26). This single-screen merge is the most direct response to Future/Trainwell's "the coach is the whole product" strength.

---

## 10. Onboarding & Activation Redesign

Same gated journey-stage flow as original PRD §7a/§15 (marketing → demo → plan → activation → onboarding → slot_selection → active) — restyled as a friendly stepper rather than bare sequential forms, inspired directly by Future's coach-match framing:

```
Signup → "Let's find your coach" (visual quiz-style intake, same data as
          existing onboarding form fields, just chip/slider inputs instead
          of raw form fields) → Coach match reveal (photo + short bio,
          animated card flip) → Choose Your Plan → Purchase (confetti,
          §9.4) → Activate Plan (date picker) → Onboarding assessment
          (progress-stepper: "Step 2 of 3") → Pick your weekly schedule
          (visual weekly grid) → Home (active)
```
No business-rule changes — this is the exact state machine from original PRD §7a, restyled screen-by-screen.

---

## 11. Notifications & Re-engagement

The original PRD (§26) already flags real push notification dispatch as the single largest net-new backend requirement for any mobile version of LEANR — this document treats it as **mandatory for launch**, not a stretch goal, because it's the delivery mechanism for the entire motivation layer in §8:

- Session reminders (existing `notifications` rows → push via Expo Push/FCM/APNs, per original §26)
- Streak-at-risk nudge ("Your 5-week streak ends tomorrow — book your session")
- Weekly recap (Sunday evening, §8)
- Coach message push (real-time chat, already Realtime-backed per original §5)
- Renewal/milestone moments
- Deep-link every push to the exact screen via `notifications.related_entity_type/id` (already present in schema, currently unused by web — original §26 flags mobile should actually route on it)

---

## 12. Accessibility & Performance

- WCAG AA contrast: brand yellow (`#F5E400`) on black passes for large/bold text (which is how it's always used — Oswald bold italic); body text stays Manrope on white/charcoal for AA-safe body contrast.
- All touch targets ≥44×44pt (original PRD §26 requirement, reinforced here for every new motivational chip/badge, not just existing buttons).
- Reduce-motion setting respected — ring fills/confetti degrade to instant-state changes when the OS accessibility setting is on.
- Screen-reader labels on all icon-only nav items and progress rings (announce the underlying number, not just "ring").

---

## 13. Monetization

Unchanged from original PRD — Razorpay-backed package purchase (§8g), no new pricing model introduced. The only change is presentation (§9.4) and, if the product team wants it, an optional higher tier bundling priority coach-chat response time — **flagged as a business decision outside this document's scope**, not specified further here.

---

## 14. Cross-Platform Build Approach

To hit "both iOS and Android, mobile-friendly" with true parity (avoiding Trainwell's Android-lag problem, §2):

- **Recommended: React Native (or Flutter) single codebase**, not two native codebases — the fastest way to guarantee iOS/Android feature and visual parity from day one, and pairs naturally with the "thin HTTP API" backend approach the original PRD recommends in §27 (Option B).
- Design tokens (§4) implemented as a shared theme file consumed by every component, so brand consistency is enforced structurally, not by convention.
- Component inventory: `ProgressRing`, `StreakChip`, `SessionCard`, `CoachAvatarBadge`, `PrimaryButton/SecondaryButton`, `StatCard`, `CelebrationOverlay` — a small, disciplined set reused everywhere (Design Principle #5), directly ported from/extending the existing web `ui/*` inventory (original §23).
- Offline handling: graceful error states for the hold→confirm booking flow per original §26 (a hold can expire while offline) — no full offline-first sync in scope, matching the original's explicit boundary.

---

## 15. Success Metrics

| Metric | Why it matters here |
|---|---|
| D7/D30 retention | Directly tests whether the motivation layer (§8) creates non-session-day opens |
| Push opt-in rate + push→session-booked conversion | Tests whether §11's notification strategy actually drives behavior |
| Time-to-first-booking after signup | Tests onboarding redesign (§10) against the original's plainer form flow |
| Plan renewal rate | Tests whether progress visualization + milestone recognition (§8, §9.3) measurably affects the existing renewal flow's outcome |
| App Store / Play Store rating | The explicit benchmark set by this research — Planet Fitness (4.87★) and Future/Trainwell (4.9★) are the bar |

---

## 16. Roadmap (maps onto original PRD §28 phasing — design/UX layer only)

1. **Design system & component library** — tokens (§4), core components (§14), dark/light both fully built.
2. **Core client journey** — Home, Book, Sessions, Progress, Coach tab (§9) at full visual fidelity.
3. **Motivation layer** — streaks, rings, celebrations, push notifications (§8, §11) wired to real data.
4. **Coach app** — functional parity screens (§7 coach row), lighter design investment per Design Principle #5.
5. **Admin** — deprioritized per original §26, revisit tablet-first design after phases 1–4 ship.

---

## 17. Differentiation Summary

LEANR's underlying business already does what Future and Trainwell charge $200+/month for — a real, dedicated human coach with live sessions — at what the original PRD's package/plan model suggests is a more accessible price point. The gap has never been the business model; it's been that the **web-derived UI doesn't yet look or feel like a $200/month coaching relationship, and gives clients no reason to open the app between sessions.** This document closes exactly that gap: Planet Fitness-level simplicity per screen, Future/Trainwell-level coach-relationship warmth, and Technogym/cult.fit-level visible momentum — all inside the existing LEANR by Fitelo black-and-yellow brand, with zero new business logic beyond what `LEANR_PT_MOBILE_PRD.md` already specifies.

---

## 18. Brand Launch Experience (App-Open Animation)

### 18.1 Concept — "The Ignition Reveal"

The brief for this section was deliberately open ("you decide the animation concept") — the direction below is the specific, single concept chosen, not a menu of options, because a launch moment only works if it's one confident idea executed precisely, not a collage of effects.

**The idea:** the app opens on a clean black field. A single, thin band of light sweeps once across the screen — not a spinner, not a bounce, a *sweep*, like a beam catching an edge of brushed metal. As it passes, it doesn't reveal the wordmark by fading it in — it **constructs** it: the "LEANR" mark appears to be *cut into visibility* by the light itself, left to right, sharp and deliberate. The sweep resolves into a soft, contained glow settled directly behind the now-fully-formed wordmark — the exact yellow glow (`shadow-glow` / `glow.yellow`, PRD §4.1/4.3) already established as this brand's visual signature, here given its biggest, most deliberate moment. The "By Fitelo" sub-lockup rises in quietly beneath, a half-beat later, small and confident, never competing with the hero mark. A brief hold. Then the whole lockup lifts very slightly (a ~4% scale, not a bounce) and dissolves as the already-loaded destination screen is revealed beneath it.

**Why this concept and not the alternatives considered:**
- *Particle/light effects* were rejected wholesale except as the single sweep band — particle bursts read as gamified, which the brief explicitly rules out.
- *Letter-by-letter reveal* (each character animating independently) was rejected in favor of one continuous clip-reveal — LEANR's wordmark is a single bold-italic unit in the existing brand (§4.2); breaking it into independent letters would fight the brand's own typographic identity.
- *Shape morphing* was rejected — there is no secondary shape/icon in the current lockup to morph from, and inventing one would contradict "same brand, same logo."
- A **light sweep constructing a static, already-correct wordmark** was chosen because it uses only what the brand already has (the exact `image.png` lockup, the exact yellow glow already in the design system) and reads as engineered/precise rather than playful — the "Premium → Trust → Technology → Performance → Simplicity" brief, in order: the sweep *is* precision and technology; the glow settle *is* the brand's established trust signal; the restraint (one light, one mark, one hold, one exit) *is* simplicity.

### 18.2 Sequence & timing — first install (~2.0s total)

| Time | Beat |
|---|---|
| 0ms | Black field, identical to the native static splash already on screen — no visible handoff |
| 150ms | Light sweep begins traveling left → right (500ms, ease-out cubic) |
| 350ms | Wordmark begins its clip-reveal in the sweep's wake (550ms, ease-out cubic), opacity resolving in parallel |
| 900ms | Signature glow blooms behind the completed wordmark (250ms in, settles to a steady 55% over 400ms) |
| 1100ms | "By Fitelo" sub-lockup rises 6px and fades in (350ms) |
| 1750ms | Hold on the completed, glowing lockup |
| 1750–2070ms | Exit: lockup scales to 104%, fades out (320ms, ease-in cubic) over the already-rendered destination screen |

### 18.3 Repeat opens & reduced motion

Per the brief's explicit requirement, the full sequence is a **first-install-only** moment — every subsequent cold start plays a compressed ~650ms "welcome back" resolve (wordmark and sub-lockup simply settle into place, no sweep/construction beat, same glow and exit language) so the brand is always present without becoming a tax on daily use. If the OS "Reduce Motion" accessibility setting is on, the app uses an even shorter ~450ms instant cross-fade that is still fully on-brand (same lockup, same glow, no sweep) — degrading gracefully rather than either forcing motion on users who've opted out of it or dropping the brand moment entirely.

### 18.4 Technical implementation

Delivered as a working reference implementation (not just a spec) at `mobile-app-reference/launch-animation/`:
- `BrandLaunchAnimation.tsx` — the component itself, built on `react-native-reanimated` v3 (all animated values run on the UI thread for a genuine 60fps regardless of JS-thread load) and `expo-linear-gradient` for the sweep.
- `App.example.tsx` — shows the animation mounted as an overlay **above** the real navigation root, which mounts and begins its own bootstrap (session restore, journey-state fetch — original PRD §26) *in parallel*, not after. This is what satisfies "does not delay the app unnecessarily": the animation's fixed ~2s/~650ms/~450ms runtime is a ceiling the real app is racing against, not a gate in front of it.
- `README.md` — dependency list (deliberately minimal: no `MaskedView`, the reveal is done with a plain `overflow:hidden` width clip instead), native `app.json` splash config to prevent any pre-JS white flash, an honest note on Android's `shadowRadius` not blurring (with two concrete fixes: `expo-blur` or a pre-blurred glow asset), and the performance budget.
- Handles all device sizes/aspect ratios via `useWindowDimensions` (sweep travel distance is proportional to screen width, lockup is centered and safe-area-agnostic since it's simple centered content with no notch-adjacent elements) and works identically on iOS and Android from one shared component — no platform-forked implementation, avoiding the iOS/Android parity gap flagged for Trainwell in §2.

### 18.5 Where this sits in the broader launch flow

```
Cold start
  → native static splash (app.json, identical black+wordmark frame)
  → BrandLaunchAnimation takes over the instant its first frame is ready
    (native splash hidden with zero visible handoff)
  → sequence per §18.2/18.3, while real bootstrap runs in parallel
  → fade out onto the already-resolved destination:
      first-ever install → onboarding coach-match flow (§10)
      returning user, valid session → Home (§9.1)
      returning user, expired session → login
```

---

## Open Questions (carried forward / new)

1. **App icon asset** — no standalone icon-only mark exists yet (same gap flagged in original PRD §23/§32); recommend extracting the circular mark from `image.png`.
2. **Push notification infra** — original PRD §26 confirms zero push/SMS/email dispatch exists today; this is a hard prerequisite for §8/§11 and needs its own build task, not a UI task.
3. **Premium tier w/ priority coach response** (§13) — business/pricing decision, not a design decision; flagged, not resolved, here.
4. **Wordmark export asset for §18** — the launch animation needs a transparent-background PNG/SVG of just the "LEANR" wordmark (isolated from the full `image.png` lockup) at 3x resolution; needs to be produced/exported by design before the reference implementation can be dropped into a real build.
