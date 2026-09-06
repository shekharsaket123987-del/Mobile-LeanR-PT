/**
 * Client Detail — New PRD.md §4.B: "100% read-only — no forms/buttons
 * anywhere on this page" (mockup frame 4, minus its "Edit Details"
 * button, which has no backing here — see the coach-portal plan's
 * decision log). Overview/Plan/Sessions/Notes tabs. "View Journey" maps
 * to the session-history list below (this app's nearest real equivalent
 * to the web's 26-event-type `ClientTimeline` component, which doesn't
 * exist on mobile) rather than a separate action.
 *
 * Read-only banner shown when reached via Search and not actually
 * assigned — exact copy per PRD.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { LightAvatar } from '@/components/light/light-avatar';
import { LightBadge, LightStatusBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getCoachClientDetail, type DerivedClientStatus } from '@/lib/data/coach-clients';
import { useAsync } from '@/lib/data/use-async';

const STATUS_TONE: Record<DerivedClientStatus, 'teal' | 'green' | 'red' | 'gray'> = {
  active: 'green',
  paused: 'teal',
  created: 'teal',
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
function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type Tab = 'overview' | 'plan' | 'sessions' | 'notes';

export default function CoachClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: client, loading, error, reload } = useAsync(() => getCoachClientDetail(id), [id]);
  const [tab, setTab] = useState<Tab>('overview');

  if (loading) {
    return (
      <LightScreenScaffold title="Client Details">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }
  if (error || !client) {
    return (
      <LightScreenScaffold title="Client Details">
        <LightErrorState message={error ?? 'Client not found.'} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Client Details">
      {!client.isAssignedToMe && (
        <LightCard variant="teal">
          <Text style={styles.bannerText}>
            Read-only — this client isn&apos;t assigned to you, found via Global Search. Billing, progress, and session details
            are only visible to their assigned coach.
          </Text>
        </LightCard>
      )}

      <LightCard style={styles.headerCard}>
        <View style={styles.headerRow}>
          <LightAvatar photoUrl={client.photo_url} name={client.full_name} size={56} ring />
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{client.full_name}</Text>
            {client.client_code && <Text style={styles.code}>#{client.client_code}</Text>}
          </View>
          <LightBadge label={STATUS_LABEL[client.derivedStatus]} tone={STATUS_TONE[client.derivedStatus]} />
        </View>
      </LightCard>

      <LightSegmentedControl
        options={[
          { key: 'overview', label: 'Overview' },
          { key: 'plan', label: 'Plan' },
          { key: 'sessions', label: 'Sessions' },
          { key: 'notes', label: 'Notes' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <LightCard>
          <LightSectionHeader title="Overview" />
          <Row label="Phone" value={client.phone ?? '—'} />
          <Row label="Plan" value={client.planName ?? '—'} />
          <Row label="Start Date" value={formatDate(client.startDate)} />
          <Row label="Slot" value={client.slotSummary ?? '—'} />
          {client.sessionsTotal != null && <Row label="Sessions Used" value={`${client.sessionsUsed ?? 0} / ${client.sessionsTotal}`} />}
        </LightCard>
      )}

      {tab === 'plan' && (
        <LightCard>
          <LightSectionHeader title="Plan" />
          <Row label="Plan Name" value={client.planName ?? '—'} />
          <Row label="Start Date" value={formatDate(client.startDate)} />
          <Row label="Status" value={STATUS_LABEL[client.derivedStatus]} />
          {client.sessionsTotal != null && (
            <>
              <Row label="Sessions Used" value={String(client.sessionsUsed ?? 0)} />
              <Row label="Sessions Total" value={String(client.sessionsTotal)} />
            </>
          )}
        </LightCard>
      )}

      {tab === 'sessions' && (
        <>
          <LightSectionHeader title="Session History" />
          {client.sessionHistory.length === 0 && <LightEmptyState message="No sessions yet." icon="calendar-outline" />}
          {client.sessionHistory.map((b) => (
            <LightCard key={b.id} style={styles.sessionRow}>
              <Text style={styles.sessionTime}>{formatSessionTime(b.scheduled_start)}</Text>
              <LightStatusBadge status={b.status} />
            </LightCard>
          ))}
        </>
      )}

      {tab === 'notes' && (
        <>
          <LightSectionHeader title="Session Notes" />
          {client.sessionNotes.length === 0 && <LightEmptyState message="No session notes yet." icon="document-text-outline" />}
          {client.sessionNotes.map((n) => (
            <LightCard key={n.booking_id} style={styles.notesCard}>
              <Text style={styles.notesBody}>{n.notes}</Text>
              {n.exercises_performed && <Text style={styles.notesMeta}>Exercises: {n.exercises_performed}</Text>}
              {n.performance_rating && <Text style={styles.notesMeta}>Performance: {n.performance_rating}</Text>}
              {n.homework && <Text style={styles.notesMeta}>Homework: {n.homework}</Text>}
            </LightCard>
          ))}
        </>
      )}
    </LightScreenScaffold>
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

const styles = StyleSheet.create({
  bannerText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.tealDark, lineHeight: 19 },
  headerCard: { gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerInfo: { flex: 1, gap: 2 },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: LightBrand.navy },
  code: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textMuted },
  rowValue: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: LightBrand.navy, maxWidth: '60%' },
  sessionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionTime: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.navy },
  notesCard: { gap: 4 },
  notesBody: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: LightBrand.textPrimary },
  notesMeta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textSecondary },
});
