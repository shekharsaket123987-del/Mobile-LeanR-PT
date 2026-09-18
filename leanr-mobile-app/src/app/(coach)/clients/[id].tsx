/**
 * Client Detail — New PRD.md §4.B: "100% read-only — no forms/buttons
 * anywhere on this page" (mockup frame 4, minus its "Edit Details"
 * button, which has no backing here — see the coach-portal plan's
 * decision log). Overview/Plan/Timeline/Sessions/Notes tabs.
 *
 * "Progress Timeline" tab (mobile-app-reference/audit/timeline.md §4):
 * the shared `ClientTimeline` component, same as the admin Client Detail
 * screen's "Client Journey Timeline" section — a coach sees this in full
 * for their own linked clients, or read-only (via the banner below) for
 * any other client found via Global Search; RLS (`timeline_select_by_any_coach`)
 * is what actually widens the read, not a separate mode in the component itself.
 *
 * Read-only banner shown when reached via Search and not actually
 * assigned — exact copy per PRD.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { ClientTimeline } from '@/components/client-timeline';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { getCoachClientDetail, type DerivedClientStatus } from '@/lib/data/coach-clients';
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
function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type Tab = 'overview' | 'plan' | 'timeline' | 'sessions' | 'notes';

export default function CoachClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: client, loading, error, reload } = useAsync(() => getCoachClientDetail(id), [id]);
  const [tab, setTab] = useState<Tab>('overview');

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
      {!client.isAssignedToMe && (
        <GlassCard variant="yellow">
          <Text style={styles.bannerText}>
            Read-only — this client isn&apos;t assigned to you, found via Global Search. Billing, progress, and session details
            are only visible to their assigned coach.
          </Text>
        </GlassCard>
      )}

      <GlassCard style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Avatar photoUrl={client.photo_url} name={client.full_name} size={56} ring />
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{client.full_name}</Text>
            {client.client_code && <Text style={styles.code}>#{client.client_code}</Text>}
          </View>
          <Badge label={STATUS_LABEL[client.derivedStatus]} tone={STATUS_TONE[client.derivedStatus]} />
        </View>
      </GlassCard>

      <SegmentedControl
        options={[
          { key: 'overview', label: 'Overview' },
          { key: 'plan', label: 'Plan' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'sessions', label: 'Sessions' },
          { key: 'notes', label: 'Notes' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <GlassCard>
          <SectionHeader title="Overview" />
          <Row label="Phone" value={client.phone ?? '—'} />
          <Row label="Plan" value={client.planName ?? '—'} />
          <Row label="Start Date" value={formatDate(client.startDate)} />
          <Row label="Slot" value={client.slotSummary ?? '—'} />
          {client.sessionsTotal != null && <Row label="Sessions Used" value={`${client.sessionsUsed ?? 0} / ${client.sessionsTotal}`} />}
        </GlassCard>
      )}

      {tab === 'plan' && (
        <GlassCard>
          <SectionHeader title="Plan" />
          <Row label="Plan Name" value={client.planName ?? '—'} />
          <Row label="Start Date" value={formatDate(client.startDate)} />
          <Row label="Status" value={STATUS_LABEL[client.derivedStatus]} />
          {client.sessionsTotal != null && (
            <>
              <Row label="Sessions Used" value={String(client.sessionsUsed ?? 0)} />
              <Row label="Sessions Total" value={String(client.sessionsTotal)} />
            </>
          )}
        </GlassCard>
      )}

      {tab === 'timeline' && (
        <>
          <SectionHeader title="Progress Timeline" />
          <ClientTimeline clientId={id} />
        </>
      )}

      {tab === 'sessions' && (
        <>
          <SectionHeader title="Session History" />
          {client.sessionHistory.length === 0 && <EmptyState message="No sessions yet." icon="calendar-outline" />}
          {client.sessionHistory.map((b) => (
            <GlassCard key={b.id} style={styles.sessionRow}>
              <Text style={styles.sessionTime}>{formatSessionTime(b.scheduled_start)}</Text>
              <StatusBadge status={b.status} />
            </GlassCard>
          ))}
        </>
      )}

      {tab === 'notes' && (
        <>
          <SectionHeader title="Session Notes" />
          {client.sessionNotes.length === 0 && <EmptyState message="No session notes yet." icon="document-text-outline" />}
          {client.sessionNotes.map((n) => (
            <GlassCard key={n.booking_id} style={styles.notesCard}>
              <Text style={styles.notesBody}>{n.notes}</Text>
              {n.exercises_performed && <Text style={styles.notesMeta}>Exercises: {n.exercises_performed}</Text>}
              {n.performance_rating && <Text style={styles.notesMeta}>Performance: {n.performance_rating}</Text>}
              {n.homework && <Text style={styles.notesMeta}>Homework: {n.homework}</Text>}
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

const styles = StyleSheet.create({
  bannerText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#FFFFFF', lineHeight: 19 },
  headerCard: { gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerInfo: { flex: 1, gap: 2 },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: '#FFFFFF' },
  code: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.45)' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.45)' },
  rowValue: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#FFFFFF', maxWidth: '60%' },
  sessionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionTime: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#FFFFFF' },
  notesCard: { gap: 4 },
  notesBody: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  notesMeta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' },
});
