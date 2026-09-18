/**
 * Admin Sessions (master list) — New PRD.md §4.C. Coach + Status filters
 * (client-side), fixed sort (date desc, not user-controllable — matches
 * web). Row actions (upcoming only): reschedule + cancel — cancel has no
 * confirmation dialog on web either, reproduced as-is.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { GhostButton } from '@/components/ui/button';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { TextField } from '@/components/ui/text-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { cancelSessionAsAdmin, listAdminSessions, rescheduleSessionAsAdmin, type AdminSessionRow } from '@/lib/data/admin-sessions';
import { sessionTypeLabel } from '@/lib/data/bookings';
import { getErrorMessage } from '@/lib/data/errors';
import { useAsync } from '@/lib/data/use-async';

const STATUS_FILTERS = ['all', 'upcoming', 'completed', 'cancelled', 'missed'] as const;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AdminSessionsScreen() {
  const { data: sessions, loading, error, reload } = useAsync(listAdminSessions, []);
  const [coachQuery, setCoachQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newStart, setNewStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = coachQuery.trim().toLowerCase();
    return (sessions ?? []).filter((s) => {
      const matchesCoach = !q || (s.coach_name ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchesCoach && matchesStatus;
    });
  }, [sessions, coachQuery, statusFilter]);

  const onCancel = async (id: string) => {
    setRowError(null);
    setBusy(true);
    try {
      await cancelSessionAsAdmin(id, 'Cancelled by admin');
      reload();
    } catch (err) {
      setRowError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onReschedule = async (id: string) => {
    if (!newStart.trim()) return;
    setRowError(null);
    setBusy(true);
    try {
      await rescheduleSessionAsAdmin(id, new Date(newStart).toISOString());
      setEditingId(null);
      setNewStart('');
      reload();
    } catch (err) {
      setRowError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenScaffold title="Sessions">
      <TextField icon="search-outline" placeholder="Filter by coach name" value={coachQuery} onChangeText={setCoachQuery} />
      <ChipGrid>
        {STATUS_FILTERS.map((s) => (
          <Chip key={s} label={s === 'all' ? 'All' : s} selected={statusFilter === s} onPress={() => setStatusFilter(s)} />
        ))}
      </ChipGrid>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <EmptyState message="No sessions match." icon="calendar-outline" />}
      {!loading &&
        !error &&
        filtered.map((s: AdminSessionRow) => (
          <Pressable key={s.id} onPress={() => router.push({ pathname: '/admin-sessions/[id]', params: { id: s.id } })} accessibilityRole="button" accessibilityLabel={`Session with ${s.client_name}`}>
            <GlassCard style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.title}>{formatDateTime(s.scheduled_start)}</Text>
                <StatusBadge status={s.status} />
              </View>
              <Text style={styles.meta}>
                {s.client_name} · {s.coach_name}
              </Text>
              <Text style={styles.typeText}>
                {sessionTypeLabel(s.session_type)}
                {s.session_type === 'assessment' && s.amount_paid != null ? ` · ₹${s.amount_paid}` : ''}
              </Text>
              {s.status === 'upcoming' && (
                <View style={styles.actionRow}>
                  <GhostButton size="sm" onPress={() => setEditingId(editingId === s.id ? null : s.id)}>
                    Reschedule
                  </GhostButton>
                  <GhostButton size="sm" onPress={() => onCancel(s.id)} disabled={busy}>
                    Cancel
                  </GhostButton>
                </View>
              )}
              {editingId === s.id && (
                <View style={styles.rescheduleRow}>
                  <View style={styles.rescheduleField}>
                    <TextField placeholder="YYYY-MM-DDTHH:MM" value={newStart} onChangeText={setNewStart} accessibilityLabel="New start time" />
                  </View>
                  <GhostButton size="sm" loading={busy} onPress={() => onReschedule(s.id)}>
                    Save
                  </GhostButton>
                </View>
              )}
              {rowError && editingId === s.id && <Text style={styles.errorText}>{rowError}</Text>}
            </GlassCard>
          </Pressable>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFFFFF' },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' },
  typeText: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rescheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rescheduleField: { flex: 1 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: Brand.alertRed },
});
