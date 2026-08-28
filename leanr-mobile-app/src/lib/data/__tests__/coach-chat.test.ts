/**
 * Regression suite for summarizeConversations — the coach inbox's
 * last-message preview, unread count, and most-recent-activity sort.
 * Extracted from getMyConversations for unit testing without a
 * Supabase round-trip. LEANR_PT_MOBILE_PRD.md §20.
 */
import { describe, expect, it } from '@jest/globals';

import { summarizeConversations } from '../coach-chat';

const conv = (id: string, clientName = 'Client') => ({ id, client_id: `client-${id}`, clientName });
const msg = (
  conversationId: string,
  overrides: Partial<{ body: string | null; attachment_url: string | null; created_at: string; sender_role: string; read_at: string | null }> = {}
) => ({
  conversation_id: conversationId,
  body: null,
  attachment_url: null,
  created_at: '2026-08-20T10:00:00.000Z',
  sender_role: 'client',
  read_at: null,
  ...overrides,
});

describe('summarizeConversations', () => {
  it('returns an empty-preview conversation when it has no messages yet', () => {
    const result = summarizeConversations([conv('a')], []);
    expect(result).toEqual([
      { id: 'a', clientId: 'client-a', clientName: 'Client', lastMessage: null, lastMessageAt: null, unreadCount: 0 },
    ]);
  });

  it('uses the text body as the preview when present', () => {
    const result = summarizeConversations([conv('a')], [msg('a', { body: 'Hey coach' })]);
    expect(result[0].lastMessage).toBe('Hey coach');
  });

  it('falls back to a photo indicator for an image-only message (no body)', () => {
    const result = summarizeConversations([conv('a')], [msg('a', { body: null, attachment_url: 'https://x/y.jpg' })]);
    expect(result[0].lastMessage).toBe('📷 Photo');
  });

  it('picks the FIRST message per conversation as "last" — caller must pass messages already sorted newest-first', () => {
    const messages = [msg('a', { body: 'newest', created_at: '2026-08-20T12:00:00.000Z' }), msg('a', { body: 'oldest', created_at: '2026-08-20T10:00:00.000Z' })];
    const result = summarizeConversations([conv('a')], messages);
    expect(result[0].lastMessage).toBe('newest');
  });

  it('counts only unread client-sent messages toward unreadCount', () => {
    const messages = [
      msg('a', { sender_role: 'client', read_at: null }),
      msg('a', { sender_role: 'client', read_at: null, created_at: '2026-08-20T09:00:00.000Z' }),
      msg('a', { sender_role: 'client', read_at: '2026-08-20T11:00:00.000Z', created_at: '2026-08-20T08:00:00.000Z' }), // already read
      msg('a', { sender_role: 'coach', read_at: null, created_at: '2026-08-20T07:00:00.000Z' }), // coach's own message, never counts
    ];
    const result = summarizeConversations([conv('a')], messages);
    expect(result[0].unreadCount).toBe(2);
  });

  it('sorts conversations by most recent message first', () => {
    const conversations = [conv('older'), conv('newer')];
    const messages = [msg('older', { created_at: '2026-08-19T10:00:00.000Z' }), msg('newer', { created_at: '2026-08-21T10:00:00.000Z' })];
    const result = summarizeConversations(conversations, messages);
    expect(result.map((c) => c.id)).toEqual(['newer', 'older']);
  });

  it('sorts conversations with no messages yet to the end', () => {
    const conversations = [conv('empty'), conv('active')];
    const messages = [msg('active', { created_at: '2026-08-20T10:00:00.000Z' })];
    const result = summarizeConversations(conversations, messages);
    expect(result.map((c) => c.id)).toEqual(['active', 'empty']);
  });
});
