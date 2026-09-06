/**
 * LightAvatar — same API as ui/avatar.tsx, light placeholder colors (no
 * photo assets exist in the repo yet — see the plan's stated limitation —
 * so the initials fallback is what most pre-purchase screens will show
 * for a coach/client photo until real photography is provided).
 */
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { LightBrand } from '@/constants/light-theme';

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

export function LightAvatar({
  photoUrl,
  name,
  size = 44,
  ring,
}: {
  photoUrl?: string | null;
  name?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const ringPad = ring ? 3 : 0;
  const outerSize = size + ringPad * 2;

  return (
    <View
      style={[
        styles.ringWrap,
        { width: outerSize, height: outerSize, borderRadius: outerSize / 2, borderWidth: ring ? 2 : 0, borderColor: LightBrand.teal },
      ]}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          accessibilityLabel={name ? `${name}'s photo` : undefined}
        />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]} accessible accessibilityLabel={name ? `${name}'s photo` : 'No photo'}>
          <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  placeholder: { backgroundColor: LightBrand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: 'Manrope_700Bold', color: LightBrand.tealDark },
});
