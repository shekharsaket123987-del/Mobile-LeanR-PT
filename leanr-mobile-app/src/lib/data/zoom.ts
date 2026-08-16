/**
 * Zoom join — LEANR_PT_MOBILE_PRD.md §7f (client join) and
 * LEANR_PT_NEXTGEN_APP_PRD.md §26 ("deep-link into the native Zoom app").
 *
 * There is no real Zoom integration to build here: meeting creation
 * happens server-side via Zoom's Server-to-Server OAuth (original PRD
 * §7f: `ensureZoomMeetingForBooking()`), which needs Zoom API credentials
 * this mobile repo doesn't have and shouldn't have. What IS safe and real
 * to build client-side is opening whatever join URL already exists on the
 * booking, gated by a join-window countdown — original PRD §15 mentions
 * this pattern ("Join in Nm" / "Live now" / "Session ended") without
 * giving exact minute thresholds, so this uses a reasonable default
 * (open 10 minutes before start, through the scheduled end).
 */
import * as Linking from 'expo-linking';
import type { Booking } from './types';

const JOIN_WINDOW_BEFORE_MIN = 10;

export type JoinState = 'too-early' | 'joinable' | 'ended' | 'no-link';

export function getJoinState(booking: Booking): JoinState {
  if (!booking.zoom_join_url) return 'no-link';

  const start = new Date(booking.scheduled_start).getTime();
  const end = start + booking.duration_minutes * 60_000;
  const opensAt = start - JOIN_WINDOW_BEFORE_MIN * 60_000;
  const now = Date.now();

  if (now < opensAt) return 'too-early';
  if (now > end) return 'ended';
  return 'joinable';
}

export async function openZoomLink(booking: Booking) {
  if (!booking.zoom_join_url) return;
  await Linking.openURL(booking.zoom_join_url);
}
