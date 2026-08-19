/**
 * Shared helper for reading a Supabase Edge Function's error body.
 * `supabase.functions.invoke()` puts the raw `Response` on
 * `FunctionsHttpError.context` rather than parsing it — every edge
 * function this app calls (razorpay, zoom-meeting) returns
 * `{ error: string }` on failure, so this is the one place that knows
 * how to unwrap it.
 */
import { FunctionsHttpError } from '@supabase/functions-js';

export async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // fall through to the generic message below
    }
  }
  return error instanceof Error ? error.message : fallback;
}
