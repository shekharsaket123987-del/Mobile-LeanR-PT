/**
 * Availability Check (admin) — New PRD.md §4.C "Screen: Availability
 * Check" — cross-coach, single-day view; date navigator; Booked/Free
 * filter pills; free slots show a `freeReason`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
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
    <LightScreenScaffold title="Availability Check">
      <LightCard style={styles.dateRow}>
        <Pressable onPress={() => setDate(addDays(date, -1))} accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={LightBrand.navy} />
        </Pressable>
        <Text style={styles.dateLabel}>{formatDate(date)}</Text>
        <Pressable onPress={() => setDate(addDays(date, 1))} accessibilityRole="button" accessibilityLabel="Next day" hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={LightBrand.navy} />
        </Pressable>
      </LightCard>

      <LightChipGrid>
        <LightChip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <LightChip label="Booked" selected={filter === 'booked'} onPress={() => setFilter('booked')} />
        <LightChip label="Free" selected={filter === 'free'} onPress={() => setFilter('free')} />
      </LightChipGrid>

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <LightEmptyState message="No slots to show." icon="calendar-outline" />}
      {!loading &&
        !error &&
        filtered.map((s, i) => (
          <LightCard key={`${s.coachId}-${s.time}-${i}`} style={styles.slotRow}>
            <View>
              <Text style={styles.time}>{formatTime(s.time)}</Text>
              <Text style={styles.coach}>{s.coachName}</Text>
              {s.booked && s.clientName && <Text style={styles.client}>{s.clientName}</Text>}
              {!s.booked && s.freeReason && <Text style={styles.freeReason}>{s.freeReason}</Text>}
            </View>
            <LightBadge label={s.booked ? 'Booked' : 'Free'} tone={s.booked ? 'red' : 'green'} />
          </LightCard>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateLabel: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.navy },
  slotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: LightBrand.navy },
  coach: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.textSecondary },
  client: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: LightBrand.tealDark, marginTop: 2 },
  freeReason: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: LightBrand.textMuted, marginTop: 2 },
});
