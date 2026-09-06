/**
 * Light-theme buttons — pre-purchase client screens only. Same API shape
 * as `components/ui/button.tsx` so screens read identically; only the
 * palette/surface differs (solid teal / outline navy, no yellow-glow).
 */
import { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { LightBrand, LightRadius } from '@/constants/light-theme';
import { Motion } from '@/constants/theme';

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

export function LightPrimaryButton(props: BaseProps) {
  return <ButtonBase {...props} variantStyle={styles.primary} textStyle={styles.primaryText} spinnerColor="#FFFFFF" />;
}

export function LightSecondaryButton(props: BaseProps) {
  return <ButtonBase {...props} variantStyle={styles.secondary} textStyle={styles.secondaryText} spinnerColor={LightBrand.teal} />;
}

export function LightGhostButton(props: BaseProps) {
  return <ButtonBase {...props} variantStyle={styles.ghost} textStyle={styles.ghostText} spinnerColor={LightBrand.teal} />;
}

export function LightDestructiveButton(props: BaseProps) {
  return <ButtonBase {...props} variantStyle={styles.destructive} textStyle={styles.destructiveText} spinnerColor={LightBrand.alertRed} />;
}

const styles = StyleSheet.create({
  base: { borderRadius: LightRadius.pill, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontFamily: 'Manrope_700Bold' },
  primary: { backgroundColor: LightBrand.teal },
  primaryText: { color: '#FFFFFF' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: LightBrand.teal },
  secondaryText: { color: LightBrand.teal },
  ghost: { backgroundColor: LightBrand.tealSoft },
  ghostText: { color: LightBrand.tealDark },
  destructive: { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  destructiveText: { color: LightBrand.alertRed },
  disabled: { opacity: 0.45 },
});
