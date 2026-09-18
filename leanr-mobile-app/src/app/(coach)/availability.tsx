/**
 * Coach Availability — New PRD.md §4.B: view-only weekly hours
 * (admin-set — RLS has no coach INSERT/UPDATE policy on
 * `coach_availability` at all, so this is read-only by database
 * enforcement, not just a UI choice). The leave-request flow that used
 * to live on this same screen is now its own "Leave Requests" screen
 * (mockup frames 9/10 are two separate screens/nav tiles, not one),
 * reached from More.
 */
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/button';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { dayName, getMyWeeklyAvailability } from '@/lib/data/coach-availability';
import { useAsync } from '@/lib/data/use-async';

function formatTimeRange(start: string, end: string) {
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
}

export default function CoachAvailabilityScreen() {
  const { data: weekly, loading, error, reload } = useAsync(getMyWeeklyAvailability, []);

  const byDay = new Map<number, typeof weekly>();
  for (const row of weekly ?? []) {
    const existing = byDay.get(row.day_of_week);
    if (existing) existing.push(row);
    else byDay.set(row.day_of_week, [row]);
  }

  return (
    <ScreenScaffold title="Availability">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <GlassCard>
            <SectionHeader title="Your weekly hours" />
            {(weekly?.length ?? 0) === 0 && <EmptyState message="No working hours set by admin yet." icon="time-outline" />}
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
              const rows = byDay.get(dow);
              if (!rows || rows.length === 0) return null;
              return (
                <Text key={dow} style={styles.bodyText}>
                  {dayName(dow)}: {rows.map((r) => formatTimeRange(r.start_time, r.end_time)).join(', ')}
                </Text>
              );
            })}
            <Text style={styles.hint}>Only admin can change your working hours.</Text>
          </GlassCard>

          <PrimaryButton size="lg" onPress={() => router.push('/leave-requests')}>
            Manage Leave Requests
          </PrimaryButton>
        </>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#FFFFFF', marginTop: 4 },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginTop: 10 },
});
