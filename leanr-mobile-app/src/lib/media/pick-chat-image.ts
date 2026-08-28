/**
 * Shared camera-or-library image picker for chat attachments — used by
 * both (client)/coach.tsx and (coach)/chat/[id].tsx, which otherwise
 * duplicated the same permission+picker logic. Previously
 * library-only (a documented first-pass cut in both files' headers);
 * this adds a real camera option via the same `expo-image-picker`
 * dependency already installed for the library path — no new
 * dependency, no native action-sheet library, just `Alert.alert`'s
 * multi-button form for the Camera/Library choice.
 */
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export type PickedImage = { uri: string; mimeType: string | undefined };

async function pickFromCamera(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Camera access needed', 'Enable camera access in Settings to take a photo.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: false });
  if (result.canceled || result.assets.length === 0) return null;
  return { uri: result.assets[0].uri, mimeType: result.assets[0].mimeType };
}

async function pickFromLibrary(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Photo access needed', 'Enable photo library access in Settings to send images.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: false });
  if (result.canceled || result.assets.length === 0) return null;
  return { uri: result.assets[0].uri, mimeType: result.assets[0].mimeType };
}

/** Prompts Camera vs Library, requests the matching permission, and resolves the picked image — or `null` on cancel/denial at any step. */
export function pickChatImage(): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    Alert.alert('Add a photo', undefined, [
      { text: 'Take Photo', onPress: () => void pickFromCamera().then(resolve) },
      { text: 'Choose from Library', onPress: () => void pickFromLibrary().then(resolve) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
