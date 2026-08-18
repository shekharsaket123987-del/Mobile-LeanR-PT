/**
 * Notifications — LEANR_PT_MOBILE_PRD.md §5 "Notifications" (both
 * portals), §20/§26 ("deep-link every push to the exact screen via
 * `notifications.related_entity_type/id`... mobile should actually
 * route on it"). Confirmed against the real, live data on 2026-08-19,
 * which contradicts that plan: **`related_entity_type`/`related_entity_id`
 * are null on every one of the 32 real notification rows sampled** —
 * the web app's `createFromTemplate()` never actually populates them in
 * practice, regardless of what the PRD's prose describes. Deep-linking
 * on those columns would route nowhere for every real notification that
 * exists today.
 *
 * What IS always populated is `template_key` (e.g.
 * `session_rescheduled_by_client`, `new_chat_message`,
 * `schedule_changed_client`) — several of the live keys don't even
 * match the PRD §20 catalog's exact names (`schedule_changed_coach`/
 * `_client` in real data vs. `admin_changed_schedule` in the prose), so
 * `routeCategoryForTemplateKey` below deliberately does substring
 * matching against a small set of route *categories* rather than an
 * exact 22-key lookup table — a rigid table would silently fail to
 * route any template key it hadn't seen before.
 */
import { supabase } from '@/lib/supabase/client';

export type NotificationType = 'booking' | 'reminder' | 'feedback' | 'system';

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  template_key: string | null;
  read: boolean;
  created_at: string;
};

export async function getMyNotifications(): Promise<NotificationRow[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, message, template_key, read, created_at')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userData.user.id)
    .eq('read', false);
  if (error) throw error;
}

export type NotificationRouteCategory = 'sessions' | 'chat' | 'concerns' | 'coach';

/** Best-effort routing by template_key substring — see file header for why. */
export function routeCategoryForTemplateKey(templateKey: string | null): NotificationRouteCategory | null {
  if (!templateKey) return null;
  const k = templateKey.toLowerCase();
  if (k.includes('chat')) return 'chat';
  if (k.includes('escalation') || k.includes('concern')) return 'concerns';
  if (k.includes('coach_change')) return 'coach';
  if (
    k.includes('session') ||
    k.includes('schedule') ||
    k.includes('booking') ||
    k.includes('attendance') ||
    k.includes('notes') ||
    k.includes('leave') ||
    k.includes('shadow')
  ) {
    return 'sessions';
  }
  return null;
}
