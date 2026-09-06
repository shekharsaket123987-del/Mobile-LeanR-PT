/** LightTextLink — same API as components/tappable.tsx's TextLink, light-appropriate default color (teal, not yellow). */
import { PropsWithChildren } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle } from 'react-native';

import { LightBrand } from '@/constants/light-theme';

type Props = PropsWithChildren<{
  onPress?: () => void;
  style?: StyleProp<TextStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
}>;

export function LightTextLink({ children, onPress, style, disabled, accessibilityLabel }: Props) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [styles.wrap, pressed && !disabled && styles.pressed]}>
      <Text style={[styles.text, style]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.6 },
  text: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: LightBrand.teal },
});
