/**
 * My Concerns — LEANR_PT_MOBILE_PRD.md §10 "My Concerns" row: raise a
 * concern, track its status. Resolution is admin-only (§3/§13 rule 22) —
 * this screen is read + raise only, matching the client's real
 * permissions (see src/lib/data/concerns.ts for the confirmed RLS). Not
 * purchase-gated — New PRD.md §2/§3.7 treat My Concerns as a plain
 * accessible client module with no subscription precondition, so this
 * screen is reachable by any client, not just enrolled ones (contrary to
 * the first mockup's "Not Available Until Purchase" annotation, which the
 * PRD overrides per prompt1.md's stated priority).
 *
 * Relit for the light theme (mockup frame 15) — added the Open/Resolved
 * segmented filter shown there; business logic unchanged.
 *
 * Reached from More ("My Concerns" row) — not a tab itself, hidden via
 * `href: null` in the (client) layout.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightTextField } from '@/components/light/light-text-field';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
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
import { getErrorMessage } from '@/lib/data/errors';

const STATUS_LABEL: Record<EscalationStatus, string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
const STATUS_TONE: Record<EscalationStatus, 'teal' | 'green' | 'red'> = {
  open: 'red',
  in_progress: 'teal',
  resolved: 'green',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type FilterTab = 'open' | 'resolved';

export default function ConcernsScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const concerns = await getMyConcerns();
    const notes = await getNotesForConcerns(concerns.map((c) => c.id));
    return { concerns, notes };
  }, []);

  const [tab, setTab] = useState<FilterTab>('open');
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ConcernCategory>('other');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const concerns = data?.concerns ?? [];
  const notes = data?.notes ?? {};

  const filtered = useMemo(
    () => concerns.filter((c) => (tab === 'resolved' ? c.status === 'resolved' : c.status !== 'resolved')),
    [concerns, tab]
  );

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
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LightScreenScaffold title="My Concerns">
      <LightPrimaryButton size="lg" onPress={() => setShowForm((v) => !v)}>
        {showForm ? 'Cancel' : 'Raise a concern'}
      </LightPrimaryButton>

      {showForm && (
        <LightCard>
          <LightSectionHeader title="What's going on?" />
          <LightTextField placeholder="Short summary" value={reason} onChangeText={setReason} accessibilityLabel="Concern summary" />

          <Text style={styles.label}>CATEGORY</Text>
          <LightChipGrid>
            {CONCERN_CATEGORIES.map((c) => (
              <LightChip key={c.value} label={c.label} selected={c.value === category} onPress={() => setCategory(c.value)} />
            ))}
          </LightChipGrid>

          <LightTextField
            placeholder="Anything else we should know? (optional)"
            value={description}
            onChangeText={setDescription}
            multiline
            style={styles.multilineInput}
            accessibilityLabel="Concern details"
          />

          {formError && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {formError}
            </Text>
          )}

          <LightPrimaryButton onPress={onSubmit} loading={submitting}>
            Submit
          </LightPrimaryButton>
        </LightCard>
      )}

      <LightSegmentedControl
        options={[
          { key: 'open', label: 'Open' },
          { key: 'resolved', label: 'Resolved' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <LightEmptyState message={`No ${tab} concerns.`} icon="alert-circle-outline" />}
      {!loading && !error && filtered.map((concern) => <ConcernCard key={concern.id} concern={concern} notes={notes[concern.id] ?? []} />)}
    </LightScreenScaffold>
  );
}

function ConcernCard({ concern, notes }: { concern: Concern; notes: ConcernNote[] }) {
  const categoryLabel = CONCERN_CATEGORIES.find((c) => c.value === concern.category)?.label ?? concern.category;

  return (
    <LightCard>
      <View style={styles.cardHeader}>
        <Text style={styles.dateLabel}>
          {categoryLabel} · {formatDate(concern.created_at)}
        </Text>
        <LightBadge label={STATUS_LABEL[concern.status]} tone={STATUS_TONE[concern.status]} />
      </View>
      <Text style={styles.reasonText}>{concern.reason}</Text>
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
    </LightCard>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, letterSpacing: 0.8, color: LightBrand.textMuted },
  multilineInput: { minHeight: 70, textAlignVertical: 'top', paddingTop: 14 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: LightBrand.textMuted },
  reasonText: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: LightBrand.navy },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textSecondary, marginTop: 2 },
  resolutionBox: { marginTop: 8, gap: 2 },
  notesBox: { marginTop: 8, gap: 2 },
});
