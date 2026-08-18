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
 * - **Image attachments** upload to the `chat-attachments` bucket (public
 *   read, confirmed live) at path `${conversationId}/${filename}` — the
 *   bucket's own INSERT policy requires that exact first path segment to
 *   be a conversation the uploader participates in
 *   (`storage.foldername(name)[1]` compared against
 *   `client_id = my_client_id()`), confirmed via direct introspection on
 *   2026-08-18. Uploaded as an ArrayBuffer (`fetch(uri).arrayBuffer()`),
 *   the standard Expo+Supabase Storage pattern — React Native's `Blob`
 *   support is unreliable enough that Supabase's own docs recommend
 *   this over passing a `Blob`/`FormData` directly.
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

export async function sendMessage(
  conversationId: string,
  content: { body?: string | null; attachmentUrl?: string | null }
): Promise<Message> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_role: 'client',
      sender_profile_id: userData.user.id,
      body: content.body ?? null,
      attachment_url: content.attachmentUrl ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Message;
}

/**
 * Uploads an image to the `chat-attachments` bucket and returns its
 * public URL. Does not send a message — call `sendMessage` with the
 * result as `attachmentUrl` once this resolves.
 */
export async function uploadChatImage(conversationId: string, localUri: string, mimeType: string | undefined): Promise<string> {
  const arrayBuffer = await fetch(localUri).then((res) => res.arrayBuffer());
  const ext = mimeType?.split('/')[1] ?? 'jpg';
  const path = `${conversationId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(path, arrayBuffer, { contentType: mimeType ?? 'image/jpeg' });
  if (error) throw error;

  const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path);
  return data.publicUrl;
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
