/** LightTextField — same API as ui/text-field.tsx, light palette (white fill, teal focus border). */
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { LightBrand, LightRadius } from '@/constants/light-theme';
import { Motion } from '@/constants/theme';

type Props = TextInputProps & {
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string | null;
  isPassword?: boolean;
};

export const LightTextField = forwardRef<TextInput, Props>(function LightTextField(
  { icon, error, isPassword, style, onFocus, onBlur, ...inputProps },
  ref
) {
  const [hidden, setHidden] = useState(Boolean(isPassword));
  const focusProgress = useSharedValue(0);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: focusProgress.value > 0.5 ? LightBrand.teal : LightBrand.border,
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.field, error && styles.fieldError, borderStyle]}>
        {icon && <Ionicons name={icon} size={18} color={LightBrand.textMuted} style={styles.icon} />}
        <TextInput
          ref={ref}
          placeholderTextColor={LightBrand.textMuted}
          secureTextEntry={isPassword ? hidden : inputProps.secureTextEntry}
          style={[styles.input, style]}
          onFocus={(e) => {
            focusProgress.value = withTiming(1, { duration: Motion.fast });
            onFocus?.(e);
          }}
          onBlur={(e) => {
            focusProgress.value = withTiming(0, { duration: Motion.fast });
            onBlur?.(e);
          }}
          {...inputProps}
        />
        {isPassword && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={LightBrand.textMuted} />
          </Pressable>
        )}
      </Animated.View>
      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: LightRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  fieldError: { borderColor: LightBrand.alertRed },
  icon: { marginRight: -2 },
  input: { flex: 1, color: LightBrand.textPrimary, fontFamily: 'Manrope_500Medium', fontSize: 15, paddingVertical: 14 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.alertRed, marginLeft: 4 },
});
