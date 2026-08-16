/**
 * StreakChip — LEANR_PT_NEXTGEN_APP_PRD.md §4.1 (`streak.ember` token) /
 * §8 (session streak mechanic). Pulses gently on mount, per §4.3
 * ("streak flames pulse").
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { Brand } from '@/constants/theme';

export function StreakChip({ weeks }: { weeks: number }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (weeks <= 0) return;
    scale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 500, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 500, easing: Easing.in(Easing.quad) })
      ),
      2,
      false
    );
  }, [weeks, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (weeks <= 0) return null;

  return (
    <Animated.View style={[styles.chip, animatedStyle]}>
      <Text style={styles.emoji}>🔥</Text>
      <Text style={styles.text}>
        {weeks} week{weeks === 1 ? '' : 's'} streak
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: Brand.streakEmberStart + '22',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  emoji: { fontSize: 14 },
  text: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.streakEmberStart },
});
