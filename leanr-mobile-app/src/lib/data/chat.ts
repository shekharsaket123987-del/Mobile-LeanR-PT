/**
 * Client<->coach chat — LEANR_PT_MOBILE_PRD.md §20 "Chat system detail",
 * §10 "My Chats". Confirmed against the real schema/RLS via direct
 * introspection of the "LeanR PT" Supabase project on 2026-08-18:
 *
 * - No RPC layer here — plain table reads/writes, RLS does all the work.
 *   `messages_insert_participant` requires `sender_profile_id = auth.uid()`
 *   AND the conversation to be `status='active'` AND (for a client sender)
 *   `conversations.client_id = my_client_id()`.
 * - `messages_mark_read` (UPDATE) lets a client flip `read_at` only on
 *   the COACH's messages in their own conversation — a client can never
 *   mark their own sent messages read, which matches WhatsApp-style
 *   receipts (§20).
 * - **Conversations are never created by this app.** There is no INSERT
 *   policy for client/coach on `conversations` (only `conversations_admin_all`)
 *   and no DB trigger auto-creates one — confirmed live data shows some
 *   clients have an active conversation and some don't, so creation is an
 *   admin-side action outside this app's scope, matching §10's "My Chats
 *   surfaces only if a chat has ever existed."
 * - Image attachments are NOT built here — `chat-attachments` storage
 *   bucket + its upload RLS are confirmed to exist, but wiring a picker
 *   is a distinct, undone slice (see README open items).
 */
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';
import type { Conversation, Message } from './types';

export async function getMyActiveConversation(): Promise<Conversation | null> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return null;

  const { data, error } = await supabase
    .from('conversations')
    .select('id, client_id, coach_id, status')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data as Conversation | null;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(conversationId: string, body: string): Promise<Message> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_role: 'client',
      sender_profile_id: userData.user.id,
      body,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Message;
}

/** Marks every unread COACH message in this conversation as read (client viewing the thread). */
export async function markCoachMessagesRead(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('sender_role', 'coach')
    .is('read_at', null);
  if (error) throw error;
}

/** Realtime delivery (§20) — new messages and read-receipt updates in this conversation. */
export function subscribeToConversation(
  conversationId: string,
  onChange: (message: Message, event: 'INSERT' | 'UPDATE') => void
): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onChange(payload.new as Message, 'INSERT')
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onChange(payload.new as Message, 'UPDATE')
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
