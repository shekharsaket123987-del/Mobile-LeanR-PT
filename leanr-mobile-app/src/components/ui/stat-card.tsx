/**
 * StatCard — the "big number" moment (LEANR_PT_NEXTGEN_APP_PRD.md §4.2:
 * "LEANR's most distinctive visual signature... used for every big-number
 * moment"). Anton bold-italic value, small Manrope label, optional
 * yellow-glow emphasis for the single most important stat on a screen.
 */
import { StyleSheet, Text, View } from 'react-native';

import { DisplayFont, Shadow } from '@/constants/theme';
import { GlassCard } from './glass-card';

type Props = {
  value: string;
  label: string;
  emphasize?: boolean;
  trailing?: React.ReactNode;
};

export function StatCard({ value, label, emphasize, trailing }: Props) {
  return (
    <GlassCard variant={emphasize ? 'yellow' : 'default'} style={emphasize ? Shadow.glow : undefined}>
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          <Text style={styles.label}>{label}</Text>
        </View>
        {trailing}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  col: { gap: 2, flexShrink: 1 },
  value: {
    fontFamily: DisplayFont,
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 36,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  label: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.55)' },
});
