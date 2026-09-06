/**
 * Coach Schedule — New PRD.md §4.B: Today/Upcoming/Past tabs over the
 * coach's own bookings (mockup frame 5). The PRD's Day/Week calendar
 * toggle is a further presentation layer on top of this same data — left
 * for a later pass; this stage's job is bringing the screen to the
 * mockup's baseline tabs + relighting it, not the calendar grid.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightStatusBadge } from '@/components/light/light-badge';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
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
    <LightScreenScaffold title="My Schedule">
      <LightSegmentedControl
        options={[
          { key: 'today', label: 'Today' },
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'past', label: 'Past' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && (bookings?.length ?? 0) === 0 && <LightEmptyState message={`No ${tab} sessions.`} icon="calendar-outline" />}
      {!loading &&
        !error &&
        bookings?.map((booking) => (
          <Pressable
            key={booking.id}
            onPress={() => router.push({ pathname: '/session/[id]', params: { id: booking.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Session at ${formatSessionTime(booking.scheduled_start)}`}>
            <LightCard style={styles.row}>
              <Text style={styles.time}>{formatSessionTime(booking.scheduled_start)}</Text>
              <LightStatusBadge status={booking.status} />
            </LightCard>
          </Pressable>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.navy },
});
