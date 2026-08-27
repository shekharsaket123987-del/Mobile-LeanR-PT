/**
 * Encrypted session storage for the Supabase client.
 *
 * Why not plain expo-secure-store: SecureStore (Keychain/Keystore) caps
 * values at ~2KB, and a Supabase session (access + refresh token + user
 * object) routinely exceeds that. Why not plain AsyncStorage: the
 * functional PRD (LEANR_PT_MOBILE_PRD.md §26) requires session tokens to
 * live in Keychain/Keystore, not plain unencrypted storage.
 *
 * This is Supabase's own documented pattern for Expo: the session blob is
 * AES-encrypted and the (small) encryption key — not the session itself —
 * is what actually goes into SecureStore/Keychain/Keystore. AsyncStorage
 * only ever holds ciphertext.
 *
 * **Web branch**: `expo-secure-store` has no real web implementation —
 * its web module resolves to an empty object (`ExpoSecureStore.web.ts`
 * literally exports `{}`), so calling `SecureStore.setItemAsync` on web
 * throws `TypeError: ... is not a function`, confirmed by reading that
 * file directly, not assumed. There's also no browser-side Keychain/
 * Keystore equivalent to defer to anyway. So on web this falls back to
 * plain `AsyncStorage` (which itself is `localStorage`-backed on web) for
 * everything, skipping the SecureStore-wrapped-key layer entirely — the
 * PRD's Keychain/Keystore requirement is a native-platform mobile
 * requirement in the first place, not violated by web simply not having
 * the concept. This is what makes browser-based testing of the app
 * possible at all; native builds are unaffected (still the original
 * AES + SecureStore path).
 *
 * `typeof window === 'undefined'` guard on every method, both branches:
 * `web.output: "static"` (app.json) pre-renders routes on the server,
 * where `window` genuinely doesn't exist. `GoTrueClient`'s constructor
 * calls `_recoverAndRefresh()` immediately at module-load time — before
 * any component mounts — so without this guard the very first import of
 * `src/lib/supabase/client.ts` crashed the entire SSR pass with
 * `ReferenceError: window is not defined` (confirmed live, not
 * theoretical). Returning `null`/no-op during SSR is the *correct*
 * behavior, not a workaround: there is no browser session to read on the
 * server, and the real client-side hydration re-runs these once mounted
 * in the actual browser.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-get-random-values';

export class LargeSecureStore {
  private async encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));

    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;

    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));

    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string) {
    if (typeof window === 'undefined') return null;
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);

    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this.decrypt(key, encrypted);
  }

  async setItem(key: string, value: string) {
    if (typeof window === 'undefined') return;
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }

    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string) {
    if (typeof window === 'undefined') return;
    await AsyncStorage.removeItem(key);
    if (Platform.OS === 'web') return;
    await SecureStore.deleteItemAsync(key);
  }
}
