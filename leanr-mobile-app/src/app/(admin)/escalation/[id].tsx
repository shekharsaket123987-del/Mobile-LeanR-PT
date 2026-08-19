/**
 * Escalation Detail (admin) — GATED WORKFLOW — LEANR_PT_MOBILE_PRD.md
 * §10. See src/lib/data/admin-escalations.ts header: the call-gate
 * (§13 rule 22) is enforced here client-side only, matching the web
 * app's `requireCalledClient()` — not a DB constraint.
 */
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton } from '@/components/tappable';
import { Brand, Colors } from '@/constants/theme';
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

const FAULT_OPTIONS = ['client', 'coach', 'platform', 'unclear'];
const ISSUE_TYPE_OPTIONS = ['coach_behavior', 'scheduling', 'billing', 'technical', 'other'];

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
      setActionError(err instanceof Error ? err.message : String(err));
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
      <Card>
        {escalation.clientName && <Text style={shared.cardLabel}>CLIENT: {escalation.clientName}</Text>}
        {escalation.coachName && <Text style={shared.cardLabel}>COACH: {escalation.coachName}</Text>}
        {escalation.category && <Text style={shared.cardLabel}>CATEGORY: {escalation.category}</Text>}
        {escalation.description && <Text style={styles.bodyText}>{escalation.description}</Text>}
        <Text style={[styles.statusText, isResolved && { color: Brand.successEmerald }]}>
          {escalation.status.replace('_', ' ').toUpperCase()}
        </Text>
      </Card>

      {!called && !isResolved && (
        <CtaButton onPress={() => run(() => confirmCalledClient(id), setConfirming)} loading={confirming}>
          Confirm I&apos;ve Called the Client
        </CtaButton>
      )}

      {!called && <EmptyState message="Assessment, notes, and resolution unlock once you've confirmed the call." />}

      {called && (
        <>
          <Card>
            <Text style={shared.cardLabel}>ISSUE TYPE</Text>
            <View style={styles.chipRow}>
              {ISSUE_TYPE_OPTIONS.map((opt) => (
                <Chip key={opt} label={opt.replace('_', ' ')} selected={issueType === opt} onPress={() => setIssueType(opt)} disabled={isResolved} />
              ))}
            </View>
            <Text style={shared.cardLabel}>FAULT</Text>
            <View style={styles.chipRow}>
              {FAULT_OPTIONS.map((opt) => (
                <Chip key={opt} label={opt} selected={fault === opt} onPress={() => setFault(opt)} disabled={isResolved} />
              ))}
            </View>
            <Text style={shared.cardLabel}>SUMMARY</Text>
            <TextInput
              style={styles.input}
              value={summary}
              onChangeText={setSummary}
              multiline
              editable={!isResolved}
              accessibilityLabel="Assessment summary"
            />
            {!isResolved && (
              <CtaButton
                onPress={() =>
                  run(
                    () => updateEscalationAssessment(id, { adminIssueType: issueType, fault, adminSummary: summary || null }),
                    setSavingAssessment
                  )
                }
                loading={savingAssessment}
                style={styles.saveButton}>
                Save Assessment
              </CtaButton>
            )}
          </Card>

          <Card>
            <Text style={shared.cardLabel}>NOTES (CLIENT-VISIBLE)</Text>
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
                  value={newNote}
                  onChangeText={setNewNote}
                  multiline
                  accessibilityLabel="New note"
                />
                <CtaButton
                  onPress={() =>
                    run(async () => {
                      if (!newNote.trim()) throw new Error('Write a note first.');
                      await addEscalationNote(id, newNote.trim());
                      setNewNote('');
                    }, setSavingNote)
                  }
                  loading={savingNote}
                  style={styles.saveButton}>
                  Add Note
                </CtaButton>
              </>
            )}
          </Card>

          {!isResolved && (
            <Card>
              <Text style={shared.cardLabel}>RESOLVE</Text>
              {escalation.status === 'open' && (
                <CtaButton onPress={() => run(() => markEscalationInProgress(id), setMarkingInProgress)} loading={markingInProgress}>
                  Mark In Progress
                </CtaButton>
              )}
              <TextInput
                style={styles.input}
                placeholder="Resolution notes"
                value={resolutionNotes}
                onChangeText={setResolutionNotes}
                multiline
                accessibilityLabel="Resolution notes"
              />
              <CtaButton
                onPress={() =>
                  run(async () => {
                    if (!resolutionNotes.trim()) throw new Error('Add resolution notes first.');
                    await resolveEscalation(id, resolutionNotes.trim());
                  }, setResolving)
                }
                loading={resolving}
                style={styles.saveButton}>
                Mark Resolved & Close
              </CtaButton>
            </Card>
          )}

          {isResolved && escalation.resolution_notes && (
            <Card>
              <Text style={shared.cardLabel}>RESOLUTION</Text>
              <Text style={styles.bodyText}>{escalation.resolution_notes}</Text>
            </Card>
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

function Chip({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={[styles.chip, { backgroundColor: selected ? Brand.yellow : colors.backgroundElement }, disabled && styles.chipDisabled]}>
      <Text style={[styles.chipLabel, { color: selected ? Brand.black : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, marginTop: 2 },
  statusText: { fontFamily: 'Manrope_700Bold', fontSize: 12, marginTop: 6, color: Brand.streakEmberStart },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 8 },
  chip: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  chipDisabled: { opacity: 0.5 },
  chipLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, textTransform: 'capitalize' },
  input: { fontFamily: 'Manrope_500Medium', fontSize: 15, paddingVertical: 8, color: Brand.charcoal2, minHeight: 44 },
  saveButton: { marginTop: 8 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
});
