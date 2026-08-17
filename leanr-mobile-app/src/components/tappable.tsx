/**
 * Accessible tappable primitives — LEANR_PT_NEXTGEN_APP_PRD.md §12:
 * "All touch targets ≥44×44pt", "Screen-reader labels on all icon-only
 * nav items". Introduced in the Phase 6 accessibility pass to replace a
 * codebase-wide pattern of bare `<Text onPress>` (which has a tap target
 * no bigger than the glyphs themselves and no accessibility role at all)
 * with two small, disciplined primitives — Design Principle #5:
 * consistent, not novel.
 */
import { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';

import { Brand } from '@/constants/theme';
import { styles as shared } from './screen-scaffold';

type TextLinkProps = PropsWithChildren<{
  onPress?: () => void;
  style?: StyleProp<TextStyle>;
  disabled?: boolean;
  /** Defaults to the visible text — set explicitly when children isn't a plain string (e.g. includes an arrow/emoji that shouldn't be read literally). */
  accessibilityLabel?: string;
}>;

/**
 * A small inline tappable label (cancel/join/sign-out links, etc.).
 * Keeps its existing visual size — the touch target is expanded via
 * hitSlop, not by growing the element, so this drops into existing
 * layouts without shifting anything.
 */
export function TextLink({ children, onPress, style, disabled, accessibilityLabel }: TextLinkProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [linkStyles.wrap, pressed && !disabled && linkStyles.pressed]}>
      <Text style={style}>{children}</Text>
    </Pressable>
  );
}

const linkStyles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.6 },
});

type CtaButtonProps = PropsWithChildren<{
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

/** The full-width brand-yellow primary action button, as a single tappable unit (not text-inside-a-view). */
export function CtaButton({ children, onPress, disabled, loading, style }: CtaButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      style={({ pressed }) => [
        shared.ctaButton,
        isDisabled && ctaStyles.disabled,
        pressed && !isDisabled && ctaStyles.pressed,
        style,
      ]}>
      {loading ? <ActivityIndicator color={Brand.black} /> : <Text style={shared.ctaButtonText}>{children}</Text>}
    </Pressable>
  );
}

const ctaStyles = StyleSheet.create({
  disabled: { opacity: 0.7 },
  pressed: { backgroundColor: Brand.yellow2 },
});
