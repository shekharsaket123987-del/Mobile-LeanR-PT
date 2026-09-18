/**
 * Escalation Detail (admin) — GATED WORKFLOW — New PRD.md §4.C "Screen:
 * Escalation Detail — the canonical gated workflow". See
 * src/lib/data/admin-escalations.ts header: the call-gate is enforced both
 * client-side (for UX) and by a DB trigger (for the real trust boundary).
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { PrimaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import {
  addEscalationNote,
  confirmCalledClient,
  getEscalationById,
  getEscalationNotes,
  markEscalationInProgress,
  resolveEscalation,
  updateEscalationAssessment,
} from '@/lib/data/admin-escalations';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

/** Gap Verification Report Area 9 — DB CHECK-constrained (migration 0049), exact values/labels, not inferred. */
const FAULT_OPTIONS = [
  { value: 'coach', label: 'Coach' },
  { value: 'client', label: 'Client' },
  { value: 'platform', label: 'Platform / Technical' },
  { value: 'third_party', label: 'Third-party (Zoom, payments, etc.)' },
  { value: 'none', label: 'No fault — miscommunication' },
  { value: 'other', label: 'Other' },
];
/** Same as the client's own concern-category picker (CONCERN_CATEGORIES) — exact values/labels, not inferred. */
const ISSUE_TYPE_OPTIONS = [
  { value: 'slot_not_available', label: 'Slot not available' },
  { value: 'coach_missed_session', label: 'Coach missed session' },
  { value: 'need_schedule_change', label: 'Need schedule change' },
  { value: 'payment_issue', label: 'Payment issue' },
  { value: 'technical_issue', label: 'Technical issue' },
  { value: 'want_coach_change', label: 'Want to change coach' },
  { value: 'other', label: 'Other' },
];

const STATUS_TONE: Record<string, 'yellow' | 'green' | 'red'> = {
  open: 'red',
  in_progress: 'yellow',
  resolved: 'green',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function categoryLabel(value: string | null) {
  return ISSUE_TYPE_OPTIONS.find((c) => c.value === value)?.label ?? 'Other';
}

export default function AdminEscalationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync(async () => {
    const [escalation, notes] = await Promise.all([getEscalationById(id), getEscalationNotes(id)]);
    return { escalation, notes };
  }, [id]);

  const [confirming, setConfirming] = useState(false);
  const [issueType, setIssueType] = useState<string | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [savingAssessment, setSavingAssessment] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [markingInProgress, setMarkingInProgress] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const escalation = data?.escalation ?? null;
  const notes = data?.notes ?? [];
  const called = Boolean(escalation?.called_client_at);
  const isResolved = escalation?.status === 'resolved';

  // Prefill the assessment form from whatever was already saved, once per
  // escalation — keyed on id (not on every `data` change) so that reloading
  // after adding a note or marking in-progress doesn't clobber in-progress edits.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!escalation || prefilledFor.current === escalation.id) return;
    prefilledFor.current = escalation.id;
    setIssueType(escalation.admin_issue_type ?? null);
    setFault(escalation.fault ?? null);
    setSummary(escalation.admin_summary ?? '');
    setResolutionNotes(escalation.resolution_notes ?? '');
  }, [escalation]);

  const run = async (fn: () => Promise<void>, setBusy: (b: boolean) => void) => {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
      reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ScreenScaffold title="Escalation">
        <LoadingState />
      </ScreenScaffold>
    );
  }
  if (error) {
    return (
      <ScreenScaffold title="Escalation">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }
  if (!escalation) {
    return (
      <ScreenScaffold title="Escalation">
        <EmptyState message="Escalation not found." />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title={escalation.reason} subtitle={formatDate(escalation.created_at)}>
      <GlassCard variant={isResolved ? 'default' : 'yellow'} style={styles.summaryCard}>
        <Text style={styles.metaLine}>{escalation.clientCode ? `#${escalation.clientCode}` : `#${escalation.id.slice(0, 8).toUpperCase()}`}</Text>
        {escalation.clientName && <Text style={styles.metaLine}>Client: {escalation.clientName}</Text>}
        {escalation.coachName && <Text style={styles.metaLine}>Coach: {escalation.coachName}</Text>}
        <Text style={styles.metaLine}>Category: {categoryLabel(escalation.category)}</Text>
        {escalation.description && <Text style={styles.bodyText}>{escalation.description}</Text>}
        <Text style={styles.metaLine}>
          Raised {formatDate(escalation.created_at)} · {formatTime(escalation.created_at)}
        </Text>
        {escalation.resolved_at && (
          <Text style={styles.metaLine}>
            Resolved {formatDate(escalation.resolved_at)} · {formatTime(escalation.resolved_at)}
          </Text>
        )}
        <Badge label={escalation.status.replace('_', ' ')} tone={STATUS_TONE[escalation.status] ?? 'gray'} />
      </GlassCard>

      {!called && (
        <PrimaryButton size="lg" onPress={() => run(() => confirmCalledClient(id), setConfirming)} loading={confirming}>
          Confirm I&apos;ve called the client
        </PrimaryButton>
      )}

      {called && (
        <Text style={styles.metaLine}>
          Called the client on {formatDate(escalation.called_client_at!)} · {formatTime(escalation.called_client_at!)}
        </Text>
      )}

      {!called && <EmptyState message="Assessment, notes, and resolution unlock once you've confirmed the call." icon="call-outline" />}

      {called && (
        <>
          <GlassCard style={styles.card}>
            <SectionHeader title="Issue type" />
            <ChipGrid>
              {ISSUE_TYPE_OPTIONS.map((opt) => (
                <Chip key={opt.value} label={opt.label} selected={issueType === opt.value} onPress={() => setIssueType(opt.value)} />
              ))}
            </ChipGrid>
            <Text style={styles.label}>FAULT</Text>
            <ChipGrid>
              {FAULT_OPTIONS.map((opt) => (
                <Chip key={opt.value} label={opt.label} selected={fault === opt.value} onPress={() => setFault(opt.value)} />
              ))}
            </ChipGrid>
            <Text style={styles.label}>SUMMARY</Text>
            <TextField
              placeholder="Assessment summary"
              value={summary}
              onChangeText={setSummary}
              multiline
              style={styles.multilineInput}
              accessibilityLabel="Assessment summary"
            />
            <PrimaryButton
              onPress={() =>
                run(
                  () => updateEscalationAssessment(id, { adminIssueType: issueType, fault, adminSummary: summary || null }),
                  setSavingAssessment
                )
              }
              loading={savingAssessment}
              style={styles.saveButton}>
              Save assessment
            </PrimaryButton>
          </GlassCard>

          <GlassCard style={styles.card}>
            <SectionHeader title="Notes (client-visible)" />
            {notes.length === 0 && <Text style={styles.bodyText}>No notes yet.</Text>}
            {notes.map((n) => (
              <View key={n.id} style={styles.noteRow}>
                <Text style={styles.bodyText}>{n.note}</Text>
                <Text style={styles.noteMeta}>
                  {n.authorName ?? 'Admin'} · {formatDate(n.created_at)} · {formatTime(n.created_at)}
                </Text>
              </View>
            ))}
            <TextField
              placeholder="Add a note…"
              value={newNote}
              onChangeText={setNewNote}
              multiline
              style={styles.multilineInput}
              accessibilityLabel="New note"
            />
            <PrimaryButton
              onPress={() =>
                run(async () => {
                  if (!newNote.trim()) throw new Error('Write a note first.');
                  await addEscalationNote(id, newNote.trim());
                  setNewNote('');
                }, setSavingNote)
              }
              loading={savingNote}
              style={styles.saveButton}>
              Add note
            </PrimaryButton>
          </GlassCard>

          {!isResolved && (
            <GlassCard style={styles.card}>
              <SectionHeader title="Resolve" />
              {escalation.status === 'open' && (
                <PrimaryButton onPress={() => run(() => markEscalationInProgress(id), setMarkingInProgress)} loading={markingInProgress}>
                  Mark in progress
                </PrimaryButton>
              )}
              <TextField
                placeholder="Resolution notes"
                value={resolutionNotes}
                onChangeText={setResolutionNotes}
                multiline
                style={styles.multilineInput}
                accessibilityLabel="Resolution notes"
              />
              <PrimaryButton
                onPress={() =>
                  run(async () => {
                    if (!resolutionNotes.trim()) throw new Error('Add resolution notes first.');
                    await resolveEscalation(id, resolutionNotes.trim());
                  }, setResolving)
                }
                loading={resolving}
                style={styles.saveButton}>
                Mark resolved & close
              </PrimaryButton>
            </GlassCard>
          )}

          {isResolved && escalation.resolution_notes && (
            <GlassCard variant="yellow" style={styles.card}>
              <SectionHeader title="Resolution" />
              <Text style={styles.bodyText}>{escalation.resolution_notes}</Text>
            </GlassCard>
          )}
        </>
      )}

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  summaryCard: { gap: 4 },
  card: { gap: 6 },
  metaLine: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#FFFFFF', marginTop: 2 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: 'rgba(255,255,255,0.45)', marginTop: 6 },
  noteRow: { marginTop: 4 },
  noteMeta: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  multilineInput: { minHeight: 60, textAlignVertical: 'top' },
  saveButton: { marginTop: 6 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
