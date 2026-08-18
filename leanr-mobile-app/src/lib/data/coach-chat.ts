/**
 * Coach-side chat — conversation list (a coach has many clients, unlike
 * the client's single-conversation Coach tab). Sending, reading, and
 * realtime delivery reuse chat.ts directly (`sendMessage`/
 * `markMessagesRead` take a `senderRole` exactly so this file doesn't
 * duplicate that insert/update logic) — see chat.ts header for the
 * confirmed RLS this all rests on.
 *
 * Confirmed against the real schema/RLS on 2026-08-19:
 * `conversations_select_participant` already covers `coach_id =
 * my_coach_id()`, so this is a plain `.eq('coach_id', coachId)` read,
 * same policy the client side uses. §20's inbox categorization
 * (`active | old | expired | pause`) is simplified to active-only here —
 * a reasonable first pass, not a schema gap.
 */
import { getMyCoachProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';

export type CoachConversation = {
  id: string;
  clientId: string;
  clientName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export async function getMyConversations(): Promise<CoachConversation[]> {
  const coachId = await getMyCoachProfileId();
  if (!coachId) return [];

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, client_id, client_profiles(profiles(full_name))')
    .eq('coach_id', coachId)
    .eq('status', 'active');
  if (error) throw error;
  if (!conversations || conversations.length === 0) return [];

  const ids = conversations.map((c) => c.id);
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('conversation_id, body, attachment_url, created_at, sender_role, read_at')
    .in('conversation_id', ids)
    .order('created_at', { ascending: false });
  if (messagesError) throw messagesError;

  const lastByConversation = new Map<string, { body: string | null; attachment_url: string | null; created_at: string }>();
  const unreadByConversation = new Map<string, number>();
  for (const m of messages ?? []) {
    if (!lastByConversation.has(m.conversation_id)) {
      lastByConversation.set(m.conversation_id, m);
    }
    if (m.sender_role === 'client' && !m.read_at) {
      unreadByConversation.set(m.conversation_id, (unreadByConversation.get(m.conversation_id) ?? 0) + 1);
    }
  }

  return conversations
    .map((c) => {
      const clientProfile = Array.isArray(c.client_profiles) ? c.client_profiles[0] : c.client_profiles;
      const profile = clientProfile
        ? Array.isArray(clientProfile.profiles)
          ? clientProfile.profiles[0]
          : clientProfile.profiles
        : null;
      const last = lastByConversation.get(c.id);
      return {
        id: c.id as string,
        clientId: c.client_id as string,
        clientName: profile?.full_name ?? 'Client',
        lastMessage: last?.body ?? (last?.attachment_url ? '📷 Photo' : null),
        lastMessageAt: last?.created_at ?? null,
        unreadCount: unreadByConversation.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => {
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });
}
