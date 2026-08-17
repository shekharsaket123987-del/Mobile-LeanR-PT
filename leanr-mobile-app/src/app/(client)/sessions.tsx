/**
 * Sessions tab — LEANR_PT_NEXTGEN_APP_PRD.md §6/§9.2, wired to real
 * bookings data. "Book a Session" (the hold->confirm wizard) is
 * deliberately not wired yet — see leanr-mobile-app/README.md open items
 * for why (confirm_booking's RPC signature isn't fully documented).
 */
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { TextLink } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import { cancelBooking, getSessionsByStatus } from '@/lib/data/bookings';
import type { Booking, BookingStatus } from '@/lib/data/types';
import { useAsync } from '@/lib/data/use-async';

const TABS: { key: BookingStatus; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'missed', label: 'Missed' },
];

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function SessionCard({ booking, onCancelled }: { booking: Booking; onCancelled: () => void }) {
  const onCancel = () => {
    Alert.alert('Cancel session?', 'This cannot be undone.', [
      { text: 'Keep session', style: 'cancel' },
      {
        text: 'Cancel session',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelBooking(booking.id, null);
            onCancelled();
          } catch (err) {
            Alert.alert('Could not cancel', err instanceof Error ? err.message : String(err));
          }
        },
      },
    ]);
  };

  return (
    <Card>
      <Text style={shared.cardLabel}>{formatSessionTime(booking.scheduled_start)}</Text>
      {booking.was_rescheduled && <Text style={shared.cardLabel}>Rescheduled</Text>}
      {booking.status === 'upcoming' && (
        <TextLink onPress={onCancel} style={styles.cancelLink}>
          Cancel session
        </TextLink>
      )}
    </Card>
  );
}

export default function SessionsScreen() {
  const [activeTab, setActiveTab] = useState<BookingStatus>('upcoming');
  const { data, loading, error, reload } = useAsync(() => getSessionsByStatus(activeTab), [activeTab]);

  return (
    <ScreenScaffold title="Sessions">
      <View style={styles.tabRow} accessibilityRole="tablist">
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={styles.tabPressable}
            hitSlop={8}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: activeTab === tab.key }}>
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (data?.length ?? 0) === 0 && <EmptyState message={`No ${activeTab} sessions.`} />}
      {!loading &&
        !error &&
        data?.map((booking) => <SessionCard key={booking.id} booking={booking} onCancelled={reload} />)}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  tabPressable: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  tabLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, opacity: 0.5 },
  tabLabelActive: { opacity: 1, color: Brand.yellow },
  cancelLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: Brand.alertRed, marginTop: 4 },
});
