/**
 * Regression suite for the hand-rolled deep-link parsing that underpins
 * both password recovery (forgot-password/reset-password) and Google
 * OAuth sign-in — the trickiest, least-obviously-correct logic added in
 * that work, and exactly the kind of thing a future edit could silently
 * break. No URLSearchParams/Supabase mocking needed: these are pure
 * string -> data functions.
 */
import { describe, expect, it } from '@jest/globals';

import { parseAuthCallback, parseRecoveryLink } from '../auth-context';

describe('parseAuthCallback', () => {
  it('extracts access/refresh tokens from a hash-fragment (implicit flow) URL', () => {
    const url = 'leanrmobileapp://reset-password#access_token=abc123&refresh_token=def456&type=recovery';
    expect(parseAuthCallback(url)).toEqual({
      kind: 'tokens',
      accessToken: 'abc123',
      refreshToken: 'def456',
      type: 'recovery',
    });
  });

  it('extracts access/refresh tokens from query-string params too', () => {
    const url = 'leanrmobileapp://login?access_token=abc123&refresh_token=def456';
    expect(parseAuthCallback(url)).toEqual({
      kind: 'tokens',
      accessToken: 'abc123',
      refreshToken: 'def456',
      type: undefined,
    });
  });

  it('falls back to a PKCE-style ?code= when no token pair is present', () => {
    const url = 'leanrmobileapp://reset-password?code=some-pkce-code';
    expect(parseAuthCallback(url)).toEqual({ kind: 'code', code: 'some-pkce-code' });
  });

  it('prefers hash params over query params when both are present (real-world links can have both)', () => {
    const url = 'leanrmobileapp://login?code=stale#access_token=fresh-token&refresh_token=fresh-refresh';
    expect(parseAuthCallback(url)).toEqual({
      kind: 'tokens',
      accessToken: 'fresh-token',
      refreshToken: 'fresh-refresh',
      type: undefined,
    });
  });

  it('decodes URL-encoded token characters', () => {
    const url = 'leanrmobileapp://login#access_token=abc%2F123&refresh_token=def%3D456';
    const link = parseAuthCallback(url);
    expect(link).toMatchObject({ accessToken: 'abc/123', refreshToken: 'def=456' });
  });

  it('returns null for a URL with no recognizable auth params', () => {
    expect(parseAuthCallback('leanrmobileapp://login')).toBeNull();
    expect(parseAuthCallback('leanrmobileapp://login?foo=bar')).toBeNull();
  });

  it('does not throw on a malformed percent-encoded component', () => {
    // A lone `%` is invalid input to decodeURIComponent — must be skipped, not crash the whole parse.
    expect(() => parseAuthCallback('leanrmobileapp://login#access_token=abc%&refresh_token=def')).not.toThrow();
  });
});

describe('parseRecoveryLink', () => {
  it('accepts a token pair explicitly marked type=recovery', () => {
    const url = 'leanrmobileapp://reset-password#access_token=abc&refresh_token=def&type=recovery';
    expect(parseRecoveryLink(url)).toEqual({ kind: 'tokens', accessToken: 'abc', refreshToken: 'def', type: 'recovery' });
  });

  it('rejects a token pair that is NOT marked as recovery — e.g. an OAuth callback must never be mistaken for a password-recovery session', () => {
    const url = 'leanrmobileapp://login#access_token=abc&refresh_token=def';
    expect(parseRecoveryLink(url)).toBeNull();
  });

  it('rejects a token pair explicitly marked with some other type', () => {
    const url = 'leanrmobileapp://login#access_token=abc&refresh_token=def&type=signup';
    expect(parseRecoveryLink(url)).toBeNull();
  });

  it('accepts a PKCE code unconditionally (no reliable type marker exists for that flow)', () => {
    expect(parseRecoveryLink('leanrmobileapp://reset-password?code=abc')).toEqual({ kind: 'code', code: 'abc' });
  });

  it('returns null for a null/absent URL (e.g. cold start with no deep link)', () => {
    expect(parseRecoveryLink(null)).toBeNull();
  });

  it('returns null for an unrelated deep link (e.g. a push-notification tap)', () => {
    expect(parseRecoveryLink('leanrmobileapp://notifications')).toBeNull();
  });
});
