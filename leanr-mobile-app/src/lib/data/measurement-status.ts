/**
 * Measurement-staleness gate — New PRD.md §6 "Booking eligibility": if the
 * client's last `progress_logs` entry is >=7 days old, or none exists at
 * all, every booking/demo-booking/session-join attempt is rejected. §28
 * calls this "the single most cross-cutting dependency" — checked at every
 * entry point (booking-wizard.ts::confirmHold, zoom.ts::openZoomLink), not
 * just behind one gate modal, exactly mirroring how the web app's Server
 * Actions each independently re-check it rather than trusting the UI.
 *
 * Note (flagged, not silently special-cased): this rule as literally
 * documented also applies to a client's very first demo booking, before
 * they've ever logged anything — which would make "never logged" always
 * block a brand-new prospect's first demo. The PRD states the rule with no
 * carve-out for that case, so it's reproduced as-is rather than inventing
 * an exemption; worth a product decision if that turns out to be a real
 * funnel problem.
 */
import { getMyClientProfileId } from '@/lib/data/identity';
import { supabase } from '@/lib/supabase/client';

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type MeasurementStatus = { stale: boolean; lastLoggedAt: string | null };

export async function getMeasurementStatus(): Promise<MeasurementStatus> {
  const clientId = await getMyClientProfileId();
  if (!clientId) return { stale: true, lastLoggedAt: null };

  const { data, error } = await supabase
    .from('progress_logs')
    .select('logged_at')
    .eq('client_id', clientId)
    .order('logged_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { stale: true, lastLoggedAt: null };

  const stale = Date.now() - new Date(data.logged_at).getTime() >= STALE_AFTER_MS;
  return { stale, lastLoggedAt: data.logged_at };
}

/** Same literal message the web app throws (New PRD.md §6) — thrown, not just returned, so callers can't accidentally proceed past it. */
export async function assertMeasurementsFresh(): Promise<void> {
  const status = await getMeasurementStatus();
  if (status.stale) {
    throw new Error('Please update your measurements before booking a session or joining.');
  }
}
