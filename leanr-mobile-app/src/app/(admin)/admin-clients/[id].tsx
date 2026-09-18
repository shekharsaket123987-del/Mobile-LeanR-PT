/**
 * Client Detail (admin) — New PRD.md §4.C "Screen: Client Detail
 * (richest screen)". Manual Controls card: Adjust Sessions, Grant
 * Pause-Days, Transfer Coach, Assign Shadow Coach, Pause/Resume
 * Subscription, Log Measurement, Log Escalation, Log Refund Request.
 * Forms use the app's established "inline-toggled GlassCard section"
 * convention — only one control panel open at a time.
 */
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ClientTimeline } from '@/components/client-timeline';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { MeasurementChart, type ChartPoint } from '@/components/ui/measurement-chart';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TextField } from '@/components/ui/text-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { assignShadowCoach, previewShadowAssignmentPlan, type ShadowAssignmentPlan } from '@/lib/data/admin-shadow';
import {
  adjustClientSessions,
  expireClientSubscription,
  getAdminClientDetail,
  getClientChatsForAdmin,
  grantPauseDays,
  listAdminCoachOptions,
  listEscalationsForClient,
  logEscalation,
  logMeasurement,
  logRefundRequest,
  pauseClientSubscription,
  transferClientCoach,
  type MeasurementInput,
} from '@/lib/data/admin-clients';
import { sessionTypeLabel } from '@/lib/data/bookings';
import type { DerivedClientStatus } from '@/lib/data/coach-clients';
import { getErrorMessage } from '@/lib/data/errors';
import { useAsync } from '@/lib/data/use-async';

const STATUS_TONE: Record<DerivedClientStatus, 'yellow' | 'green' | 'red' | 'gray'> = {
  active: 'green',
  paused: 'yellow',
  created: 'yellow',
  expired: 'gray',
  demo: 'gray',
  not_paid: 'gray',
};
const STATUS_LABEL: Record<DerivedClientStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  created: 'Created',
  expired: 'Expired',
  demo: 'Demo',
  not_paid: 'Not Paid',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type Panel =
  | null
  | 'adjustSessions'
  | 'grantPauseDays'
  | 'transferCoach'
  | 'assignShadow'
  | 'logMeasurement'
  | 'logEscalation'
  | 'logRefund';
type Tab = 'overview' | 'timeline' | 'escalations' | 'chats' | 'sessions';

export default function AdminClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: client, loading, error, reload } = useAsync(() => getAdminClientDetail(id), [id]);
  const [tab, setTab] = useState<Tab>('overview');
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: coachOptions } = useAsync(listAdminCoachOptions, []);
  const { data: escalations } = useAsync(() => listEscalationsForClient(id), [id, tab]);
  const { data: chatMessages } = useAsync(() => getClientChatsForAdmin(id), [id, tab]);

  const togglePanel = (p: Panel) => {
    setActionError(null);
    setPanel((cur) => (cur === p ? null : p));
  };

  const run = async (fn: () => Promise<void>) => {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
      setPanel(null);
      reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ScreenScaffold title="Client Details">
        <LoadingState />
      </ScreenScaffold>
    );
  }
  if (error || !client) {
    return (
      <ScreenScaffold title="Client Details">
        <ErrorState message={error ?? 'Client not found.'} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Client Details">
      <GlassCard style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Avatar photoUrl={client.photo_url} name={client.full_name} size={56} ring />
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{client.full_name}</Text>
            <Text style={styles.code}>#{client.client_code}</Text>
          </View>
          <Badge label={STATUS_LABEL[client.derivedStatus]} tone={STATUS_TONE[client.derivedStatus]} />
        </View>
        <View style={styles.demoRow}>
          <Text style={styles.demoItem}>{client.demographics?.heightCm ? `${client.demographics.heightCm} cm` : '—'}</Text>
          <Text style={styles.demoItem}>{client.demographics?.weightKg ? `${client.demographics.weightKg} kg` : '—'}</Text>
          <Text style={styles.demoItem}>{client.demographics?.bmi ? `BMI ${client.demographics.bmi}` : '—'}</Text>
        </View>
        <View style={styles.demoBlock}>
          <Text style={styles.demoLabel}>Goals</Text>
          <Text style={styles.demoValue}>{client.goals.length > 0 ? client.goals.join(', ') : '—'}</Text>
        </View>
        <View style={styles.demoBlock}>
          <Text style={styles.demoLabel}>Medical Notes</Text>
          <Text style={styles.demoValue}>{client.medicalNotes ?? '—'}</Text>
        </View>
      </GlassCard>

      <SegmentedControl
        options={[
          { key: 'overview', label: 'Overview' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'escalations', label: 'Concerns' },
          { key: 'chats', label: 'Chats' },
          { key: 'sessions', label: 'Sessions' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <>
          <GlassCard style={styles.card}>
            <SectionHeader title="Overview" />
            <Row label="Phone" value={client.phone ?? '—'} />
            <Row label="Plan" value={client.planName ?? '—'} />
            <Row label="Coach" value={client.coachName ?? '—'} />
            <Row label="Start Date" value={formatDate(client.startDate)} />
            <Row label="Slot" value={client.slotSummary ?? '—'} />
            {client.sessionsTotal != null && <Row label="Sessions Used" value={`${client.sessionsUsed ?? 0} / ${client.sessionsTotal}`} />}
            {client.pauseDaysAllowed != null && <Row label="Pause Days Allowed" value={String(client.pauseDaysAllowed)} />}
          </GlassCard>

          {client.progressHistory.length > 0 && (
            <GlassCard style={styles.card}>
              <SectionHeader title="Progress Over Time" />
              <MeasurementChart
                points={[...client.progressHistory]
                  .reverse()
                  .filter((l) => l.weight != null)
                  .map((l): ChartPoint => ({ label: formatMonth(l.loggedAt), value: l.weight as number }))}
              />
              {client.progressHistory[0] && (
                <View style={styles.latestMeasurementGrid}>
                  <Row label="Weight" value={client.progressHistory[0].weight != null ? `${client.progressHistory[0].weight} kg` : '—'} />
                  <Row label="Body Fat" value={client.progressHistory[0].bodyFatPct != null ? `${client.progressHistory[0].bodyFatPct}%` : '—'} />
                  <Row label="Muscle" value={client.progressHistory[0].musclePct != null ? `${client.progressHistory[0].musclePct}%` : '—'} />
                  <Row label="Waist" value={client.progressHistory[0].waist != null ? `${client.progressHistory[0].waist} cm` : '—'} />
                  <Row label="Logged" value={formatDate(client.progressHistory[0].loggedAt)} />
                </View>
              )}
            </GlassCard>
          )}

          <SectionHeader title="Manual Controls" />
          <GlassCard style={styles.card}>
            <SecondaryButton onPress={() => togglePanel('adjustSessions')} disabled={!client.subscriptionId} style={styles.controlButton}>
              Adjust Package / Sessions
            </SecondaryButton>
            {panel === 'adjustSessions' && client.subscriptionId && (
              <AdjustSessionsPanel
                currentTotal={client.sessionsTotal ?? 0}
                busy={busy}
                error={actionError}
                onSubmit={(newTotal) =>
                  run(async () => {
                    const result = await adjustClientSessions(client.subscriptionId!, newTotal);
                    const parts = [`Sessions total: ${result.previousTotal} → ${result.newTotal}.`];
                    if (result.generatedCount > 0) {
                      parts.push(`Booked ${result.generatedCount} new upcoming session${result.generatedCount === 1 ? '' : 's'} on the existing schedule.`);
                    }
                    if (result.cancelledCount > 0) {
                      parts.push(`Cancelled ${result.cancelledCount} upcoming session${result.cancelledCount === 1 ? '' : 's'} and freed the coach's slot${result.cancelledCount === 1 ? '' : 's'}.`);
                    }
                    Alert.alert('Package updated', parts.join(' '));
                  })
                }
              />
            )}

            <SecondaryButton onPress={() => togglePanel('grantPauseDays')} disabled={!client.subscriptionId} style={styles.controlButton}>
              Grant Pause-Days
            </SecondaryButton>
            {panel === 'grantPauseDays' && client.subscriptionId && (
              <GrantPauseDaysPanel current={client.pauseDaysAllowed ?? 0} busy={busy} error={actionError} onSubmit={(next) => run(() => grantPauseDays(client.subscriptionId!, next))} />
            )}

            <SecondaryButton onPress={() => togglePanel('transferCoach')} disabled={!client.coachId} style={styles.controlButton}>
              Transfer to Another Coach
            </SecondaryButton>
            {panel === 'transferCoach' && (
              <TransferCoachPanel
                coachOptions={(coachOptions ?? []).filter((c) => c.id !== client.coachId)}
                busy={busy}
                error={actionError}
                onSubmit={(coachId, force) => run(() => transferClientCoach(id, coachId, force))}
              />
            )}

            <SecondaryButton onPress={() => togglePanel('assignShadow')} disabled={!client.coachId} style={styles.controlButton}>
              Assign Shadow Coach
            </SecondaryButton>
            {panel === 'assignShadow' && client.coachId && (
              <AssignShadowPanel
                clientId={id}
                clientName={client.full_name}
                primaryCoachId={client.coachId}
                primaryCoachName={client.coachName ?? 'Coach'}
                onAssigned={() => {
                  setPanel(null);
                  reload();
                }}
              />
            )}

            <SecondaryButton onPress={() => run(() => pauseClientSubscription(client.subscriptionId!))} disabled={!client.subscriptionId || busy} style={styles.controlButton}>
              Pause Subscription
            </SecondaryButton>

            <DestructiveButton
              onPress={() =>
                Alert.alert('Expire this plan?', 'Ends the subscription immediately. This cannot be undone from here — the client would need a new plan/renewal to come back.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Expire Plan', style: 'destructive', onPress: () => run(() => expireClientSubscription(client.subscriptionId!)) },
                ])
              }
              disabled={!client.subscriptionId || busy}
              style={styles.controlButton}
            >
              Expire Plan
            </DestructiveButton>

            <SecondaryButton onPress={() => togglePanel('logMeasurement')} style={styles.controlButton}>
              Log Measurement
            </SecondaryButton>
            {panel === 'logMeasurement' && <LogMeasurementPanel busy={busy} error={actionError} onSubmit={(m) => run(() => logMeasurement(id, m))} />}

            <SecondaryButton onPress={() => togglePanel('logEscalation')} style={styles.controlButton}>
              Log Escalation
            </SecondaryButton>
            {panel === 'logEscalation' && (
              <LogEscalationPanel busy={busy} error={actionError} onSubmit={(reason, details) => run(() => logEscalation(id, client.coachId, reason, details))} />
            )}

            <DestructiveButton onPress={() => togglePanel('logRefund')} style={styles.controlButton}>
              Log Refund Request
            </DestructiveButton>
            {panel === 'logRefund' && <LogRefundPanel busy={busy} error={actionError} onSubmit={(amount, reason) => run(() => logRefundRequest(id, amount, reason))} />}
          </GlassCard>
        </>
      )}

      {tab === 'timeline' && <ClientTimeline clientId={id} />}

      {tab === 'escalations' && (
        <>
          {(escalations?.length ?? 0) === 0 && <EmptyState message="No concerns raised." icon="checkmark-circle-outline" />}
          {escalations?.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => router.push({ pathname: '/escalation/[id]', params: { id: e.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Open escalation: ${e.reason}`}>
              <GlassCard style={styles.timelineCard}>
                <View style={styles.escalationRow}>
                  <Text style={styles.timelineTitle}>{e.reason}</Text>
                  <Badge label={e.status.replace('_', ' ')} tone={e.status === 'resolved' ? 'green' : 'red'} />
                </View>
                <Text style={styles.timelineDate}>{formatDate(e.created_at)}</Text>
              </GlassCard>
            </Pressable>
          ))}
        </>
      )}

      {tab === 'chats' && (
        <>
          <GlassCard variant="yellow" style={styles.timelineCard}>
            <Text style={styles.timelineDesc}>View-only — admin can see this conversation but never send messages.</Text>
          </GlassCard>
          {(chatMessages?.length ?? 0) === 0 && <EmptyState message="No chat messages yet." icon="chatbubble-outline" />}
          {chatMessages?.map((m) => (
            <View key={m.id} style={[styles.chatBubble, m.sender_role === 'coach' ? styles.chatBubbleCoach : styles.chatBubbleClient]}>
              <Text style={styles.chatSender}>{m.sender_role === 'coach' ? 'Coach' : 'Client'}</Text>
              {m.body && <Text style={styles.chatBody}>{m.body}</Text>}
              <Text style={styles.timelineDate}>{formatDateTime(m.created_at)}</Text>
            </View>
          ))}
        </>
      )}

      {tab === 'sessions' && (
        <>
          {client.sessionHistory.length === 0 && <EmptyState message="No sessions yet." icon="calendar-outline" />}
          {client.sessionHistory.map((b) => (
            <GlassCard key={b.id} style={styles.timelineCard}>
              <View style={styles.sessionRow}>
                <View style={styles.sessionBadges}>
                  <Badge
                    label={
                      b.session_type === 'assessment'
                        ? `${sessionTypeLabel(b.session_type)} · ${b.amount_paid ? `₹${b.amount_paid.toLocaleString('en-IN')}` : 'Free'}`
                        : sessionTypeLabel(b.session_type)
                    }
                    tone="gray"
                  />
                  <Badge label={b.status} tone={b.status === 'completed' ? 'green' : b.status === 'cancelled' || b.status === 'missed' ? 'red' : 'yellow'} />
                </View>
                <Text style={styles.timelineDate}>{formatDateTime(b.scheduled_start)}</Text>
              </View>
              {b.rating_note && <Text style={styles.timelineDesc}>{b.rating_note}</Text>}
            </GlassCard>
          ))}
        </>
      )}
    </ScreenScaffold>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function PanelError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Text style={styles.errorText} accessibilityRole="alert">
      {error}
    </Text>
  );
}

function AdjustSessionsPanel({ currentTotal, busy, error, onSubmit }: { currentTotal: number; busy: boolean; error: string | null; onSubmit: (n: number) => void }) {
  const [value, setValue] = useState(String(currentTotal));
  return (
    <View style={styles.panel}>
      <TextField keyboardType="number-pad" value={value} onChangeText={setValue} placeholder="New sessions total" accessibilityLabel="New sessions total" />
      <Text style={styles.hintText}>
        Raising the total books more upcoming sessions on the client's existing schedule; lowering it cancels the
        furthest-out upcoming sessions first and frees the coach's slot.
      </Text>
      <PanelError error={error} />
      <PrimaryButton loading={busy} onPress={() => onSubmit(Number(value) || 0)}>
        Save
      </PrimaryButton>
    </View>
  );
}

function GrantPauseDaysPanel({ current, busy, error, onSubmit }: { current: number; busy: boolean; error: string | null; onSubmit: (n: number) => void }) {
  const [value, setValue] = useState(String(current));
  return (
    <View style={styles.panel}>
      <TextField keyboardType="number-pad" value={value} onChangeText={setValue} placeholder="New pause-days allowed" accessibilityLabel="New pause-days allowed" />
      <PanelError error={error} />
      <PrimaryButton loading={busy} onPress={() => onSubmit(Number(value) || 0)}>
        Save
      </PrimaryButton>
    </View>
  );
}

function TransferCoachPanel({
  coachOptions,
  busy,
  error,
  onSubmit,
}: {
  coachOptions: { id: string; full_name: string }[];
  busy: boolean;
  error: string | null;
  onSubmit: (coachId: string, force: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const offerForce = Boolean(error);
  return (
    <View style={styles.panel}>
      <ChipGrid>
        {coachOptions.map((c) => (
          <Chip key={c.id} label={c.full_name} selected={selected === c.id} onPress={() => setSelected(c.id)} />
        ))}
      </ChipGrid>
      <PanelError error={error} />
      <PrimaryButton loading={busy} disabled={!selected} onPress={() => selected && onSubmit(selected, false)}>
        Transfer
      </PrimaryButton>
      {offerForce && selected && (
        <SecondaryButton loading={busy} onPress={() => onSubmit(selected, true)}>
          Transfer Anyway
        </SecondaryButton>
      )}
    </View>
  );
}

/**
 * Ad-hoc manual assign — independent of any `coach_leave` record, matching
 * web's client-detail "Assign Shadow Coach" button + ShadowCoachAssignModal
 * (the one legitimate manual path for a coach who never applied for leave).
 * Same scored/availability-aware preview-then-confirm flow as the Shadow
 * Coverage screen's queue-driven GapCard (shadow.tsx), just with an
 * admin-chosen date range instead of one derived from an approved leave.
 */
function AssignShadowPanel({
  clientId,
  clientName,
  primaryCoachId,
  primaryCoachName,
  onAssigned,
}: {
  clientId: string;
  clientName: string;
  primaryCoachId: string;
  primaryCoachName: string;
  onAssigned: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [reason, setReason] = useState('');
  const [plan, setPlan] = useState<ShadowAssignmentPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findCoverage = async () => {
    setLoadingPlan(true);
    setError(null);
    setPlan(null);
    try {
      setPlan(await previewShadowAssignmentPlan(clientId, primaryCoachId, startsOn, endsOn));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingPlan(false);
    }
  };

  const confirm = async () => {
    if (!plan || plan.assignments.length === 0) return;
    setAssigning(true);
    setError(null);
    try {
      for (const item of plan.assignments) {
        await assignShadowCoach({
          clientId,
          clientName,
          primaryCoachId,
          primaryCoachName,
          shadowCoachId: item.shadowCoachId,
          shadowCoachName: item.shadowCoachName,
          startsOn: item.startsOn,
          endsOn: item.endsOn,
          reason: reason || null,
        });
      }
      onAssigned();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.demoValue}>
        Finds the best-matching free coach for each of this client&apos;s sessions in the range — different sessions can land on different coaches.
      </Text>
      <TextField
        placeholder="From (YYYY-MM-DD)"
        value={startsOn}
        onChangeText={(v) => {
          setStartsOn(v);
          setPlan(null);
        }}
        accessibilityLabel="From date"
      />
      <TextField
        placeholder="To (YYYY-MM-DD)"
        value={endsOn}
        onChangeText={(v) => {
          setEndsOn(v);
          setPlan(null);
        }}
        accessibilityLabel="To date"
      />
      <TextField placeholder="Reason (optional)" value={reason} onChangeText={setReason} accessibilityLabel="Reason" />
      <PanelError error={error} />
      {plan === null ? (
        <PrimaryButton loading={loadingPlan} onPress={findCoverage}>
          Find Coverage
        </PrimaryButton>
      ) : (
        <>
          {plan.assignments.length === 0 && plan.uncoveredDates.length === 0 && (
            <Text style={styles.demoValue}>This client has no upcoming sessions with {primaryCoachName} in that range.</Text>
          )}
          {plan.assignments.map((a, i) => (
            <Text key={i} style={styles.demoValue}>
              {a.shadowCoachName} — {a.startsOn}
              {a.endsOn !== a.startsOn ? ` – ${a.endsOn}` : ''}
            </Text>
          ))}
          {plan.uncoveredDates.length > 0 && <Text style={styles.errorText}>No coach free on: {plan.uncoveredDates.join(', ')}</Text>}
          <SecondaryButton loading={loadingPlan} onPress={findCoverage}>
            Re-check availability
          </SecondaryButton>
          {plan.assignments.length > 0 && (
            <PrimaryButton loading={assigning} onPress={confirm}>
              Confirm Assignment{plan.assignments.length > 1 ? 's' : ''}
            </PrimaryButton>
          )}
        </>
      )}
    </View>
  );
}

const MEASUREMENT_FIELDS: { key: keyof MeasurementInput; label: string }[] = [
  { key: 'weight', label: 'Weight (kg)' },
  { key: 'body_fat_pct', label: 'Body Fat %' },
  { key: 'muscle_pct', label: 'Muscle %' },
  { key: 'waist', label: 'Waist' },
  { key: 'chest', label: 'Chest' },
  { key: 'hip', label: 'Hip' },
  { key: 'arms', label: 'Arms' },
  { key: 'thigh', label: 'Thigh' },
];

function LogMeasurementPanel({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (m: MeasurementInput) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <View style={styles.panel}>
      {MEASUREMENT_FIELDS.map((f) => (
        <TextField
          key={f.key}
          keyboardType="decimal-pad"
          placeholder={f.label}
          value={values[f.key] ?? ''}
          onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))}
          accessibilityLabel={f.label}
        />
      ))}
      <PanelError error={error} />
      <PrimaryButton
        loading={busy}
        onPress={() => {
          const input: MeasurementInput = {};
          for (const f of MEASUREMENT_FIELDS) {
            const raw = values[f.key];
            if (raw) (input as Record<string, number>)[f.key] = Number(raw);
          }
          onSubmit(input);
        }}>
        Save Measurement
      </PrimaryButton>
    </View>
  );
}

function LogEscalationPanel({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (reason: string, details: string | null) => void }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  return (
    <View style={styles.panel}>
      <TextField placeholder="Reason" value={reason} onChangeText={setReason} accessibilityLabel="Reason" />
      <TextField placeholder="Details (optional)" value={details} onChangeText={setDetails} multiline style={styles.multiline} accessibilityLabel="Details" />
      <PanelError error={error} />
      <PrimaryButton loading={busy} disabled={!reason.trim()} onPress={() => onSubmit(reason.trim(), details.trim() || null)}>
        Log Escalation
      </PrimaryButton>
    </View>
  );
}

function LogRefundPanel({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (amount: number, reason: string) => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  return (
    <View style={styles.panel}>
      <GlassCard variant="yellow" style={styles.timelineCard}>
        <Text style={styles.timelineDesc}>
          This platform has no payment gateway yet — this logs a refund request to the audit trail for finance to action manually; it does not move money.
        </Text>
      </GlassCard>
      <TextField keyboardType="decimal-pad" placeholder="Amount (₹)" value={amount} onChangeText={setAmount} accessibilityLabel="Refund amount" />
      <TextField placeholder="Reason" value={reason} onChangeText={setReason} accessibilityLabel="Refund reason" />
      <PanelError error={error} />
      <DestructiveButton loading={busy} disabled={!amount || !reason.trim()} onPress={() => onSubmit(Number(amount) || 0, reason.trim())}>
        Log Refund Request
      </DestructiveButton>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerInfo: { flex: 1, gap: 2 },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: '#FFFFFF' },
  code: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.45)' },
  card: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.45)' },
  rowValue: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#FFFFFF', maxWidth: '60%' },
  controlButton: { marginTop: 8 },
  panel: { gap: 8, marginTop: 8, marginBottom: 4 },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: Brand.alertRed },
  hintText: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.45)' },
  timelineCard: { gap: 2 },
  timelineTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: '#FFFFFF' },
  timelineDesc: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  timelineDate: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  escalationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatBubble: { padding: 12, borderRadius: 14, maxWidth: '85%', gap: 2 },
  chatBubbleClient: { backgroundColor: Brand.bgElevated, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignSelf: 'flex-start' },
  chatBubbleCoach: { backgroundColor: 'rgba(245,217,10,0.1)', alignSelf: 'flex-end' },
  chatSender: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: 'rgba(255,255,255,0.45)' },
  chatBody: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#FFFFFF' },
  sessionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionBadges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  demoRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  demoItem: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' },
  demoBlock: { marginTop: 8 },
  demoLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 2 },
  demoValue: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  latestMeasurementGrid: { marginTop: 4 },
});
