/**
 * Pill-shaped button family — LEANR_PT_MOBILE_PRD.md §23 ("buttons are
 * rounded-full in every variant"). Supersedes components/tappable.tsx's
 * `CtaButton` for any newly-redesigned screen; `CtaButton`/`TextLink`
 * stay in place until every call site migrates (see transformation plan).
 *
 * Every variant: 44pt+ min height, a short (120ms) press-scale
 * micro-interaction on the UI thread (Motion.fast), disabled/loading
 * states with accessibility state flags.
 */
import { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Brand, Motion, Radius } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Size = 'sm' | 'md' | 'lg';

const SIZE_HEIGHT: Record<Size, number> = { sm: 40, md: 48, lg: 56 };
const SIZE_FONT: Record<Size, number> = { sm: 13, md: 15, lg: 16 };
const SIZE_PAD_X: Record<Size, number> = { sm: 16, md: 22, lg: 28 };

type BaseProps = PropsWithChildren<{
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  size?: Size;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Icon or other element rendered before the label. */
  leading?: React.ReactNode;
}>;

function usePressScale(disabled?: boolean) {
  const scale = useSharedValue(1);
  const onPressIn = () => {
    if (!disabled) scale.value = withTiming(0.97, { duration: Motion.fast });
  };
  const onPressOut = () => {
    scale.value = withTiming(1, { duration: Motion.fast });
  };
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return { onPressIn, onPressOut, animatedStyle };
}

function ButtonBase({
  children,
  onPress,
  disabled,
  loading,
  size = 'md',
  style,
  accessibilityLabel,
  leading,
  variantStyle,
  textStyle,
  spinnerColor,
}: BaseProps & { variantStyle: ViewStyle; textStyle: TextStyle; spinnerColor: string }) {
  const isDisabled = disabled || loading;
  const { onPressIn, onPressOut, animatedStyle } = usePressScale(isDisabled);

  return (
    <AnimatedPressable
      onPress={isDisabled ? undefined : onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      hitSlop={4}
      style={[
        styles.base,
        { height: SIZE_HEIGHT[size], paddingHorizontal: SIZE_PAD_X[size] },
        variantStyle,
        isDisabled && styles.disabled,
        animatedStyle,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <View style={styles.row}>
          {leading}
          <Text style={[styles.text, { fontSize: SIZE_FONT[size] }, textStyle]} numberOfLines={1}>
            {children}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

export function PrimaryButton(props: BaseProps) {
  return (
    <ButtonBase
      {...props}
      variantStyle={styles.primary}
      textStyle={styles.primaryText}
      spinnerColor={Brand.black}
    />
  );
}

export function SecondaryButton(props: BaseProps) {
  return (
    <ButtonBase
      {...props}
      variantStyle={styles.secondary}
      textStyle={styles.secondaryText}
      spinnerColor="#FFFFFF"
    />
  );
}

export function GhostButton(props: BaseProps) {
  return (
    <ButtonBase {...props} variantStyle={styles.ghost} textStyle={styles.ghostText} spinnerColor={Brand.yellow} />
  );
}

/** Destructive action (sign out, cancel, delete) — red-tinted, same pill/press/loading treatment as the other variants. */
export function DestructiveButton(props: BaseProps) {
  return (
    <ButtonBase
      {...props}
      variantStyle={styles.destructive}
      textStyle={styles.destructiveText}
      spinnerColor={Brand.alertRed}
    />
  );
}

type IconButtonProps = {
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  size?: number;
  variant?: 'glass' | 'solid';
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/** Circular icon-only tap target — always ≥44pt via hitSlop even when `size` is visually smaller. */
export function IconButton({
  onPress,
  disabled,
  accessibilityLabel,
  size = 40,
  variant = 'glass',
  style,
  children,
}: IconButtonProps) {
  const { onPressIn, onPressOut, animatedStyle } = usePressScale(disabled);
  const hitSlop = Math.max(0, (44 - size) / 2);

  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={hitSlop}
      style={[
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2 },
        variant === 'solid' ? styles.iconButtonSolid : styles.iconButtonGlass,
        disabled && styles.disabled,
        animatedStyle,
        style,
      ]}>
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontFamily: 'Manrope_700Bold' },
  primary: { backgroundColor: Brand.yellow },
  primaryText: { color: Brand.black },
  secondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' },
  secondaryText: { color: '#FFFFFF' },
  ghost: { backgroundColor: 'rgba(245,217,10,0.1)' },
  ghostText: { color: Brand.yellow },
  destructive: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  destructiveText: { color: Brand.alertRed },
  disabled: { opacity: 0.45 },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  iconButtonGlass: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  iconButtonSolid: { backgroundColor: Brand.charcoal2 },
});
