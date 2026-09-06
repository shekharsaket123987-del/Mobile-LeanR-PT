/** LightStatCard — same API as ui/stat-card.tsx, light palette. */
import { StyleSheet, Text } from 'react-native';

import { LightCard } from './light-card';
import { LightBrand } from '@/constants/light-theme';
import { DisplayFont } from '@/constants/theme';

export function LightStatCard({
  value,
  label,
  emphasize,
  trailing,
}: {
  value: string;
  label: string;
  emphasize?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <LightCard variant={emphasize ? 'teal' : 'default'} style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {trailing}
    </LightCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'flex-start' },
  value: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 36, color: LightBrand.navy, letterSpacing: -0.5 },
  label: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.textSecondary },
});
