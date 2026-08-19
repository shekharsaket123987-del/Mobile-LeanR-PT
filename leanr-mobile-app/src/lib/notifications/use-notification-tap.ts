/**
 * Tap-to-open routing for received push notifications — LEANR_PT_MOBILE_PRD.md
 * §26 ("mobile should actually route on" a notification tap). Navigates to
 * `/notifications` on tap; that screen (per-role, both built) already does
 * the real category-based routing via `routeCategoryForTemplateKey`
 * (src/lib/data/notifications.ts) once the user is looking at the list —
 * this hook just gets them there from a cold/backgrounded tap.
 *
 * Deliberately not more specific than that: the (client)/(coach) route
 * groups have different route maps for the same template-key categories
 * (e.g. "sessions" -> `/sessions` for a client, `/schedule` for a coach),
 * and this hook runs at the app root, before role is necessarily known —
 * duplicating the per-role map here isn't worth it when landing on
 * Notifications and letting the existing tap-through handle it works today.
 * (admin) has no Notifications screen in this build's reduced scope, so an
 * admin tapping a push currently has nowhere role-specific to land — a
 * known gap, not a crash (expo-router shows its "unmatched route" screen).
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

export function useNotificationTapRouting() {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/notifications');
    });
    return () => subscription.remove();
  }, []);
}
