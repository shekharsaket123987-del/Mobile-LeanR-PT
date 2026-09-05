/**
 * SectionHeader — small caps eyebrow + Anton bold-italic title, optional
 * trailing action link. Reused instead of ad-hoc `<Text>` styling per
 * screen (Design Principle #5: consistent, not novel).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, DisplayFont } from '@/constants/theme';

type Props = {
  eyebrow?: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ eyebrow, title, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.title}>{title}</Text>
      </View>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  textCol: { gap: 2, flexShrink: 1 },
  eyebrow: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11.5,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: DisplayFont,
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  action: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.yellow },
});
