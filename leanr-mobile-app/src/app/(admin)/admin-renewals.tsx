/**
 * Renewal Opportunities (admin) — New PRD.md §4.C. Shared client with
 * the coach's own screen, Coach column shown since these are platform-
 * wide, not "my clients".
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getAdminRenewalOpportunities, type AdminRenewalOpportunity } from '@/lib/data/admin-renewals';
import { useAsync } from '@/lib/data/use-async';

type Tab = 'all' | 'due_soon' | 'overdue';

function bucket(o: AdminRenewalOpportunity): 'due_soon' | 'overdue' {
  return o.sessionsRemaining <= 0 ? 'overdue' : 'due_soon';
}

export default function AdminRenewalsScreen() {
  const { data: opportunities, loading, error, reload } = useAsync(getAdminRenewalOpportunities, []);
  const [tab, setTab] = useState<Tab>('all');

  const filtered = (opportunities ?? []).filter((o) => tab === 'all' || bucket(o) === tab);

  return (
    <LightScreenScaffold title="Renewal Opportunities" subtitle="Clients running low on sessions">
      <LightSegmentedControl
        options={[
          { key: 'all', label: 'All' },
          { key: 'due_soon', label: 'Due Soon' },
          { key: 'overdue', label: 'Overdue' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <LightEmptyState message="No clients here right now." icon="trending-up-outline" />}
      {!loading &&
        !error &&
        filtered.map((o) => (
          <Pressable key={o.subscriptionId} onPress={() => router.push({ pathname: '/admin-clients/[id]', params: { id: o.clientId } })} accessibilityRole="button" accessibilityLabel={o.clientName}>
            <LightCard style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.name} numberOfLines={1}>
                  {o.clientName}
                </Text>
                <Text style={styles.sessions}>
                  {Math.max(o.sessionsRemaining, 0)}/{o.sessionsTotal}
                </Text>
              </View>
              {o.coachName && <Text style={styles.coach}>Coach: {o.coachName}</Text>}
              <Text style={[styles.subtext, bucket(o) === 'overdue' && styles.overdueText]}>
                {bucket(o) === 'overdue' ? 'Plan needs renewal now' : o.estimatedDaysRemaining != null ? `~${o.estimatedDaysRemaining} days left` : 'Sessions running low'}
              </Text>
            </LightCard>
          </Pressable>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.navy, flexShrink: 1 },
  sessions: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: LightBrand.teal },
  coach: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: LightBrand.textSecondary },
  subtext: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted },
  overdueText: { color: LightBrand.alertRed },
});
