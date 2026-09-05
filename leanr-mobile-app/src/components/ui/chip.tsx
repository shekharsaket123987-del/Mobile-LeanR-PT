/**
 * Chip — selectable pill for date/time/day pickers (LEANR_PT_NEXTGEN_APP_PRD.md
 * §7: "large day/time chips (44pt+), animated confirmation"). Used across
 * the booking wizard, recurring schedule setup, and the anonymous demo
 * booking flow — one shared implementation instead of a per-screen copy.
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import { Brand, Radius, Shadow } from '@/constants/theme';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export function Chip({ label, selected, onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}>
      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: Radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipSelected: { backgroundColor: Brand.yellow, borderColor: Brand.yellow, ...Shadow.glow },
  chipDisabled: { opacity: 0.4 },
  label: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#FFFFFF' },
  labelSelected: { color: Brand.black },
});
