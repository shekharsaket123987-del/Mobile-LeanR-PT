/**
 * Escalation Detail (admin) — GATED WORKFLOW — New PRD.md §4.C "Screen:
 * Escalation Detail — the canonical gated workflow". See
 * src/lib/data/admin-escalations.ts header: the call-gate is enforced
 * here client-side only, matching the web app's `requireCalledClient()`
 * — not a DB constraint. Relit from the previous dark-theme version —
 * same data layer, untouched.
 */
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { LightBadge } from '@/components/light/light-badge';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightTextField } from '@/components/light/light-text-field';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
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

const FAULT_OPTIONS = ['client', 'coach', 'platform', 'unclear'];
const ISSUE_TYPE_OPTIONS = ['coach_behavior', 'scheduling', 'billing', 'technical', 'other'];

const STATUS_TONE: Record<string, 'teal' | 'green' | 'red'> = {
  open: 'red',
  in_progress: 'teal',
  resolved: 'green',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
      <LightScreenScaffold title="Escalation">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }
  if (error) {
    return (
      <LightScreenScaffold title="Escalation">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }
  if (!escalation) {
    return (
      <LightScreenScaffold title="Escalation">
        <LightEmptyState message="Escalation not found." />
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title={escalation.reason} subtitle={formatDate(escalation.created_at)}>
      <LightCard variant={isResolved ? 'default' : 'teal'} style={styles.summaryCard}>
        {escalation.clientName && <Text style={styles.metaLine}>Client: {escalation.clientName}</Text>}
        {escalation.coachName && <Text style={styles.metaLine}>Coach: {escalation.coachName}</Text>}
        {escalation.category && <Text style={styles.metaLine}>Category: {escalation.category}</Text>}
        {escalation.description && <Text style={styles.bodyText}>{escalation.description}</Text>}
        <LightBadge label={escalation.status.replace('_', ' ')} tone={STATUS_TONE[escalation.status] ?? 'gray'} />
      </LightCard>

      {!called && !isResolved && (
        <LightPrimaryButton size="lg" onPress={() => run(() => confirmCalledClient(id), setConfirming)} loading={confirming}>
          Confirm I&apos;ve called the client
        </LightPrimaryButton>
      )}

      {!called && <LightEmptyState message="Assessment, notes, and resolution unlock once you've confirmed the call." icon="call-outline" />}

      {called && (
        <>
          <LightCard style={styles.card}>
            <LightSectionHeader title="Issue type" />
            <LightChipGrid>
              {ISSUE_TYPE_OPTIONS.map((opt) => (
                <LightChip key={opt} label={opt.replace('_', ' ')} selected={issueType === opt} onPress={() => !isResolved && setIssueType(opt)} disabled={isResolved} />
              ))}
            </LightChipGrid>
            <Text style={styles.label}>FAULT</Text>
            <LightChipGrid>
              {FAULT_OPTIONS.map((opt) => (
                <LightChip key={opt} label={opt} selected={fault === opt} onPress={() => !isResolved && setFault(opt)} disabled={isResolved} />
              ))}
            </LightChipGrid>
            <Text style={styles.label}>SUMMARY</Text>
            <LightTextField
              placeholder="Assessment summary"
              value={summary}
              onChangeText={setSummary}
              multiline
              editable={!isResolved}
              style={styles.multilineInput}
              accessibilityLabel="Assessment summary"
            />
            {!isResolved && (
              <LightPrimaryButton
                onPress={() =>
                  run(
                    () => updateEscalationAssessment(id, { adminIssueType: issueType, fault, adminSummary: summary || null }),
                    setSavingAssessment
                  )
                }
                loading={savingAssessment}
                style={styles.saveButton}>
                Save assessment
              </LightPrimaryButton>
            )}
          </LightCard>

          <LightCard style={styles.card}>
            <LightSectionHeader title="Notes (client-visible)" />
            {notes.length === 0 && <Text style={styles.bodyText}>No notes yet.</Text>}
            {notes.map((n) => (
              <Text key={n.id} style={styles.bodyText}>
                {n.note}
              </Text>
            ))}
            {!isResolved && (
              <>
                <LightTextField
                  placeholder="Add a note…"
                  value={newNote}
                  onChangeText={setNewNote}
                  multiline
                  style={styles.multilineInput}
                  accessibilityLabel="New note"
                />
                <LightPrimaryButton
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
                </LightPrimaryButton>
              </>
            )}
          </LightCard>

          {!isResolved && (
            <LightCard style={styles.card}>
              <LightSectionHeader title="Resolve" />
              {escalation.status === 'open' && (
                <LightPrimaryButton onPress={() => run(() => markEscalationInProgress(id), setMarkingInProgress)} loading={markingInProgress}>
                  Mark in progress
                </LightPrimaryButton>
              )}
              <LightTextField
                placeholder="Resolution notes"
                value={resolutionNotes}
                onChangeText={setResolutionNotes}
                multiline
                style={styles.multilineInput}
                accessibilityLabel="Resolution notes"
              />
              <LightPrimaryButton
                onPress={() =>
                  run(async () => {
                    if (!resolutionNotes.trim()) throw new Error('Add resolution notes first.');
                    await resolveEscalation(id, resolutionNotes.trim());
                  }, setResolving)
                }
                loading={resolving}
                style={styles.saveButton}>
                Mark resolved & close
              </LightPrimaryButton>
            </LightCard>
          )}

          {isResolved && escalation.resolution_notes && (
            <LightCard variant="teal" style={styles.card}>
              <LightSectionHeader title="Resolution" />
              <Text style={styles.bodyText}>{escalation.resolution_notes}</Text>
            </LightCard>
          )}
        </>
      )}

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  summaryCard: { gap: 4 },
  card: { gap: 6 },
  metaLine: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: LightBrand.textSecondary },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textPrimary, marginTop: 2 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: LightBrand.textMuted, marginTop: 6 },
  multilineInput: { minHeight: 60, textAlignVertical: 'top' },
  saveButton: { marginTop: 6 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
});
