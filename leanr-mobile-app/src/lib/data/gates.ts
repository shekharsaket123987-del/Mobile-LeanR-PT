/**
 * Combined status for the three global client gate modals (New PRD.md
 * §4.A "Global Gate Modals"): Phone -> Measurement -> Sessions-Low,
 * priority-ordered and mutually exclusive — only the highest-priority
 * applicable one is ever shown at once.
 */
import { getMeasurementStatus } from '@/lib/data/measurement-status';
import { getSessionsUsedCount, getMySubscription } from '@/lib/data/subscription';

export const SESSIONS_LOW_THRESHOLD = 5;

export type ClientGateStatus = {
  measurementStale: boolean;
  sessionsRemaining: number | null;
  sessionsLow: boolean;
};

export async function getClientGateStatus(): Promise<ClientGateStatus> {
  const [measurement, subscription] = await Promise.all([getMeasurementStatus(), getMySubscription()]);

  let sessionsRemaining: number | null = null;
  if (subscription) {
    const used = await getSessionsUsedCount(subscription.id);
    sessionsRemaining = subscription.sessions_total - used;
  }

  return {
    measurementStale: measurement.stale,
    sessionsRemaining,
    sessionsLow: sessionsRemaining !== null && sessionsRemaining <= SESSIONS_LOW_THRESHOLD,
  };
}
