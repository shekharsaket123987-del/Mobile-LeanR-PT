/**
 * Shared helper for reading a Supabase Edge Function's error body.
 * `supabase.functions.invoke()` puts the raw `Response` on
 * `FunctionsHttpError.context` rather than parsing it — every edge
 * function this app calls (razorpay, zoom-meeting) returns
 * `{ error: string }` on failure, so this is the one place that knows
 * how to unwrap it.
 *
 * Duck-types `context` instead of `instanceof Response`: React Native's
 * fetch polyfill can hand back a `Response` from a different module
 * instance than the global one this file sees, which makes `instanceof`
 * silently fail and fall through to a useless generic SDK message.
 */
import { FunctionsHttpError } from '@supabase/functions-js';

export async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = error instanceof FunctionsHttpError ? (error.context as { json?: () => Promise<unknown> } | undefined) : undefined;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (typeof (body as { error?: unknown })?.error === 'string') return (body as { error: string }).error;
    } catch {
      // fall through to the generic message below
    }
  }
  return error instanceof Error ? error.message : fallback;
}
