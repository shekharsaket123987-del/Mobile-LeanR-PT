/** LightChip / LightChipGrid — same API as ui/chip.tsx + ui/chip-grid.tsx, light palette. */
import { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightBrand, LightRadius } from '@/constants/light-theme';

export function LightChip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
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

export function LightChipGrid({ children }: PropsWithChildren) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    borderRadius: LightRadius.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: LightBrand.border,
  },
  chipSelected: { backgroundColor: LightBrand.teal, borderColor: LightBrand.teal },
  chipDisabled: { opacity: 0.4 },
  label: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: LightBrand.textPrimary },
  labelSelected: { color: '#FFFFFF' },
});
