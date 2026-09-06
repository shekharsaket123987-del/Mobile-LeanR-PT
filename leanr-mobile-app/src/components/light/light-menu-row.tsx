/** LightMenuRow — same API as ui/menu-row.tsx, light palette. */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightBrand } from '@/constants/light-theme';

export function LightMenuRow({
  label,
  icon,
  onPress,
  badge,
  last,
  destructive,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  badge?: number | string;
  last?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.row, !last && styles.divider]}>
      <View style={[styles.iconWell, destructive && styles.iconWellDestructive]}>
        <Ionicons name={icon} size={16} color={destructive ? LightBrand.alertRed : LightBrand.teal} />
      </View>
      <Text style={[styles.label, destructive && styles.labelDestructive]}>{label}</Text>
      {badge != null && badge !== '' && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{String(badge)}</Text>
        </View>
      )}
      {!destructive && <Ionicons name="chevron-forward" size={16} color={LightBrand.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LightBrand.border },
  iconWell: { width: 32, height: 32, borderRadius: 10, backgroundColor: LightBrand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  iconWellDestructive: { backgroundColor: 'rgba(239,68,68,0.1)' },
  label: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 14.5, color: LightBrand.textPrimary },
  labelDestructive: { color: LightBrand.alertRed },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: LightBrand.alertRed, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#FFFFFF' },
});
