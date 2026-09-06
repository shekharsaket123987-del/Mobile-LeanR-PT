/** LightBadge / LightStatusBadge — same API as ui/badge.tsx, light palette. */
import { StyleSheet, Text, View } from 'react-native';

import { LightBrand, LightRadius } from '@/constants/light-theme';

type Tone = 'teal' | 'green' | 'red' | 'gray' | 'outline';

const TONE_STYLE: Record<Tone, { bg: string; fg: string; border?: string }> = {
  teal: { bg: LightBrand.tealSoft, fg: LightBrand.tealDark },
  green: { bg: 'rgba(16,185,129,0.12)', fg: LightBrand.successEmerald },
  red: { bg: 'rgba(239,68,68,0.1)', fg: LightBrand.alertRed },
  gray: { bg: 'rgba(11,37,69,0.06)', fg: LightBrand.textSecondary },
  outline: { bg: 'transparent', fg: LightBrand.teal, border: 'rgba(18,165,148,0.35)' },
};

export function LightBadge({ label, tone = 'gray' }: { label: string; tone?: Tone }) {
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
  upcoming: 'teal',
  completed: 'green',
  cancelled: 'red',
  missed: 'red',
  active: 'green',
  inactive: 'gray',
  paused: 'teal',
  pending: 'gray',
  approved: 'green',
  rejected: 'red',
};

export function LightStatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status.toLowerCase()] ?? 'gray';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <LightBadge label={label} tone={tone} />;
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: LightRadius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  text: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.2 },
});
