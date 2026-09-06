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

import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
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
    <LightScreenScaffold title="Availability">
      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <LightCard>
            <LightSectionHeader title="Your weekly hours" />
            {(weekly?.length ?? 0) === 0 && <LightEmptyState message="No working hours set by admin yet." icon="time-outline" />}
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
          </LightCard>

          <LightPrimaryButton size="lg" onPress={() => router.push('/leave-requests')}>
            Manage Leave Requests
          </LightPrimaryButton>
        </>
      )}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  bodyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textPrimary, marginTop: 4 },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted, marginTop: 10 },
});
