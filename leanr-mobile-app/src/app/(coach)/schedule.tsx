/**
 * Coach Schedule — LEANR_PT_MOBILE_PRD.md §5 "Day/Week toggle of
 * bookings". This phase builds the upcoming-bookings list; the day/week
 * toggle itself is a presentation detail left for a later pass.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { GlassCard } from '@/components/ui/glass-card';
import { Brand } from '@/constants/theme';
import { getCoachBookings } from '@/lib/data/coach-portal';
import { useAsync } from '@/lib/data/use-async';

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CoachSchedule() {
  const { data: bookings, loading, error, reload } = useAsync(() => getCoachBookings('upcoming'), []);

  return (
    <ScreenScaffold title="Schedule">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (bookings?.length ?? 0) === 0 && <EmptyState message="No upcoming bookings." icon="calendar-outline" />}
      {!loading &&
        !error &&
        bookings?.map((booking) => (
          <Pressable
            key={booking.id}
            onPress={() => router.push({ pathname: '/session/[id]', params: { id: booking.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Session at ${formatSessionTime(booking.scheduled_start)}`}>
            <GlassCard>
              <View style={styles.row}>
                <Text style={styles.time}>{formatSessionTime(booking.scheduled_start)}</Text>
                <Ionicons name="chevron-forward" size={18} color={Brand.yellow} />
              </View>
            </GlassCard>
          </Pressable>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFFFFF' },
});
