/**
 * Avatar — coach/client photo with initials fallback (Design Principle #3:
 * "the coach is a person, not a database field" — always show a real photo
 * or a warm initials mark, never a generic icon). Optional yellow ring for
 * emphasis (active coach, "you" in a thread).
 */
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';

type Props = {
  photoUrl?: string | null;
  name?: string | null;
  size?: number;
  ring?: boolean;
};

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

export function Avatar({ photoUrl, name, size = 44, ring }: Props) {
  const ringPad = ring ? 3 : 0;
  const outerSize = size + ringPad * 2;

  return (
    <View
      style={[
        styles.ringWrap,
        {
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          borderWidth: ring ? 2 : 0,
          borderColor: Brand.yellow,
        },
      ]}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          accessibilityLabel={name ? `${name}'s photo` : undefined}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
          accessible
          accessibilityLabel={name ? `${name}'s photo` : 'No photo'}>
          <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  placeholder: { backgroundColor: Brand.charcoal2, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: 'Manrope_700Bold', color: Brand.yellow },
});
