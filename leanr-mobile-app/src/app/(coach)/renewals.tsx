/**
 * Renewal Opportunities (coach, read-only) — New PRD.md §4.B "Two tabs
 * (Opportunity/Expired)" — mapped to the mockup's All/Due Soon/Overdue
 * framing using the real `sessionsRemaining` data (Overdue = 0 or fewer
 * remaining, Due Soon = 1..SESSIONS_LOW_THRESHOLD). "Plan ends in N days"
 * is an honest estimate (see coach-renewals.ts) rather than a fabricated
 * date.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getRenewalOpportunities, type RenewalOpportunity } from '@/lib/data/coach-renewals';
import { useAsync } from '@/lib/data/use-async';

type Tab = 'all' | 'due_soon' | 'overdue';

function bucket(o: RenewalOpportunity): 'due_soon' | 'overdue' {
  return o.sessionsRemaining <= 0 ? 'overdue' : 'due_soon';
}

export default function CoachRenewalsScreen() {
  const { data: opportunities, loading, error, reload } = useAsync(getRenewalOpportunities, []);
  const [tab, setTab] = useState<Tab>('all');

  const filtered = (opportunities ?? []).filter((o) => tab === 'all' || bucket(o) === tab);

  return (
    <LightScreenScaffold title="Renewals" subtitle="Clients running low on sessions">
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
      {!loading && !error && filtered.length === 0 && (
        <LightEmptyState message="No clients here right now." icon="trending-up-outline" />
      )}
      {!loading &&
        !error &&
        filtered.map((o) => (
          <LightCard key={o.subscriptionId} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>
                {o.clientName}
              </Text>
              <Text style={styles.sessions}>
                {Math.max(o.sessionsRemaining, 0)}/{o.sessionsTotal}
              </Text>
            </View>
            <Text style={[styles.subtext, bucket(o) === 'overdue' && styles.overdueText]}>
              {bucket(o) === 'overdue'
                ? 'Plan needs renewal now'
                : o.estimatedDaysRemaining != null
                  ? `~${o.estimatedDaysRemaining} days left`
                  : 'Sessions running low'}
            </Text>
          </LightCard>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.navy, flexShrink: 1 },
  sessions: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: LightBrand.teal },
  subtext: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted },
  overdueText: { color: LightBrand.alertRed },
});
