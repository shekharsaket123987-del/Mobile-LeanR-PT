/**
 * StarRating — 1-5 tappable stars, used wherever the PRD specifies a
 * "star 1-5" field (Rate Session, Demo Feedback, Coach-change rating).
 * No existing component for this anywhere in the codebase before now.
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/theme';

export function StarRating({ value, onChange, size = 28 }: { value: number; onChange: (value: number) => void; size?: number }) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => onChange(star)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
          accessibilityState={{ selected: star <= value }}>
          <Ionicons name={star <= value ? 'star' : 'star-outline'} size={size} color={Brand.yellow} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
});
