/**
 * Status pills — LEANR_PT_MOBILE_PRD.md §23 "Terminology glossary (preserve
 * verbatim)": Upcoming, Completed, Cancelled, Missed, Active, Inactive,
 * Paused, Pending, Approved, Rejected, On Leave. `StatusBadge` maps each
 * exact label to a semantic color so call sites never hand-pick a color
 * (and never invent new label text) — mirrors the web app's
 * `SessionStatusBadge`/`Badge` variant set (yellow/green/red/gray).
 */
import { StyleSheet, Text, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';

type Tone = 'yellow' | 'green' | 'red' | 'gray' | 'outline';

const TONE_STYLE: Record<Tone, { bg: string; fg: string; border?: string }> = {
  yellow: { bg: 'rgba(245,217,10,0.16)', fg: Brand.yellow },
  green: { bg: 'rgba(16,185,129,0.16)', fg: Brand.successEmerald },
  red: { bg: 'rgba(239,68,68,0.14)', fg: Brand.alertRed },
  gray: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.65)' },
  outline: { bg: 'transparent', fg: Brand.yellow, border: 'rgba(245,217,10,0.35)' },
};

export function Badge({ label, tone = 'gray' }: { label: string; tone?: Tone }) {
  const t = TONE_STYLE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, t.border && { borderWidth: 1, borderColor: t.border }]}>
      <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  upcoming: 'yellow',
  completed: 'green',
  cancelled: 'red',
  missed: 'red',
  active: 'green',
  inactive: 'gray',
  paused: 'yellow',
  pending: 'gray',
  approved: 'green',
  rejected: 'red',
  'on-leave': 'gray',
  'on leave': 'gray',
};

/** Preserves the exact status string as the label; only the color is derived. */
export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status.toLowerCase()] ?? 'gray';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge label={label} tone={tone} />;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  text: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.2 },
});
