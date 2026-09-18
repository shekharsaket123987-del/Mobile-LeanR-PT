/**
 * Admin Dashboard — New PRD.md §4.C "Screen: Dashboard" — 12 KPI stat
 * cards + Revenue Trend + coach-utilization mini-bars + Bookings-by-Hour,
 * all sourced live (admin-dashboard.ts). No filters/search/buttons — the
 * web screen itself is read-only.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { getAdminDashboard } from '@/lib/data/admin-dashboard';
import { useAsync } from '@/lib/data/use-async';

function formatHour(hour: number | null): string {
  if (hour === null) return '—';
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}
function formatCurrency(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short' });
}

export default function AdminDashboardScreen() {
  const { data, loading, error, reload } = useAsync(getAdminDashboard, []);

  return (
    <ScreenScaffold title="Good Morning, Admin!" subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
      <Pressable onPress={() => router.push('/admin-search')} accessibilityRole="button" accessibilityLabel="Search clients, coaches, or plans">
        <GlassCard style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={'rgba(255,255,255,0.45)'} />
          <Text style={styles.searchPlaceholder}>Search clients, coaches, plans…</Text>
        </GlassCard>
      </Pressable>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && data && (
        <>
          <View style={styles.grid}>
            <StatTile value={String(data.totalClients)} label="TOTAL CLIENTS" />
            <StatTile value={String(data.activeClients)} label="ACTIVE CLIENTS" emphasize />
            <StatTile value={String(data.sessionsToday)} label="SESSIONS TODAY" />
            <StatTile value={String(data.cancelledToday)} label="CANCELLED TODAY" />
            <StatTile value={data.trainerUtilizationPct !== null ? `${data.trainerUtilizationPct.toFixed(0)}%` : '—'} label="TRAINER UTILIZATION" />
            <StatTile value={formatHour(data.peakBookingHour)} label="PEAK BOOKING HOUR" />
            <StatTile value={String(data.emptySlotsToday)} label="EMPTY SLOTS TODAY" />
            <StatTile value={formatCurrency(data.revenueThisMonth)} label="REVENUE THIS MONTH" emphasize />
            <StatTile value={String(data.activeCoaches)} label="ACTIVE COACHES" />
            <StatTile value={data.avgCoachRating !== null ? data.avgCoachRating.toFixed(1) : '—'} label="AVG COACH RATING" />
            <StatTile value={data.avgSessionsPerDay.toFixed(1)} label="AVG SESSIONS/DAY" />
            <StatTile value={String(data.avgSessionsPerClient)} label="AVG SESSIONS/CLIENT" />
            <StatTile
              value={data.renewalRatePct !== null ? `${data.renewalRatePct.toFixed(0)}%` : '—'}
              label="RENEWAL RATE"
              emphasize
            />
            <StatTile value={String(data.renewalOpportunityCount)} label="RENEWAL OPPORTUNITIES" />
          </View>

          <SectionHeader title="Revenue Trend" eyebrow="LAST 6 MONTHS" />
          <GlassCard style={styles.chartCard}>
            <View style={styles.barRow}>
              {data.revenueTrend.map((r) => {
                const max = Math.max(1, ...data.revenueTrend.map((x) => x.revenue));
                const heightPct = Math.max(4, (r.revenue / max) * 100);
                return (
                  <View key={r.month} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { height: `${heightPct}%` }]} />
                    </View>
                    <Text style={styles.barLabel}>{formatMonth(r.month)}</Text>
                  </View>
                );
              })}
              {data.revenueTrend.length === 0 && <Text style={styles.emptyNote}>No revenue data yet.</Text>}
            </View>
          </GlassCard>

          <SectionHeader title="Coach Utilization" />
          <GlassCard style={styles.chartCard}>
            {data.coachUtilization.slice(0, 6).map((c) => (
              <View key={c.coachId} style={styles.utilRow}>
                <Text style={styles.utilName} numberOfLines={1}>
                  {c.coachName}
                </Text>
                <View style={styles.utilTrack}>
                  <View style={[styles.utilFill, { width: `${Math.min(100, c.utilizationPct)}%` }]} />
                </View>
                <Text style={styles.utilPct}>{c.utilizationPct.toFixed(0)}%</Text>
              </View>
            ))}
            {data.coachUtilization.length === 0 && <Text style={styles.emptyNote}>No coach utilization data yet.</Text>}
          </GlassCard>

          <SectionHeader title="Bookings by Hour" />
          <GlassCard style={styles.chartCard}>
            <View style={styles.barRow}>
              {data.bookingsByHour.map((b) => {
                const max = Math.max(1, ...data.bookingsByHour.map((x) => x.bookings));
                const heightPct = Math.max(4, (b.bookings / max) * 100);
                return (
                  <View key={b.hour} style={styles.barColSmall}>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { height: `${heightPct}%` }]} />
                    </View>
                    <Text style={styles.barLabelSmall}>{b.hour}</Text>
                  </View>
                );
              })}
              {data.bookingsByHour.length === 0 && <Text style={styles.emptyNote}>No booking data yet.</Text>}
            </View>
          </GlassCard>
        </>
      )}
    </ScreenScaffold>
  );
}

function StatTile({ value, label, emphasize }: { value: string; label: string; emphasize?: boolean }) {
  return (
    <View style={styles.gridItem}>
      <StatCard value={value} label={label} emphasize={emphasize} />
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchPlaceholder: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.45)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { width: '47%' },
  chartCard: { gap: 8 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 },
  barColSmall: { width: 14, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 },
  barTrack: { width: '100%', flex: 1, justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: Brand.yellow, borderRadius: 4, minHeight: 4 },
  barLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 10.5, color: 'rgba(255,255,255,0.45)' },
  barLabelSmall: { fontFamily: 'Manrope_500Medium', fontSize: 8.5, color: 'rgba(255,255,255,0.45)' },
  utilRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  utilName: { width: 90, fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#FFFFFF' },
  utilTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  utilFill: { height: '100%', backgroundColor: Brand.yellow, borderRadius: 4 },
  utilPct: { width: 36, textAlign: 'right', fontFamily: 'Manrope_700Bold', fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  emptyNote: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.45)' },
});
