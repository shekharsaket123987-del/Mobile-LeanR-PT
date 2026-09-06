/**
 * getErrorMessage — the `err instanceof Error ? err.message : String(err)`
 * idiom used everywhere in this app's catch blocks renders "[object
 * Object]" for Supabase/Postgrest errors, which are plain `{message,
 * details, hint, code}` objects, not `Error` instances — confirmed live
 * via the web preview (a real "[object Object]" shown to the user on a
 * failed `setUpRecurringSchedule` call). This checks for a string
 * `.message` property before falling back to `String(err)`.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}
