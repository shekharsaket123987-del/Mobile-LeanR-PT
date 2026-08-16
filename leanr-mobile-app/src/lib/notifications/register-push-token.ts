/**
 * Push notification registration — LEANR_PT_NEXTGEN_APP_PRD.md §11.
 *
 * IMPORTANT — read before wiring this into anything user-facing:
 * this file only gets a device an Expo push token and stores it. It does
 * NOT send any notifications. Actually dispatching a push (session
 * reminders, streak-at-risk nudges, coach messages, etc.) requires
 * server-side code that isn't part of this mobile repo — the original
 * PRD confirms zero push/SMS/email dispatch exists anywhere today
 * (§26: "deliberate, documented Phase-1 boundary"), and this is exactly
 * the "single largest new backend requirement" it flags. That backend
 * piece (an Edge Function or server route calling Expo's push API when a
 * `notifications` row is created) is a separate, real task — not
 * something that can be faked from the client.
 *
 * The `push_tokens` table this writes to does not appear anywhere in the
 * functional PRD — it's new schema this feature needs. VERIFY it exists
 * (or create it) before relying on this write succeeding.
 *
 * Also note: since Expo SDK 53, remote push notifications require a
 * development build — they do NOT work in Expo Go. Local/foreground
 * permission requests still work in Expo Go for testing the UI prompt.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase/client';

export async function registerPushToken(): Promise<{ token: string | null; error: string | null }> {
  if (!Device.isDevice) {
    return { token: null, error: 'Push notifications require a physical device.' };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return { token: null, error: 'Notification permission was not granted.' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const token = tokenResponse.data;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userId) {
    // VERIFY: push_tokens is new schema, not documented anywhere in the
    // functional PRD. Confirm this table exists (columns: user_id,
    // expo_push_token, updated_at) before trusting this write.
    const { error: upsertError } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, expo_push_token: token, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (upsertError) {
      console.warn('[push] token retrieved but could not be stored (table likely missing):', upsertError.message);
    }
  }

  return { token, error: null };
}
