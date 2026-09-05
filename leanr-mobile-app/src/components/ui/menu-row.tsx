/**
 * MenuRow — icon + label + chevron list row used on the client/coach
 * "More" screens (LEANR_PT_NEXTGEN_APP_PRD.md §6 "More" destinations).
 * Wrap a group of rows in a single GlassCard for a settings-list look.
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  badge?: number;
  last?: boolean;
};

export function MenuRow({ label, icon, onPress, badge, last }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && onPress && styles.pressed]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={17} color="rgba(255,255,255,0.7)" />
      </View>
      <Text style={styles.label}>{label}</Text>
      {badge != null && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      {onPress && <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: 44 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  pressed: { opacity: 0.6 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: '#FFFFFF' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#FFFFFF' },
});
