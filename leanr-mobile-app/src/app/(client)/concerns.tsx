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
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton } from '@/components/tappable';
import { Brand, Colors } from '@/constants/theme';
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
const STATUS_COLOR: Record<EscalationStatus, string> = {
  open: Brand.streakEmberStart,
  in_progress: Brand.yellow,
  resolved: Brand.successEmerald,
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
      <CtaButton onPress={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Raise a Concern'}</CtaButton>

      {showForm && (
        <Card>
          <Text style={shared.cardLabel}>WHAT&apos;S GOING ON?</Text>
          <TextInput
            style={styles.input}
            placeholder="Short summary"
            value={reason}
            onChangeText={setReason}
            accessibilityLabel="Concern summary"
          />

          <Text style={shared.cardLabel}>CATEGORY</Text>
          <View style={styles.chipRow}>
            {CONCERN_CATEGORIES.map((c) => (
              <Chip key={c.value} label={c.label} selected={c.value === category} onPress={() => setCategory(c.value)} />
            ))}
          </View>

          <Text style={shared.cardLabel}>DETAILS (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Anything else we should know?"
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

          <CtaButton onPress={onSubmit} loading={submitting}>
            Submit
          </CtaButton>
        </Card>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && concerns.length === 0 && <EmptyState message="No concerns raised yet." />}
      {!loading &&
        !error &&
        concerns.map((concern) => <ConcernCard key={concern.id} concern={concern} notes={notes[concern.id] ?? []} />)}
    </ScreenScaffold>
  );
}

function ConcernCard({ concern, notes }: { concern: Concern; notes: ConcernNote[] }) {
  const categoryLabel = CONCERN_CATEGORIES.find((c) => c.value === concern.category)?.label ?? concern.category;

  return (
    <Card>
      <View style={styles.cardHeader}>
        <Text style={shared.cardLabel}>{formatDate(concern.created_at)}</Text>
        <Text style={[styles.statusChip, { color: STATUS_COLOR[concern.status] }]}>{STATUS_LABEL[concern.status]}</Text>
      </View>
      <Text style={shared.bigStat}>{concern.reason}</Text>
      {categoryLabel && <Text style={shared.cardLabel}>{categoryLabel}</Text>}
      {concern.description && <Text style={styles.bodyText}>{concern.description}</Text>}

      {concern.status === 'resolved' && concern.resolution_notes && (
        <View style={styles.resolutionBox}>
          <Text style={shared.cardLabel}>RESOLUTION</Text>
          <Text style={styles.bodyText}>{concern.resolution_notes}</Text>
        </View>
      )}

      {notes.length > 0 && (
        <View style={styles.notesBox}>
          <Text style={shared.cardLabel}>UPDATES</Text>
          {notes.map((n) => (
            <Text key={n.id} style={styles.bodyText}>
              {n.note}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.chip, { backgroundColor: selected ? Brand.yellow : colors.backgroundElement }]}>
      <Text style={[styles.chipLabel, { color: selected ? Brand.black : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    paddingVertical: 8,
    color: Brand.charcoal2,
  },
  multiline: { minHeight: 60 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 4 },
  chip: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  chipLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusChip: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, marginTop: 2 },
  resolutionBox: { marginTop: 8, gap: 2 },
  notesBox: { marginTop: 8, gap: 2 },
});
