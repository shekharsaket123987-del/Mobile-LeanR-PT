/**
 * LEANR by Fitelo — Brand Launch Animation ("The Ignition Reveal")
 *
 * Reference implementation for the app-open animation specified in
 * LEANR_PT_NEXTGEN_APP_PRD.md §18. Drop into a React Native + Expo project
 * (Expo SDK 50+, react-native-reanimated v3) and wire up per
 * App.example.tsx in this same folder.
 *
 * Concept: a single thin light sweep travels across the screen once,
 * "cutting" the LEANR wordmark into visibility as it passes (a masked
 * width-reveal, not a fade), settles into a soft signature glow behind
 * the mark, then the "By Fitelo" sub-lockup rises in beneath it. On
 * repeat app opens the sweep/construction is skipped — the wordmark
 * simply resolves in place — so the brand is always shown, but only
 * earns its full ~2s moment once per install.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HAS_LAUNCHED_KEY = 'leanr.hasCompletedFirstLaunchAnimation';

// Brand tokens — mirrors LEANR_PT_NEXTGEN_APP_PRD.md §4.1. Keep this object
// as the single source of truth if/when a shared theme file is introduced.
const COLORS = {
  black: '#000000',
  yellow: '#F5E400',
  glow: 'rgba(245, 228, 0, 0.35)',
  white: '#FFFFFF',
};

const FULL_SEQUENCE_MS = {
  sweepStart: 150,
  sweepDuration: 500,
  revealStart: 350,
  revealDuration: 550,
  glowStart: 900,
  subLockupStart: 1100,
  holdUntil: 1750,
  exitDuration: 320,
};

const REPEAT_SEQUENCE_MS = {
  wordmarkFade: 220,
  subLockupDelay: 120,
  subLockupFade: 220,
  holdUntil: 450,
  exitDuration: 200,
};

type Props = {
  /** Called once the animation has fully finished and the overlay can unmount. */
  onFinish: () => void;
  /**
   * Respect the OS "reduce motion" accessibility setting. When true, skips
   * the sweep/construction choreography entirely in favor of an instant,
   * still-branded cross-fade — never a jarring cut, never disorienting motion.
   */
  reduceMotion?: boolean;
};

export default function BrandLaunchAnimation({ onFinish, reduceMotion = false }: Props) {
  const { width } = useWindowDimensions();
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const [wordmarkWidth, setWordmarkWidth] = useState(0);

  const sweepX = useSharedValue(-width * 0.6);
  const revealWidth = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const subLockupOpacity = useSharedValue(0);
  const subLockupTranslateY = useSharedValue(6);
  const containerOpacity = useSharedValue(1);
  const containerScale = useSharedValue(1);

  useEffect(() => {
    AsyncStorage.getItem(HAS_LAUNCHED_KEY)
      .then((seen) => setIsFirstLaunch(seen === null))
      .catch(() => setIsFirstLaunch(true));
  }, []);

  const finish = useCallback(() => {
    AsyncStorage.setItem(HAS_LAUNCHED_KEY, 'true').catch(() => {});
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    if (isFirstLaunch === null || wordmarkWidth === 0) return;

    // The native static splash (see app.json config in README) shows an
    // identical black background + centered wordmark. We only hide it once
    // this component has its first real measured frame ready, so the
    // handoff is invisible — no flash, no layout jump.
    SplashScreen.hideAsync().catch(() => {});

    const t = reduceMotion || !isFirstLaunch ? REPEAT_SEQUENCE_MS : null;

    if (reduceMotion) {
      // Reduced-motion path: no sweep, no construction — an instant,
      // still-fully-branded cross-fade. Premium apps degrade gracefully,
      // they don't just skip straight to a blank screen.
      revealWidth.value = wordmarkWidth;
      wordmarkOpacity.value = withTiming(1, { duration: 180 });
      subLockupOpacity.value = withDelay(80, withTiming(1, { duration: 180 }));
      subLockupTranslateY.value = 0;
      glowOpacity.value = withTiming(0.35, { duration: 220 });
      containerOpacity.value = withDelay(
        420,
        withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) }, (done) => {
          if (done) runOnJS(finish)();
        })
      );
      return;
    }

    if (isFirstLaunch) {
      // ---- Full "Ignition Reveal" — first install only (~2.0s) ----
      const m = FULL_SEQUENCE_MS;
      sweepX.value = withDelay(
        m.sweepStart,
        withTiming(width * 0.6, { duration: m.sweepDuration, easing: Easing.out(Easing.cubic) })
      );
      revealWidth.value = withDelay(
        m.revealStart,
        withTiming(wordmarkWidth, { duration: m.revealDuration, easing: Easing.out(Easing.cubic) })
      );
      wordmarkOpacity.value = withDelay(m.revealStart, withTiming(1, { duration: 400 }));
      glowOpacity.value = withDelay(
        m.glowStart,
        withSequence(
          withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) }),
          withTiming(0.55, { duration: 400, easing: Easing.inOut(Easing.quad) })
        )
      );
      subLockupOpacity.value = withDelay(m.subLockupStart, withTiming(1, { duration: 350 }));
      subLockupTranslateY.value = withDelay(
        m.subLockupStart,
        withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) })
      );
      containerOpacity.value = withDelay(
        m.holdUntil,
        withTiming(0, { duration: m.exitDuration, easing: Easing.in(Easing.cubic) }, (done) => {
          if (done) runOnJS(finish)();
        })
      );
      containerScale.value = withDelay(
        m.holdUntil,
        withTiming(1.045, { duration: m.exitDuration, easing: Easing.in(Easing.cubic) })
      );
    } else if (t) {
      // ---- Short "welcome back" resolve — every subsequent cold start (~650ms) ----
      revealWidth.value = wordmarkWidth;
      wordmarkOpacity.value = withTiming(1, { duration: t.wordmarkFade, easing: Easing.out(Easing.cubic) });
      subLockupOpacity.value = withDelay(t.subLockupDelay, withTiming(1, { duration: t.subLockupFade }));
      subLockupTranslateY.value = 0;
      glowOpacity.value = withTiming(0.4, { duration: 300 });
      containerOpacity.value = withDelay(
        t.holdUntil,
        withTiming(0, { duration: t.exitDuration, easing: Easing.in(Easing.cubic) }, (done) => {
          if (done) runOnJS(finish)();
        })
      );
      containerScale.value = withDelay(t.holdUntil, withTiming(1.02, { duration: t.exitDuration }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirstLaunch, wordmarkWidth, width, reduceMotion]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweepX.value }],
    opacity: !reduceMotion && isFirstLaunch ? 1 : 0,
  }));
  const revealStyle = useAnimatedStyle(() => ({ width: revealWidth.value }));
  const wordmarkOpacityStyle = useAnimatedStyle(() => ({ opacity: wordmarkOpacity.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));
  const subLockupStyle = useAnimatedStyle(() => ({
    opacity: subLockupOpacity.value,
    transform: [{ translateY: subLockupTranslateY.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      <Animated.View style={[styles.sweepWrap, sweepStyle]}>
        <LinearGradient
          colors={['transparent', COLORS.glow, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.sweepGradient}
        />
      </Animated.View>

      <View style={styles.lockup}>
        {/* Signature soft glow — same "shadow-glow" token as the rest of the
            app (PRD §4.3), just given more weight here as the hero moment. */}
        <Animated.View style={[styles.glow, glowStyle]} />

        {/* Wordmark revealed by animating an overflow-hidden clip width,
            not opacity — this is what makes it read as "constructed" by
            the light sweep rather than merely faded in. */}
        <Animated.View style={[styles.revealClip, revealStyle]}>
          <Animated.Image
            // Replace with the extracted wordmark asset (see README §Assets).
            source={require('../assets/leanr-wordmark.png')}
            style={[styles.wordmark, wordmarkOpacityStyle, { width: wordmarkWidth || 240 }]}
            resizeMode="contain"
            onLayout={(e) => {
              if (wordmarkWidth === 0) setWordmarkWidth(e.nativeEvent.layout.width);
            }}
          />
        </Animated.View>

        <Animated.Text style={[styles.subLockup, subLockupStyle]}>By Fitelo</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.black,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  sweepWrap: { position: 'absolute', top: 0, bottom: 0, width: 140 },
  sweepGradient: { flex: 1, width: 140 },
  lockup: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 260,
    height: 120,
    borderRadius: 130,
    backgroundColor: COLORS.yellow,
    shadowColor: COLORS.yellow,
    shadowOpacity: 0.6,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 0 },
    opacity: 0.35,
    // Android does not render shadowRadius as a blur. For a true glow on
    // Android, either layer an expo-blur BlurView here, or (recommended,
    // zero extra runtime cost) use a pre-blurred radial-gradient PNG asset
    // instead of a plain-color View. See README §Android glow note.
  },
  revealClip: { overflow: 'hidden' },
  wordmark: { height: 64 },
  subLockup: {
    marginTop: 10,
    color: COLORS.white,
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
