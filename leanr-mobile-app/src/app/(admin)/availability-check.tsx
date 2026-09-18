/**
 * Availability Check (admin) — New PRD.md §4.C "Screen: Availability
 * Check" — cross-coach, single-day view; date navigator; Booked/Free
 * filter pills; free slots show a `freeReason`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { ChipGrid } from '@/components/ui/chip-grid';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { getAvailabilityForDate } from '@/lib/data/admin-availability';
import { useAsync } from '@/lib/data/use-async';

function todayIso(): string {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return istNow.toISOString().slice(0, 10);
}
function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function AdminAvailabilityCheckScreen() {
  const [date, setDate] = useState(todayIso());
  const [filter, setFilter] = useState<'all' | 'booked' | 'free'>('all');
  const { data: slots, loading, error, reload } = useAsync(() => getAvailabilityForDate(date), [date]);

  const filtered = useMemo(() => {
    if (filter === 'all') return slots ?? [];
    return (slots ?? []).filter((s) => (filter === 'booked' ? s.booked : !s.booked));
  }, [slots, filter]);

  return (
    <ScreenScaffold title="Availability Check">
      <GlassCard style={styles.dateRow}>
        <Pressable onPress={() => setDate(addDays(date, -1))} accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={'#FFFFFF'} />
        </Pressable>
        <Text style={styles.dateLabel}>{formatDate(date)}</Text>
        <Pressable onPress={() => setDate(addDays(date, 1))} accessibilityRole="button" accessibilityLabel="Next day" hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={'#FFFFFF'} />
        </Pressable>
      </GlassCard>

      <ChipGrid>
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Booked" selected={filter === 'booked'} onPress={() => setFilter('booked')} />
        <Chip label="Free" selected={filter === 'free'} onPress={() => setFilter('free')} />
      </ChipGrid>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <EmptyState message="No slots to show." icon="calendar-outline" />}
      {!loading &&
        !error &&
        filtered.map((s, i) => (
          <GlassCard key={`${s.coachId}-${s.time}-${i}`} style={styles.slotRow}>
            <View>
              <Text style={styles.time}>{formatTime(s.time)}</Text>
              <Text style={styles.coach}>{s.coachName}</Text>
              {s.booked && s.clientName && <Text style={styles.client}>{s.clientName}</Text>}
              {!s.booked && s.freeReason && <Text style={styles.freeReason}>{s.freeReason}</Text>}
            </View>
            <Badge label={s.booked ? 'Booked' : 'Free'} tone={s.booked ? 'red' : 'green'} />
          </GlassCard>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateLabel: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFFFFF' },
  slotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: '#FFFFFF' },
  coach: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' },
  client: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: Brand.yellow, marginTop: 2 },
  freeReason: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
});
