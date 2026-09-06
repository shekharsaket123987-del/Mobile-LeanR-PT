/**
 * Phone OTP client — thin wrapper around the `phone-otp` edge function
 * (MSG91). Used by both signup's phone-verification step and the global
 * PhoneGateModal (New PRD.md §10/§16.A). Saving the verified number to
 * `profiles.phone` is the caller's job via `updateMyProfile` (profile.ts)
 * — this file only talks to MSG91, never the database (see the edge
 * function's own header for why).
 */
import { extractFunctionErrorMessage } from '@/lib/data/edge-functions';
import { supabase } from '@/lib/supabase/client';

/** Same validation the web app uses (New PRD.md §16.A): 10-15 digits, optional leading `+`, after stripping spaces/hyphens/parens. */
export function isValidMobile(raw: string): boolean {
  return /^\+?[0-9]{10,15}$/.test(raw.replace(/[\s\-()]/g, ''));
}

export async function sendPhoneOtp(mobile: string): Promise<void> {
  const { error } = await supabase.functions.invoke('phone-otp', { body: { action: 'send', mobile } });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Could not send the verification code.'));
}

export async function verifyPhoneOtp(mobile: string, otp: string): Promise<void> {
  const { error } = await supabase.functions.invoke('phone-otp', { body: { action: 'verify', mobile, otp } });
  if (error) throw new Error(await extractFunctionErrorMessage(error, "That code didn't match — check it and try again."));
}
