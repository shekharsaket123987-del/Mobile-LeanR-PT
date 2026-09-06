/**
 * Regression suite for summarizeConversations — the coach inbox's
 * last-message preview, unread count, category, and most-recent-activity
 * sort. Extracted from getMyConversations for unit testing without a
 * Supabase round-trip. New PRD.md §4.B.
 */
import { describe, expect, it } from '@jest/globals';

import { summarizeConversations } from '../coach-chat';

const conv = (id: string, clientName = 'Client', status = 'active') => ({ id, client_id: `client-${id}`, clientName, status });
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

/** Default: every conversation's client has an active subscription, so category derives to 'active'. */
const activeSubsFor = (...ids: string[]) => new Map(ids.map((id) => [`client-${id}`, ['active']]));

describe('summarizeConversations', () => {
  it('returns an empty-preview conversation when it has no messages yet', () => {
    const result = summarizeConversations([conv('a')], [], activeSubsFor('a'));
    expect(result).toEqual([
      {
        id: 'a',
        clientId: 'client-a',
        clientName: 'Client',
        lastMessage: null,
        lastMessageAt: null,
        unreadCount: 0,
        category: 'active',
        readOnly: false,
      },
    ]);
  });

  it('uses the text body as the preview when present', () => {
    const result = summarizeConversations([conv('a')], [msg('a', { body: 'Hey coach' })], activeSubsFor('a'));
    expect(result[0].lastMessage).toBe('Hey coach');
  });

  it('falls back to a photo indicator for an image-only message (no body)', () => {
    const result = summarizeConversations([conv('a')], [msg('a', { body: null, attachment_url: 'https://x/y.jpg' })], activeSubsFor('a'));
    expect(result[0].lastMessage).toBe('📷 Photo');
  });

  it('picks the FIRST message per conversation as "last" — caller must pass messages already sorted newest-first', () => {
    const messages = [msg('a', { body: 'newest', created_at: '2026-08-20T12:00:00.000Z' }), msg('a', { body: 'oldest', created_at: '2026-08-20T10:00:00.000Z' })];
    const result = summarizeConversations([conv('a')], messages, activeSubsFor('a'));
    expect(result[0].lastMessage).toBe('newest');
  });

  it('counts only unread client-sent messages toward unreadCount', () => {
    const messages = [
      msg('a', { sender_role: 'client', read_at: null }),
      msg('a', { sender_role: 'client', read_at: null, created_at: '2026-08-20T09:00:00.000Z' }),
      msg('a', { sender_role: 'client', read_at: '2026-08-20T11:00:00.000Z', created_at: '2026-08-20T08:00:00.000Z' }), // already read
      msg('a', { sender_role: 'coach', read_at: null, created_at: '2026-08-20T07:00:00.000Z' }), // coach's own message, never counts
    ];
    const result = summarizeConversations([conv('a')], messages, activeSubsFor('a'));
    expect(result[0].unreadCount).toBe(2);
  });

  it('sorts conversations by most recent message first', () => {
    const conversations = [conv('older'), conv('newer')];
    const messages = [msg('older', { created_at: '2026-08-19T10:00:00.000Z' }), msg('newer', { created_at: '2026-08-21T10:00:00.000Z' })];
    const result = summarizeConversations(conversations, messages, activeSubsFor('older', 'newer'));
    expect(result.map((c) => c.id)).toEqual(['newer', 'older']);
  });

  it('sorts conversations with no messages yet to the end', () => {
    const conversations = [conv('empty'), conv('active')];
    const messages = [msg('active', { created_at: '2026-08-20T10:00:00.000Z' })];
    const result = summarizeConversations(conversations, messages, activeSubsFor('empty', 'active'));
    expect(result.map((c) => c.id)).toEqual(['active', 'empty']);
  });

  describe('category derivation (New PRD.md §4.B, quoted)', () => {
    it('categorizes a closed conversation as "old" regardless of subscription status', () => {
      const result = summarizeConversations([conv('a', 'Client', 'closed')], [], activeSubsFor('a'));
      expect(result[0].category).toBe('old');
      expect(result[0].readOnly).toBe(true);
    });

    it('categorizes an open conversation whose client is paused as "pause"', () => {
      const result = summarizeConversations([conv('a')], [], new Map([['client-a', ['paused']]]));
      expect(result[0].category).toBe('pause');
    });

    it('categorizes an open conversation whose client is active/awaiting_activation as "active"', () => {
      const result = summarizeConversations([conv('a')], [], new Map([['client-a', ['awaiting_activation']]]));
      expect(result[0].category).toBe('active');
    });

    it('categorizes an open conversation with no active/paused subscription as "expired"', () => {
      const result = summarizeConversations([conv('a')], [], new Map([['client-a', ['inactive']]]));
      expect(result[0].category).toBe('expired');
    });
  });
});
