/**
 * Shared profile-photo picker/uploader — used by both (client)/profile.tsx
 * and (coach)/profile.tsx, which otherwise duplicate their field-editing
 * sections per-screen (Design Principle #5 tolerates that for trivial
 * text-field bindings, but not for real async logic like this). Same
 * permission/picker pattern as the chat image attachment flow
 * ((coach)/chat/[id].tsx) — mediaTypes: ['images'], quality 0.7, no
 * editing crop UI.
 */
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { uploadAvatarImage } from '@/lib/data/profile';

import { TextLink } from './tappable';
import { getErrorMessage } from '@/lib/data/errors';

type Props = {
  photoUrl: string | null;
  onUploaded: (url: string) => void;
};

export function AvatarEditor({ photoUrl, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Enable photo library access in Settings to change your profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setError(null);
    setUploading(true);
    try {
      const url = await uploadAvatarImage(asset.uri, asset.mimeType);
      onUploaded(url);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.avatarWrap}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.placeholder]}>
            {uploading ? <ActivityIndicator color={Brand.black} /> : <Text style={styles.placeholderText}>+</Text>}
          </View>
        )}
        {uploading && photoUrl && (
          <View style={styles.overlay}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}
      </View>
      <TextLink onPress={uploading ? undefined : onPress} disabled={uploading} style={styles.link}>
        {photoUrl ? 'Change photo' : 'Add a photo'}
      </TextLink>
      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, marginBottom: 4 },
  avatarWrap: { width: 88, height: 88, borderRadius: 44, overflow: 'hidden' },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  placeholder: { backgroundColor: Brand.yellow, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontFamily: 'Manrope_700Bold', fontSize: 28, color: Brand.black },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { color: Brand.yellow, fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: Brand.alertRed, textAlign: 'center' },
});
