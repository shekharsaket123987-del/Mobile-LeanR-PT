/**
 * TextField — the mobile equivalent of the web app's hand-styled inputs
 * (LEANR_PT_MOBILE_PRD.md §23: "No dedicated Input primitive... rounded-xl
 * border border-white/15 bg-white/5"). Dark charcoal fill, white input
 * text (kept white rather than the web's yellow-on-dark autofill trick —
 * that was a browser-autofill-specific fix, and white reads better for
 * longer typed content on a small screen), yellow focus border glow as
 * the brand signature. Optional leading icon + secure-entry toggle.
 */
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Brand, Motion, Radius } from '@/constants/theme';

type Props = TextInputProps & {
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string | null;
  isPassword?: boolean;
};

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { icon, error, isPassword, style, onFocus, onBlur, ...inputProps },
  ref
) {
  const [hidden, setHidden] = useState(Boolean(isPassword));
  const focusProgress = useSharedValue(0);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: focusProgress.value > 0.5 ? Brand.yellow : 'rgba(255,255,255,0.12)',
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.field, error && styles.fieldError, borderStyle]}>
        {icon && <Ionicons name={icon} size={18} color="rgba(255,255,255,0.45)" style={styles.icon} />}
        <TextInput
          ref={ref}
          placeholderTextColor="rgba(255,255,255,0.35)"
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
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color="rgba(255,255,255,0.45)" />
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
    backgroundColor: Brand.charcoal2,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  fieldError: { borderColor: Brand.alertRed },
  icon: { marginRight: -2 },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    paddingVertical: 14,
  },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: Brand.alertRed, marginLeft: 4 },
});
