/**
 * Zoom join — LEANR_PT_MOBILE_PRD.md §7f (client join) and
 * LEANR_PT_NEXTGEN_APP_PRD.md §26 ("deep-link into the native Zoom app").
 *
 * Meeting creation now happens via the `zoom-meeting` Edge Function
 * deployed on 2026-08-19 (Zoom's Server-to-Server OAuth credentials live
 * there, never in this mobile repo — see that function's source for
 * exactly what it does and the secrets it needs before it actually
 * works). §13 rule 20: meetings are "lazily created... only when someone
 * needs to join" — so `getJoinState` no longer treats a missing
 * `zoom_join_url` as a dead end; the join window is purely time-based,
 * and `openZoomLink` creates the meeting on first tap if one doesn't
 * exist yet.
 *
 * Join-window thresholds: original PRD §15 mentions "Join in Nm"/"Live
 * now"/"Session ended" without exact minute values, so this keeps the
 * same reasonable default as before (open 10 minutes before start,
 * through the scheduled end).
 */
import * as Linking from 'expo-linking';

import { extractFunctionErrorMessage } from '@/lib/data/edge-functions';
import { assertMeasurementsFresh } from '@/lib/data/measurement-status';
import { supabase } from '@/lib/supabase/client';
import type { Booking } from './types';

const JOIN_WINDOW_BEFORE_MIN = 10;

export type JoinState = 'too-early' | 'joinable' | 'ended';

export function getJoinState(booking: Booking): JoinState {
  const start = new Date(booking.scheduled_start).getTime();
  const end = start + booking.duration_minutes * 60_000;
  const opensAt = start - JOIN_WINDOW_BEFORE_MIN * 60_000;
  const now = Date.now();

  if (now < opensAt) return 'too-early';
  if (now > end) return 'ended';
  return 'joinable';
}

/** Creates the Zoom meeting on first call for this booking; a no-op re-fetch (returns the existing link) after that. */
export async function ensureZoomMeeting(bookingId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('zoom-meeting', { body: { bookingId } });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Could not start the meeting.'));
  if (!data?.joinUrl) throw new Error('No join link was returned.');
  return data.joinUrl as string;
}

export async function openZoomLink(booking: Booking): Promise<void> {
  await assertMeasurementsFresh(); // New PRD.md §6 — join is one of the three gated entry points
  const joinUrl = booking.zoom_join_url ?? (await ensureZoomMeeting(booking.id));
  await Linking.openURL(joinUrl);
}
