/**
 * Coach Dashboard — LEANR_PT_MOBILE_PRD.md §5 "day-at-a-glance stats +
 * Today's Tasks/Pending Tasks/Upcoming widgets", condensed to what this
 * phase built: today's bookings as tappable task rows into the session
 * workflow (§8b/§8c/§8d).
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
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function CoachDashboard() {
  const { data: bookings, loading, error, reload } = useAsync(() => getCoachBookings('today'), []);

  return (
    <ScreenScaffold title="Today's Tasks" subtitle={`${bookings?.length ?? 0} session${bookings?.length === 1 ? '' : 's'} today`}>
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (bookings?.length ?? 0) === 0 && <EmptyState message="No sessions today." icon="checkmark-circle-outline" />}
      {!loading &&
        !error &&
        bookings?.map((booking) => (
          <Pressable
            key={booking.id}
            onPress={() => router.push({ pathname: '/session/[id]', params: { id: booking.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Open session at ${formatSessionTime(booking.scheduled_start)}`}>
            <GlassCard variant="yellow">
              <View style={styles.row}>
                <Text style={styles.time}>{formatSessionTime(booking.scheduled_start)}</Text>
                <View style={styles.openRow}>
                  <Text style={styles.openLabel}>Open session</Text>
                  <Ionicons name="arrow-forward" size={15} color={Brand.yellow} />
                </View>
              </View>
            </GlassCard>
          </Pressable>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: '#FFFFFF' },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  openLabel: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.yellow },
});
