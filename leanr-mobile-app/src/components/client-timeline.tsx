/**
 * ClientTimeline — mobile-app-reference/audit/timeline.md §7.3, ported from
 * the web's `ClientTimeline.tsx` onto this app's light design system.
 * Shared by both the Admin Client Detail and Coach Client Detail screens
 * (§4) — a client never sees this component.
 *
 * Data shape (side/actor_source/actor_name resolution) comes fully resolved
 * from `listClientTimeline()` — this file is a pure display layer, same
 * split as the web version.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightBottomSheet } from '@/components/light/light-bottom-sheet';
import { LightCard } from '@/components/light/light-card';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getMeasurementStatusForClient } from '@/lib/data/measurement-status';
import { listClientTimeline, type TimelineEventRow, type TimelineEventType, type TimelineSide } from '@/lib/data/timeline';
import { useAsync } from '@/lib/data/use-async';

const PAGE_SIZE = 20;
// Pragmatic bound: the web fetches a client's full timeline in one shot and paginates
// purely client-side; on mobile we cap the initial fetch instead of an unbounded query,
// generous enough that no realistic client account should ever hit it.
const FETCH_CAP = 500;

const EVENT_ICONS: Record<TimelineEventType, keyof typeof Ionicons.glyphMap> = {
  plan_purchased: 'bag-outline',
  plan_activated: 'play-circle-outline',
  onboarding_completed: 'clipboard-outline',
  coach_assigned: 'person-add-outline',
  slot_assigned: 'calendar-outline',
  session_completed: 'checkmark-circle-outline',
  attendance_marked_present: 'shield-checkmark-outline',
  session_missed: 'close-circle-outline',
  session_cancelled: 'close-circle-outline',
  coach_notes_uploaded: 'create-outline',
  weekly_measurements_updated: 'scale-outline',
  client_raised_concern: 'chatbox-ellipses-outline',
  escalation_created: 'alert-circle-outline',
  escalation_resolved: 'checkmark-done-outline',
  pause_started: 'pause-circle-outline',
  pause_ended: 'play-circle-outline',
  coach_changed: 'person-outline',
  shadow_coach_assigned: 'people-outline',
  manual_session_added: 'calendar-outline',
  session_rescheduled: 'refresh-outline',
  plan_extended: 'trending-up-outline',
  plan_reduced: 'trending-down-outline',
  plan_renewed: 'refresh-circle-outline',
  refund_requested: 'cash-outline',
  refund_approved: 'cash-outline',
  plan_completed: 'checkmark-done-outline',
  plan_promise_adjusted: 'gift-outline',
  client_status_changed: 'swap-horizontal-outline',
};

const EVENT_LABELS: Record<TimelineEventType, string> = {
  plan_purchased: 'Subscription purchased',
  plan_activated: 'Subscription activated',
  onboarding_completed: 'Onboarding completed',
  coach_assigned: 'Coach assigned',
  slot_assigned: 'Schedule set',
  session_completed: 'Session done (present)',
  attendance_marked_present: 'Attendance marked',
  session_missed: 'Session done (absent)',
  session_cancelled: 'Session cancelled',
  coach_notes_uploaded: 'Session note updated',
  weekly_measurements_updated: 'Measurement logged',
  client_raised_concern: 'Concern raised',
  escalation_created: 'Support ticket created',
  escalation_resolved: 'Support ticket closed',
  pause_started: 'Subscription paused',
  pause_ended: 'Subscription resumed',
  coach_changed: 'Coach changed',
  shadow_coach_assigned: 'Shadow coach assigned',
  manual_session_added: 'Session added',
  session_rescheduled: 'Session rescheduled',
  plan_extended: 'Plan extended',
  plan_reduced: 'Plan reduced',
  plan_renewed: 'Plan renewed',
  refund_requested: 'Refund requested',
  refund_approved: 'Refund approved',
  plan_completed: 'Plan completed',
  plan_promise_adjusted: 'Pause days adjusted',
  client_status_changed: 'Client status changed',
};

function formatHeaderDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatHeaderTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Groups by minute -- same rendered date+time header means no repeat, matching web's timestampKey. */
function timestampKey(iso: string): string {
  return `${formatHeaderDate(iso)} ${formatHeaderTime(iso)}`;
}

function addedByLabel(event: TimelineEventRow): string {
  if (event.actor_source === 'system') return 'SYSTEM';
  if (event.actor_source === 'unknown') return 'N/A';
  return event.actor_name ?? 'N/A';
}

/** RN Text already respects literal \n as real line breaks, so unlike the web
 * version this doesn't need a per-line Fragment split -- just strip stray HTML
 * (never rendered as markup) and convert <br> variants to \n. */
function cleanDescription(text: string): string {
  return text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[a-z][^>]*>/gi, '');
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface TimestampGroup {
  key: string;
  date: string;
  time: string;
  events: TimelineEventRow[];
}

function groupByTimestamp(events: TimelineEventRow[]): TimestampGroup[] {
  const groups: TimestampGroup[] = [];
  for (const event of events) {
    const key = timestampKey(event.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.events.push(event);
    } else {
      groups.push({ key, date: formatHeaderDate(event.created_at), time: formatHeaderTime(event.created_at), events: [event] });
    }
  }
  return groups;
}

function IconBadge({ type, side }: { type: TimelineEventType; side: TimelineSide }) {
  const iconName = EVENT_ICONS[type] ?? 'time-outline';
  return (
    <View style={[styles.iconBadge, { backgroundColor: side === 'internal' ? LightBrand.teal : LightBrand.amber }]}>
      <Ionicons name={iconName} size={16} color="#FFFFFF" />
    </View>
  );
}

function EventCard({ event, onExpand }: { event: TimelineEventRow; onExpand: (event: TimelineEventRow) => void }) {
  const hasDetail = !!event.metadata && Object.keys(event.metadata).length > 0;
  const accentColor = event.side === 'internal' ? LightBrand.teal : LightBrand.amber;

  return (
    <LightCard style={[styles.eventCard, { borderColor: accentColor + '40' }]}>
      <Pressable onPress={hasDetail ? () => onExpand(event) : undefined} disabled={!hasDetail} accessibilityRole={hasDetail ? 'button' : undefined} style={styles.eventCardHeader}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        {hasDetail && <Ionicons name="chevron-forward" size={16} color={LightBrand.textMuted} />}
      </Pressable>
      {event.description && <Text style={styles.eventDescription}>{cleanDescription(event.description)}</Text>}
      <View style={styles.eventDivider} />
      <Text style={[styles.addedBy, { color: accentColor }]}>Added by: {addedByLabel(event)}</Text>
    </LightCard>
  );
}

function DetailSheet({ event, onClose }: { event: TimelineEventRow | null; onClose: () => void }) {
  const entries = Object.entries(event?.metadata ?? {});
  return (
    <LightBottomSheet visible={!!event} onClose={onClose} title={event?.title} subtitle={event ? `${formatHeaderDate(event.created_at)} · ${formatHeaderTime(event.created_at)}` : undefined}>
      {event?.description && <Text style={styles.detailDescription}>{cleanDescription(event.description)}</Text>}
      {entries.map(([key, value]) => (
        <View key={key} style={styles.detailRow}>
          <Text style={styles.detailKey}>{humanizeKey(key)}</Text>
          <Text style={styles.detailValue}>{String(value)}</Text>
        </View>
      ))}
    </LightBottomSheet>
  );
}

export function ClientTimeline({ clientId }: { clientId: string }) {
  const { data, loading, error, reload } = useAsync(async () => {
    const [events, measurement] = await Promise.all([
      listClientTimeline(clientId, { limit: FETCH_CAP }),
      getMeasurementStatusForClient(clientId),
    ]);
    return { events, measurement };
  }, [clientId]);

  const [mode, setMode] = useState<'split' | 'merged'>('split');
  const [filterType, setFilterType] = useState<TimelineEventType | 'all'>('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<TimelineEventRow | null>(null);

  const events = useMemo(() => data?.events ?? [], [data]);

  const availableTypes = useMemo(() => {
    const seen = new Set<TimelineEventType>();
    events.forEach((e) => seen.add(e.event_type));
    return Array.from(seen);
  }, [events]);

  const filtered = useMemo(() => (filterType === 'all' ? events : events.filter((e) => e.event_type === filterType)), [events, filterType]);

  const onSelectFilter = (type: TimelineEventType | 'all') => {
    setFilterType(type);
    setVisibleCount(PAGE_SIZE);
    setFilterSheetOpen(false);
  };

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const groups = useMemo(() => groupByTimestamp(visible), [visible]);

  if (loading) return <LightLoadingState />;
  if (error) return <LightErrorState message={error} onRetry={reload} />;

  return (
    <View style={styles.root}>
      {data?.measurement.stale && (
        <LightCard style={styles.staleBanner}>
          <Ionicons name="alert-circle" size={16} color={LightBrand.alertRed} />
          <Text style={styles.staleText}>
            Measurements overdue
            {data.measurement.lastLoggedAt ? ` — last updated ${formatHeaderDate(data.measurement.lastLoggedAt)}` : ' — never logged'}.
          </Text>
        </LightCard>
      )}

      <View style={styles.controlsRow}>
        <View style={styles.modeToggle}>
          <LightSegmentedControl
            options={[
              { key: 'split', label: 'Split view' },
              { key: 'merged', label: 'Merged view' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </View>
        <Pressable onPress={() => setFilterSheetOpen(true)} style={styles.filterButton} accessibilityRole="button">
          <Text style={styles.filterButtonText} numberOfLines={1}>
            {filterType === 'all' ? 'All events' : EVENT_LABELS[filterType]}
          </Text>
          <Ionicons name="chevron-down" size={14} color={LightBrand.textSecondary} />
        </Pressable>
      </View>

      {filtered.length === 0 && <LightEmptyState message="No activity logged yet." icon="time-outline" />}

      {mode === 'split' ? (
        <View style={styles.splitContainer}>
          <View style={styles.splitDivider} />
          <View style={styles.splitHeaderRow}>
            <Text style={styles.splitHeaderLabel}>LEANR Event</Text>
            <Text style={styles.splitHeaderLabel}>Customer Event</Text>
          </View>
          {groups.map((group) => (
            <View key={group.key} style={styles.group}>
              <View style={styles.groupHeaderRow}>
                <Text style={styles.groupHeaderText}>{group.date}</Text>
                <Text style={styles.groupHeaderText}>{group.time}</Text>
              </View>
              {group.events.map((event) => (
                <View key={event.id} style={styles.splitRow}>
                  <View style={styles.splitColumn}>{event.side === 'internal' && <EventCard event={event} onExpand={setExpanded} />}</View>
                  <View style={styles.splitIconCol}>
                    <IconBadge type={event.event_type} side={event.side} />
                  </View>
                  <View style={styles.splitColumn}>{event.side === 'customer' && <EventCard event={event} onExpand={setExpanded} />}</View>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View>
          {groups.map((group) => (
            <View key={group.key} style={styles.group}>
              <View style={styles.groupHeaderRow}>
                <Text style={styles.groupHeaderText}>{group.date}</Text>
                <Text style={styles.groupHeaderText}>{group.time}</Text>
              </View>
              {group.events.map((event) => (
                <View key={event.id} style={styles.mergedRow}>
                  <IconBadge type={event.event_type} side={event.side} />
                  <View style={styles.mergedCard}>
                    <EventCard event={event} onExpand={setExpanded} />
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {hasMore && (
        <Pressable onPress={() => setVisibleCount((c) => c + PAGE_SIZE)} style={styles.loadMore} accessibilityRole="button">
          <Text style={styles.loadMoreText}>Load more…</Text>
        </Pressable>
      )}

      <LightBottomSheet visible={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} title="Filter by event type">
        <Pressable onPress={() => onSelectFilter('all')} style={styles.filterOption} accessibilityRole="button">
          <Text style={styles.filterOptionText}>All events</Text>
          {filterType === 'all' && <Ionicons name="checkmark" size={16} color={LightBrand.teal} />}
        </Pressable>
        {availableTypes.map((type) => (
          <Pressable key={type} onPress={() => onSelectFilter(type)} style={styles.filterOption} accessibilityRole="button">
            <Text style={styles.filterOptionText}>{EVENT_LABELS[type] ?? type}</Text>
            {filterType === type && <Ionicons name="checkmark" size={16} color={LightBrand.teal} />}
          </Pressable>
        ))}
      </LightBottomSheet>

      <DetailSheet event={expanded} onClose={() => setExpanded(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  staleBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderColor: LightBrand.alertRed + '4D', backgroundColor: LightBrand.alertRed + '0D' },
  staleText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: LightBrand.alertRed },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modeToggle: { flex: 1 },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 150,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LightBrand.border,
  },
  filterButtonText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.textSecondary, flexShrink: 1 },
  splitContainer: { position: 'relative' },
  splitDivider: { position: 'absolute', top: 28, bottom: 0, left: '50%', width: StyleSheet.hairlineWidth, backgroundColor: LightBrand.border },
  splitHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  splitHeaderLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10.5, letterSpacing: 0.6, color: LightBrand.textMuted, textTransform: 'uppercase' },
  group: { marginBottom: 18 },
  groupHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  groupHeaderText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: LightBrand.textSecondary },
  splitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  splitColumn: { flex: 1 },
  splitIconCol: { width: 32, alignItems: 'center', paddingTop: 2 },
  mergedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  mergedCard: { flex: 1 },
  iconBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  eventCard: { gap: 4, padding: 12 },
  eventCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  eventTitle: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: LightBrand.textPrimary },
  eventDescription: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textSecondary, lineHeight: 18 },
  eventDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LightBrand.border, marginTop: 2 },
  addedBy: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  loadMore: { alignSelf: 'center', paddingVertical: 8 },
  loadMoreText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: LightBrand.textMuted },
  filterOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LightBrand.border },
  filterOptionText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: LightBrand.textPrimary },
  detailDescription: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textSecondary, lineHeight: 20, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LightBrand.border },
  detailKey: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.textMuted, flexShrink: 1 },
  detailValue: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.textPrimary, flexShrink: 1, textAlign: 'right' },
});
