/**
 * Test-only stand-in for `@/lib/supabase/client`, wired up via the
 * `moduleNameMapper` entry in package.json's jest config.
 *
 * The real client's `createClient()` call constructs a `GoTrueClient`
 * that immediately tries to read a persisted session from
 * `LargeSecureStore` -> `expo-secure-store`'s native module — which
 * doesn't exist in the Jest/Node test environment and crashes the whole
 * worker process (not a catchable test failure) the instant any module
 * that imports the real client is loaded, even for tests that only care
 * about a pure helper function elsewhere in that same file. Every unit
 * test in this project should resolve `@/lib/supabase/client` to this
 * mock instead, whether or not that particular test touches Supabase.
 *
 * Individual tests that need specific query/auth behavior should
 * override these jest.fn()s per-test (e.g. `(supabase.auth.getUser as
 * jest.Mock).mockResolvedValueOnce(...)`), not edit this file.
 */
import { jest } from '@jest/globals';

export const supabase = {
  auth: {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    getUser: jest.fn(async () => ({ data: { user: null }, error: null })),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    signInWithPassword: jest.fn(async () => ({ data: {}, error: null })),
    signUp: jest.fn(async () => ({ data: {}, error: null })),
    signInWithOtp: jest.fn(async () => ({ data: {}, error: null })),
    verifyOtp: jest.fn(async () => ({ data: {}, error: null })),
    signInWithOAuth: jest.fn(async () => ({ data: { url: null }, error: null })),
    setSession: jest.fn(async () => ({ data: {}, error: null })),
    exchangeCodeForSession: jest.fn(async () => ({ data: {}, error: null })),
    resetPasswordForEmail: jest.fn(async () => ({ data: {}, error: null })),
    updateUser: jest.fn(async () => ({ data: {}, error: null })),
    signOut: jest.fn(async () => ({ error: null })),
  },
  from: jest.fn(),
  rpc: jest.fn(),
};
