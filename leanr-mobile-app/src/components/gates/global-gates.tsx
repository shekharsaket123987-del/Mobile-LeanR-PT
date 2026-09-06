/**
 * Global gate orchestrator — New PRD.md §4.A: "3 stacked, mutually
 * exclusive, priority-ordered gate modals on top of every page: Phone ->
 * Measurements -> Sessions-Low." Mounted once in (client)/_layout.tsx,
 * outside the tab navigator, so it's visible regardless of which tab is
 * active. Dismissal state is plain component state (no AsyncStorage) —
 * "reappears every login" per the PRD means it comes back on the next
 * fresh mount of this component (app cold start / re-login), which is
 * exactly what un-persisted state gives for free.
 */
import { useEffect, useState } from 'react';

import { MeasurementGateModal } from '@/components/gates/measurement-gate-modal';
import { PhoneGateModal } from '@/components/gates/phone-gate-modal';
import { SessionsLowGateModal } from '@/components/gates/sessions-low-gate-modal';
import { useAuth } from '@/lib/auth/auth-context';
import { getClientGateStatus } from '@/lib/data/gates';

type GateKind = 'phone' | 'measurement' | 'sessions-low' | null;

export function GlobalGates() {
  const { profile } = useAuth();
  const [status, setStatus] = useState<{ measurementStale: boolean; sessionsRemaining: number | null } | null>(null);
  const [dismissed, setDismissed] = useState<Set<Exclude<GateKind, null>>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getClientGateStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        // Fail open — a gate-status fetch error should never block the app itself.
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.phone]);

  if (!status) return null;

  const active: GateKind =
    !dismissed.has('phone') && !profile?.phone
      ? 'phone'
      : !dismissed.has('measurement') && status.measurementStale
        ? 'measurement'
        : !dismissed.has('sessions-low') && status.sessionsRemaining !== null && status.sessionsRemaining <= 5
          ? 'sessions-low'
          : null;

  const dismiss = (kind: Exclude<GateKind, null>) => setDismissed((prev) => new Set(prev).add(kind));

  return (
    <>
      <PhoneGateModal visible={active === 'phone'} onDismiss={() => dismiss('phone')} />
      <MeasurementGateModal visible={active === 'measurement'} onDismiss={() => dismiss('measurement')} />
      {status.sessionsRemaining !== null && (
        <SessionsLowGateModal
          visible={active === 'sessions-low'}
          sessionsRemaining={status.sessionsRemaining}
          onDismiss={() => dismiss('sessions-low')}
        />
      )}
    </>
  );
}
