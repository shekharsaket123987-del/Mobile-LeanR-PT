/**
 * My Concerns — LEANR_PT_MOBILE_PRD.md §10 "My Concerns" row: raise a
 * concern, track its status. Resolution is admin-only (§3/§13 rule 22) —
 * this screen is read + raise only, matching the client's real
 * permissions (see src/lib/data/concerns.ts for the confirmed RLS).
 *
 * Reached from More ("My Concerns" row) — not a tab itself, hidden via
 * `href: null` in the (client) layout.
 */
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { Badge } from '@/components/ui/badge';
import { PrimaryButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { Brand, Radius } from '@/constants/theme';
import {
  CONCERN_CATEGORIES,
  getMyConcerns,
  getNotesForConcerns,
  raiseConcern,
  type Concern,
  type ConcernCategory,
  type ConcernNote,
  type EscalationStatus,
} from '@/lib/data/concerns';
import { useAsync } from '@/lib/data/use-async';

const STATUS_LABEL: Record<EscalationStatus, string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
const STATUS_TONE: Record<EscalationStatus, 'yellow' | 'green' | 'red'> = {
  open: 'red',
  in_progress: 'yellow',
  resolved: 'green',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ConcernsScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const concerns = await getMyConcerns();
    const notes = await getNotesForConcerns(concerns.map((c) => c.id));
    return { concerns, notes };
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ConcernCategory>('other');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const concerns = data?.concerns ?? [];
  const notes = data?.notes ?? {};

  const onSubmit = async () => {
    if (!reason.trim()) {
      setFormError('Tell us what this is about first.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await raiseConcern({ reason: reason.trim(), description: description.trim() || null, category });
      setReason('');
      setDescription('');
      setCategory('other');
      setShowForm(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenScaffold title="My Concerns">
      <PrimaryButton size="lg" onPress={() => setShowForm((v) => !v)}>
        {showForm ? 'Cancel' : 'Raise a concern'}
      </PrimaryButton>

      {showForm && (
        <GlassCard>
          <SectionHeader title="What's going on?" />
          <TextField placeholder="Short summary" value={reason} onChangeText={setReason} accessibilityLabel="Concern summary" />

          <Text style={styles.label}>CATEGORY</Text>
          <View style={styles.chipRow}>
            {CONCERN_CATEGORIES.map((c) => (
              <Chip key={c.value} label={c.label} selected={c.value === category} onPress={() => setCategory(c.value)} />
            ))}
          </View>

          <TextInput
            style={styles.multilineInput}
            placeholder="Anything else we should know? (optional)"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={description}
            onChangeText={setDescription}
            multiline
            accessibilityLabel="Concern details"
          />

          {formError && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {formError}
            </Text>
          )}

          <PrimaryButton onPress={onSubmit} loading={submitting}>
            Submit
          </PrimaryButton>
        </GlassCard>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && concerns.length === 0 && <EmptyState message="No concerns raised yet." icon="alert-circle-outline" />}
      {!loading &&
        !error &&
        concerns.map((concern) => <ConcernCard key={concern.id} concern={concern} notes={notes[concern.id] ?? []} />)}
    </ScreenScaffold>
  );
}

function ConcernCard({ concern, notes }: { concern: Concern; notes: ConcernNote[] }) {
  const categoryLabel = CONCERN_CATEGORIES.find((c) => c.value === concern.category)?.label ?? concern.category;

  return (
    <GlassCard>
      <View style={styles.cardHeader}>
        <Text style={styles.dateLabel}>{formatDate(concern.created_at)}</Text>
        <Badge label={STATUS_LABEL[concern.status]} tone={STATUS_TONE[concern.status]} />
      </View>
      <Text style={styles.reasonText}>{concern.reason}</Text>
      {categoryLabel && <Text style={styles.dateLabel}>{categoryLabel}</Text>}
      {concern.description && <Text style={styles.bodyText}>{concern.description}</Text>}

      {concern.status === 'resolved' && concern.resolution_notes && (
        <View style={styles.resolutionBox}>
          <Text style={styles.label}>RESOLUTION</Text>
          <Text style={styles.bodyText}>{concern.resolution_notes}</Text>
        </View>
      )}

      {notes.length > 0 && (
        <View style={styles.notesBox}>
          <Text style={styles.label}>UPDATES</Text>
          {notes.map((n) => (
            <Text key={n.id} style={styles.bodyText}>
              {n.note}
            </Text>
          ))}
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: 'rgba(255,255,255,0.5)' },
  multilineInput: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    padding: 14,
    color: '#FFFFFF',
    minHeight: 70,
    backgroundColor: Brand.charcoal2,
    borderRadius: Radius.md,
    textAlignVertical: 'top',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2, marginBottom: 4 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  reasonText: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: '#FFFFFF' },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  resolutionBox: { marginTop: 8, gap: 2 },
  notesBox: { marginTop: 8, gap: 2 },
});
