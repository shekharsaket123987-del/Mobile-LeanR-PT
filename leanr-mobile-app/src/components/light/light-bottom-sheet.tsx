/**
 * LightBottomSheet — light-themed counterpart to `ui/bottom-sheet.tsx`
 * (same slide-up + backdrop-fade + drag-to-dismiss mechanics), styled to
 * match the flat white-card light design system instead of the dark
 * glass one. Used by the client/coach/admin tab bars so "More" opens as
 * an overlay sheet on top of the current tab instead of navigating away
 * to a separate full-page screen.
 */
import { PropsWithChildren, useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Motion } from '@/constants/theme';
import { LightBrand, LightRadius, LightShadow } from '@/constants/light-theme';

type Props = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}>;

export function LightBottomSheet({ visible, onClose, title, subtitle, children }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(height);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, {
        duration: Motion.slow,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: Motion.base });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const close = () => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value, mutated from a worklet-adjacent handler
    translateY.value = withTiming(height, {
      duration: Motion.base,
      easing: Easing.in(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/immutability
    backdropOpacity.value = withTiming(0, { duration: Motion.base }, (done) => {
      if (done) runOnJS(onClose)();
    });
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 800) {
        runOnJS(close)();
      } else {
        // eslint-disable-next-line react-hooks/immutability
        translateY.value = withTiming(0, { duration: Motion.fast });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheetWrap, { paddingBottom: insets.bottom + 16 }, sheetStyle]}>
            <View style={[styles.panel, { maxHeight: height * 0.82 }, LightShadow.raised]}>
              <View style={styles.grabber} />
              {title && (
                <View style={styles.header}>
                  <View>
                    <Text style={styles.title}>{title}</Text>
                    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                  </View>
                  <Pressable onPress={close} accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} style={styles.closeButton}>
                    <Ionicons name="close" size={18} color={LightBrand.textSecondary} />
                  </Pressable>
                </View>
              )}
              <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(11,37,69,0.5)' },
  sheetWrap: { paddingHorizontal: 12 },
  panel: {
    borderRadius: LightRadius.lg,
    paddingTop: 10,
    paddingHorizontal: 16,
    backgroundColor: LightBrand.card,
  },
  scrollArea: { flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: LightBrand.border,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LightBrand.border,
    marginBottom: 4,
  },
  title: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
    color: LightBrand.textPrimary,
  },
  subtitle: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 12.5,
    color: LightBrand.textMuted,
    marginTop: 2,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: LightBrand.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
