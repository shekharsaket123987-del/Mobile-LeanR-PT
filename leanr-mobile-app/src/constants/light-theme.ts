/**
 * Light design tokens — pre-purchase client experience only (New PRD.md
 * §4.A / mobile-app-reference "WhatsApp Image 2026-09-05 at 8.33.20 PM"
 * mockup). Deliberately additive: `theme.ts`'s dark `Brand`/`Colors` stay
 * untouched (shared by coach/admin portals and the post-purchase client
 * screens) — see the plan's "dual-branch, not a global retheme" decision.
 * Mirrors `theme.ts`'s shape so the same component-authoring patterns
 * translate directly; only surface/color treatment differs (no
 * glass/blur — the mockup is flat white cards with soft shadows).
 *
 * Hex values are a close read of the mockup screenshot, not a pixel
 * sampler — treat as a coherent starting palette, not a certified match.
 */
export const LightBrand = {
  teal: '#12A594',
  tealDark: '#0E8578',
  tealSoft: 'rgba(18,165,148,0.12)',
  navy: '#0B2545',
  navySoft: 'rgba(11,37,69,0.6)',
  bg: '#F4F8FA',
  card: '#FFFFFF',
  border: '#E4ECEF',
  textPrimary: '#0B2545',
  textSecondary: '#5B7083',
  textMuted: '#8CA0AF',
  successEmerald: '#10B981',
  alertRed: '#EF4444',
  amber: '#F59E0B',
} as const;

export const LightRadius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

/** Flat cards, soft ambient shadow — no glow/glass, unlike Shadow.glow in theme.ts. */
export const LightShadow = {
  card: {
    shadowColor: '#0B2545',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  raised: {
    shadowColor: '#0B2545',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
} as const;
