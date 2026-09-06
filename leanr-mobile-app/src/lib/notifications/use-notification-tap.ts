/**
 * Tap-to-open routing for received push notifications — LEANR_PT_MOBILE_PRD.md
 * §26 ("mobile should actually route on" a notification tap). Navigates to
 * the Notifications screen on tap; that screen (per-role, both built)
 * already does the real category-based routing via
 * `routeCategoryForTemplateKey` (src/lib/data/notifications.ts) once the
 * user is looking at the list — this hook just gets them there from a
 * cold/backgrounded tap.
 *
 * Coach's Notifications screen lives at `/coach-notifications`, not
 * `/notifications` — see `(coach)/_layout.tsx` for why that file is
 * coach-specifically named. Branching on role here (rather than always
 * pushing `/notifications`) is what actually lands a coach on their own
 * screen instead of bouncing through the client layout's role redirect.
 * (admin) has no Notifications screen in this build's reduced scope, so an
 * admin tapping a push still has nowhere role-specific to land — a known
 * gap, not a crash (expo-router shows its "unmatched route" screen).
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth/auth-context';

export function useNotificationTapRouting() {
  const { profile } = useAuth();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      router.push(profile?.role === 'coach' ? '/coach-notifications' : '/notifications');
    });
    return () => subscription.remove();
  }, [profile?.role]);
}
