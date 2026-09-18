/**
 * Coach Schedule — New PRD.md §4.B: Today/Upcoming/Past tabs over the
 * coach's own bookings (mockup frame 5). The PRD's Day/Week calendar
 * toggle is a further presentation layer on top of this same data — left
 * for a later pass; this stage's job is bringing the screen to the
 * mockup's baseline tabs + relighting it, not the calendar grid.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { sessionTypeLabel } from '@/lib/data/bookings';
import { getCoachBookings } from '@/lib/data/coach-portal';
import { useAsync } from '@/lib/data/use-async';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type Tab = 'today' | 'upcoming' | 'past';

export default function CoachSchedule() {
  const [tab, setTab] = useState<Tab>('today');
  const { data: bookings, loading, error, reload } = useAsync(() => getCoachBookings(tab), [tab]);

  return (
    <ScreenScaffold title="My Schedule">
      <SegmentedControl
        options={[
          { key: 'today', label: 'Today' },
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'past', label: 'Past' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (bookings?.length ?? 0) === 0 && <EmptyState message={`No ${tab} sessions.`} icon="calendar-outline" />}
      {!loading &&
        !error &&
        bookings?.map((booking) => (
          <Pressable
            key={booking.id}
            onPress={() => router.push({ pathname: '/session/[id]', params: { id: booking.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Session at ${formatSessionTime(booking.scheduled_start)}`}>
            <GlassCard style={styles.row}>
              <View>
                <Text style={styles.time}>{formatSessionTime(booking.scheduled_start)}</Text>
                <Text style={styles.sessionType}>{sessionTypeLabel(booking.session_type)}</Text>
              </View>
              <StatusBadge status={booking.status} />
            </GlassCard>
          </Pressable>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFFFFF' },
  sessionType: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
});
