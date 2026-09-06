/**
 * Escalation Detail (admin) — GATED WORKFLOW — LEANR_PT_MOBILE_PRD.md
 * §10. See src/lib/data/admin-escalations.ts header: the call-gate
 * (§13 rule 22) is enforced here client-side only, matching the web
 * app's `requireCalledClient()` — not a DB constraint.
 */
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { Badge } from '@/components/ui/badge';
import { PrimaryButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Brand, Radius } from '@/constants/theme';
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

const STATUS_TONE: Record<string, 'yellow' | 'green' | 'red'> = {
  open: 'red',
  in_progress: 'yellow',
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
      <GlassCard variant={isResolved ? 'default' : 'yellow'}>
        {escalation.clientName && <Text style={styles.metaLine}>Client: {escalation.clientName}</Text>}
        {escalation.coachName && <Text style={styles.metaLine}>Coach: {escalation.coachName}</Text>}
        {escalation.category && <Text style={styles.metaLine}>Category: {escalation.category}</Text>}
        {escalation.description && <Text style={styles.bodyText}>{escalation.description}</Text>}
        <Badge label={escalation.status.replace('_', ' ')} tone={STATUS_TONE[escalation.status] ?? 'gray'} />
      </GlassCard>

      {!called && !isResolved && (
        <PrimaryButton size="lg" onPress={() => run(() => confirmCalledClient(id), setConfirming)} loading={confirming}>
          Confirm I&apos;ve called the client
        </PrimaryButton>
      )}

      {!called && <EmptyState message="Assessment, notes, and resolution unlock once you've confirmed the call." icon="call-outline" />}

      {called && (
        <>
          <GlassCard>
            <SectionHeader title="Issue type" />
            <ChipGrid>
              {ISSUE_TYPE_OPTIONS.map((opt) => (
                <Chip key={opt} label={opt.replace('_', ' ')} selected={issueType === opt} onPress={() => setIssueType(opt)} disabled={isResolved} />
              ))}
            </ChipGrid>
            <Text style={styles.label}>FAULT</Text>
            <ChipGrid>
              {FAULT_OPTIONS.map((opt) => (
                <Chip key={opt} label={opt} selected={fault === opt} onPress={() => setFault(opt)} disabled={isResolved} />
              ))}
            </ChipGrid>
            <Text style={styles.label}>SUMMARY</Text>
            <TextInput
              style={styles.input}
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={summary}
              onChangeText={setSummary}
              multiline
              editable={!isResolved}
              accessibilityLabel="Assessment summary"
            />
            {!isResolved && (
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
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader title="Notes (client-visible)" />
            {notes.length === 0 && <Text style={styles.bodyText}>No notes yet.</Text>}
            {notes.map((n) => (
              <Text key={n.id} style={styles.bodyText}>
                {n.note}
              </Text>
            ))}
            {!isResolved && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Add a note…"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  value={newNote}
                  onChangeText={setNewNote}
                  multiline
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
              </>
            )}
          </GlassCard>

          {!isResolved && (
            <GlassCard>
              <SectionHeader title="Resolve" />
              {escalation.status === 'open' && (
                <PrimaryButton onPress={() => run(() => markEscalationInProgress(id), setMarkingInProgress)} loading={markingInProgress}>
                  Mark in progress
                </PrimaryButton>
              )}
              <TextInput
                style={styles.input}
                placeholder="Resolution notes"
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={resolutionNotes}
                onChangeText={setResolutionNotes}
                multiline
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
            <GlassCard variant="yellow">
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
  metaLine: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: 'rgba(255,255,255,0.7)' },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: 'rgba(255,255,255,0.5)', marginTop: 6 },
  input: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    padding: 14,
    color: '#FFFFFF',
    minHeight: 60,
    backgroundColor: Brand.charcoal2,
    borderRadius: Radius.md,
    textAlignVertical: 'top',
    marginTop: 6,
    marginBottom: 4,
  },
  saveButton: { marginTop: 6 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
