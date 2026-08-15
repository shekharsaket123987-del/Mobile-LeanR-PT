/**
 * LEANR by Fitelo — "The Ignition Reveal" launch animation.
 * Spec: LEANR_PT_NEXTGEN_APP_PRD.md §18. Reference build: mobile-app-reference/launch-animation/.
 *
 * Renders the wordmark as styled text (Oswald 700 + synthetic italic),
 * matching how the existing web app implements the brand — never an image
 * asset — which sidesteps the open question in the PRD about exporting an
 * isolated wordmark asset entirely.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Brand } from '@/constants/theme';

const HAS_LAUNCHED_KEY = 'leanr.hasCompletedFirstLaunchAnimation';
const WORDMARK_WIDTH = 210; // measured for Oswald 700 italic "LEANR" at fontSize 52

const FULL = {
  sweepStart: 150,
  sweepDuration: 500,
  revealStart: 350,
  revealDuration: 550,
  glowStart: 900,
  subLockupStart: 1100,
  holdUntil: 1750,
  exitDuration: 320,
};
const REPEAT = { fade: 220, subDelay: 120, subFade: 220, holdUntil: 450, exitDuration: 200 };
const REDUCED = { fade: 180, subDelay: 80, subFade: 180, holdUntil: 420, exitDuration: 180 };

type Props = { onFinish: () => void };

export function BrandLaunchAnimation({ onFinish }: Props) {
  const { width } = useWindowDimensions();
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const sweepX = useSharedValue(-width * 0.6);
  const revealWidth = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const subOpacity = useSharedValue(0);
  const subTranslateY = useSharedValue(6);
  const containerOpacity = useSharedValue(1);
  const containerScale = useSharedValue(1);

  useEffect(() => {
    AsyncStorage.getItem(HAS_LAUNCHED_KEY)
      .then((seen) => setIsFirstLaunch(seen === null))
      .catch(() => setIsFirstLaunch(true));
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  const finish = useCallback(() => {
    AsyncStorage.setItem(HAS_LAUNCHED_KEY, 'true').catch(() => {});
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    if (isFirstLaunch === null) return;

    // Native splash (app.json) shows an identical black field. Hide it the
    // instant this component is ready to paint its first real frame so the
    // handoff is invisible.
    SplashScreen.hideAsync().catch(() => {});

    if (reduceMotion) {
      revealWidth.value = WORDMARK_WIDTH;
      wordmarkOpacity.value = withTiming(1, { duration: REDUCED.fade });
      subOpacity.value = withDelay(REDUCED.subDelay, withTiming(1, { duration: REDUCED.subFade }));
      subTranslateY.value = 0;
      glowOpacity.value = withTiming(0.35, { duration: 220 });
      containerOpacity.value = withDelay(
        REDUCED.holdUntil,
        withTiming(0, { duration: REDUCED.exitDuration, easing: Easing.in(Easing.cubic) }, (d) => {
          if (d) runOnJS(finish)();
        })
      );
      return;
    }

    if (isFirstLaunch) {
      sweepX.value = withDelay(
        FULL.sweepStart,
        withTiming(width * 0.6, { duration: FULL.sweepDuration, easing: Easing.out(Easing.cubic) })
      );
      revealWidth.value = withDelay(
        FULL.revealStart,
        withTiming(WORDMARK_WIDTH, { duration: FULL.revealDuration, easing: Easing.out(Easing.cubic) })
      );
      wordmarkOpacity.value = withDelay(FULL.revealStart, withTiming(1, { duration: 400 }));
      glowOpacity.value = withDelay(
        FULL.glowStart,
        withSequence(
          withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) }),
          withTiming(0.55, { duration: 400, easing: Easing.inOut(Easing.quad) })
        )
      );
      subOpacity.value = withDelay(FULL.subLockupStart, withTiming(1, { duration: 350 }));
      subTranslateY.value = withDelay(
        FULL.subLockupStart,
        withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) })
      );
      containerOpacity.value = withDelay(
        FULL.holdUntil,
        withTiming(0, { duration: FULL.exitDuration, easing: Easing.in(Easing.cubic) }, (d) => {
          if (d) runOnJS(finish)();
        })
      );
      containerScale.value = withDelay(
        FULL.holdUntil,
        withTiming(1.045, { duration: FULL.exitDuration, easing: Easing.in(Easing.cubic) })
      );
    } else {
      revealWidth.value = WORDMARK_WIDTH;
      wordmarkOpacity.value = withTiming(1, { duration: REPEAT.fade, easing: Easing.out(Easing.cubic) });
      subOpacity.value = withDelay(REPEAT.subDelay, withTiming(1, { duration: REPEAT.subFade }));
      subTranslateY.value = 0;
      glowOpacity.value = withTiming(0.4, { duration: 300 });
      containerOpacity.value = withDelay(
        REPEAT.holdUntil,
        withTiming(0, { duration: REPEAT.exitDuration, easing: Easing.in(Easing.cubic) }, (d) => {
          if (d) runOnJS(finish)();
        })
      );
      containerScale.value = withDelay(REPEAT.holdUntil, withTiming(1.02, { duration: REPEAT.exitDuration }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirstLaunch, reduceMotion, width]);

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
  const subStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
    transform: [{ translateY: subTranslateY.value }],
  }));

  if (isFirstLaunch === null) return null;

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      <Animated.View style={[styles.sweepWrap, sweepStyle]}>
        <LinearGradient
          colors={['transparent', Brand.glowYellow, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.sweepGradient}
        />
      </Animated.View>

      <View style={styles.lockup}>
        <Animated.View style={[styles.glow, glowStyle]} />

        <Animated.View style={[styles.revealClip, revealStyle]}>
          <Animated.Text style={[styles.wordmark, wordmarkOpacityStyle]} numberOfLines={1}>
            LEANR
          </Animated.Text>
        </Animated.View>

        <Animated.Text style={[styles.subLockup, subStyle]}>By Fitelo</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Brand.black,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  sweepWrap: { position: 'absolute', top: 0, bottom: 0, width: 140 },
  sweepGradient: { flex: 1, width: 140 },
  lockup: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 260,
    height: 120,
    borderRadius: 130,
    backgroundColor: Brand.yellow,
    shadowColor: Brand.yellow,
    shadowOpacity: 0.6,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 0 },
    opacity: 0.35,
    // Android ignores shadowRadius blur — this reads as a soft flat glow
    // there rather than a true blur. See mobile-app-reference README for
    // the expo-blur / pre-blurred-asset upgrade path if pixel parity is
    // required later.
  },
  revealClip: { overflow: 'hidden', height: 64, justifyContent: 'center' },
  wordmark: {
    fontFamily: 'Oswald_700Bold',
    fontStyle: 'italic',
    fontSize: 52,
    lineHeight: 60,
    color: Brand.yellow,
    letterSpacing: -0.5,
    width: WORDMARK_WIDTH,
  },
  subLockup: {
    marginTop: 10,
    color: '#FFFFFF',
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
