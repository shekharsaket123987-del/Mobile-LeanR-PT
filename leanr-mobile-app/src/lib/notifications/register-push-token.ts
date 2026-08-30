/**
 * Push notification registration — LEANR_PT_NEXTGEN_APP_PRD.md §11.
 *
 * This file gets a device an Expo push token and stores it in
 * `push_tokens` (migration `push_tokens_and_send_trigger`, applied
 * 2026-08-19 — table + RLS confirmed live, no longer a VERIFY item).
 * Actual sending is a separate piece, now also real: a Postgres trigger
 * (`trigger_send_push_notification()`, same migration) fires
 * `pg_net.http_post` to the `send-push` Edge Function on every
 * `notifications` INSERT, which looks up this table and calls Expo's
 * push API. Confirmed end-to-end via a live test insert (safe — no
 * token was registered for the test user, so nothing was actually
 * pushed; the trigger→function→200-response chain was what got
 * verified). See `supabase/functions/send-push/index.ts` for the
 * sending side.
 *
 * Since Expo SDK 53, remote push notifications require a development
 * build — they do NOT work in Expo Go. Local/foreground permission
 * requests still work in Expo Go for testing the UI prompt.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase/client';

export async function registerPushToken(): Promise<{ token: string | null; error: string | null }> {
  try {
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
      const { error: upsertError } = await supabase
        .from('push_tokens')
        .upsert({ user_id: userId, expo_push_token: token, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (upsertError) {
        console.warn('[push] token retrieved but could not be stored:', upsertError.message);
      }
    }

    return { token, error: null };
  } catch (err) {
    // Push registration must never block the app — e.g. Android push requires Firebase
    // (FCM) to be configured, which this project doesn't have set up yet.
    console.warn('[push] registration failed:', err instanceof Error ? err.message : err);
    return { token: null, error: err instanceof Error ? err.message : 'Push registration failed.' };
  }
}
