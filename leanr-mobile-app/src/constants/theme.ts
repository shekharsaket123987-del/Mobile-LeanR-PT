/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// LEANR by Fitelo brand tokens — source of truth: LEANR_PT_NEXTGEN_APP_PRD.md §4.
// Keep this object as the single place brand hex values live; never inline
// a brand hex in a component.
export const Brand = {
  black: '#000000',
  charcoal: '#111111',
  charcoal2: '#1A1A1A',
  yellow: '#F5E400',
  yellow2: '#FFE600',
  pageBackground: '#FAFAFA',
  card: '#FFFFFF',
  streakEmberStart: '#FF7A18',
  streakEmberEnd: '#F5E400',
  successEmerald: '#10B981',
  alertRed: '#EF4444',
  glowYellow: 'rgba(245, 228, 0, 0.35)',
} as const;

export const Colors = {
  light: {
    text: Brand.charcoal,
    background: Brand.pageBackground,
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    tint: Brand.yellow,
    tintText: Brand.black,
  },
  dark: {
    text: '#ffffff',
    background: Brand.black,
    backgroundElement: Brand.charcoal2,
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    tint: Brand.yellow,
    tintText: Brand.black,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
