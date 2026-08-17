/**
 * CelebrationOverlay — LEANR_PT_NEXTGEN_APP_PRD.md §7 (Plans/Purchase
 * "celebration animation (confetti in brand yellow)") and §8 (milestone
 * celebrations: "Full-screen confetti moment"). Restrained by the same
 * brief that shaped the launch animation (§18): a brand-yellow particle
 * burst plus a headline, not a game-like effect — no external confetti
 * library, just a handful of Reanimated-driven dots so the "no
 * unnecessary dependencies" rule (§18.4) holds here too.
 */
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Brand } from '@/constants/theme';

const PARTICLE_COUNT = 14;
const AUTO_DISMISS_MS = 1900;

function Particle({ index, originX, originY }: { index: number; originX: number; originY: number }) {
  const progress = useSharedValue(0);
  const angle = (index / PARTICLE_COUNT) * Math.PI * 2 + (index % 2 === 0 ? 0.2 : -0.2);
  const distance = 90 + (index % 4) * 24;
  const color = index % 3 === 0 ? Brand.yellow : index % 3 === 1 ? Brand.yellow2 : Brand.streakEmberStart;

  useEffect(() => {
    progress.value = withDelay(index * 15, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [index, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(angle) * distance * progress.value },
      { translateY: Math.sin(angle) * distance * progress.value },
      { scale: 1 - progress.value * 0.4 },
    ],
  }));

  return (
    <Animated.View
      style={[styles.particle, { backgroundColor: color, left: originX - 5, top: originY - 5 }, style]}
    />
  );
}

type Props = {
  title: string;
  subtitle?: string;
  onDismiss: () => void;
};

export function CelebrationOverlay({ title, subtitle, onDismiss }: Props) {
  const { width, height } = useWindowDimensions();
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.92);
  const originX = width / 2;
  const originY = height / 2 - 60;
  const particles = useMemo(() => Array.from({ length: PARTICLE_COUNT }, (_, i) => i), []);

  useEffect(() => {
    cardOpacity.value = withTiming(1, { duration: 250 });
    cardScale.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.back(1.2)) });

    const timer = setTimeout(() => {
      cardOpacity.value = withTiming(0, { duration: 250 }, (done) => {
        if (done) runOnJS(onDismiss)();
      });
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  return (
    <Pressable
      style={styles.overlay}
      onPress={onDismiss}
      accessibilityRole="alert"
      accessibilityLabel={[title, subtitle].filter(Boolean).join('. ')}
      accessibilityHint="Double tap to dismiss">
      {particles.map((i) => (
        <Particle key={i} index={i} originX={originX} originY={originY} />
      ))}
      <Animated.View style={[styles.card, cardStyle]}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 998,
  },
  particle: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  card: { alignItems: 'center', gap: 6, paddingHorizontal: 32 },
  title: {
    fontFamily: 'Oswald_700Bold',
    fontStyle: 'italic',
    fontSize: 30,
    color: Brand.yellow,
    textAlign: 'center',
  },
  subtitle: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#FFFFFF', textAlign: 'center' },
});
