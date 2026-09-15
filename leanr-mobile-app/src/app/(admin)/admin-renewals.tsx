/**
 * Renewal Opportunities (admin) — New PRD.md §4.C. Shared data shape with
 * the coach's own screen; Coach column shown since these are platform-
 * wide, not "my clients".
 *
 * Parity fix (2026-09-14, admin-parity sweep #8): tabs now match web's
 * `RenewalOpportunitiesClient.tsx` exactly — "Renewal Opportunities" /
 * "Expired" (was an invented "All / Due Soon / Overdue" split that had no
 * web equivalent and, worse, never surfaced expired clients at all since
 * the data layer didn't query them). Row now also shows Plan and a
 * Converted/Not Converted badge, same columns as web's table.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightAvatar } from '@/components/light/light-avatar';
import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { getAdminRenewalOpportunities, type AdminRenewalOpportunity } from '@/lib/data/admin-renewals';
import { useAsync } from '@/lib/data/use-async';

type Tab = 'opportunity' | 'expired';
const TABS: { key: Tab; label: string }[] = [
  { key: 'opportunity', label: 'Opportunities' },
  { key: 'expired', label: 'Expired' },
];

export default function AdminRenewalsScreen() {
  const { data: opportunities, loading, error, reload } = useAsync(getAdminRenewalOpportunities, []);
  const [tab, setTab] = useState<Tab>('opportunity');

  const rows = opportunities ?? [];
  const filtered = rows.filter((o) => o.category === tab);

  return (
    <LightScreenScaffold title="Renewal Opportunities" subtitle="Every client running low on sessions or expired, platform-wide">
      <LightSegmentedControl
        options={TABS.map((t) => ({ key: t.key, label: `${t.label} (${rows.filter((r) => r.category === t.key).length})` }))}
        value={tab}
        onChange={setTab}
      />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && (
        <LightEmptyState
          message={tab === 'opportunity' ? 'Nobody is currently running low on sessions.' : 'Nobody has fully lapsed without renewing.'}
          icon="trending-up-outline"
        />
      )}
      {!loading &&
        !error &&
        filtered.map((o) => (
          <Pressable key={o.clientId} onPress={() => router.push({ pathname: '/admin-clients/[id]', params: { id: o.clientId } })} accessibilityRole="button" accessibilityLabel={o.clientName}>
            <LightCard style={styles.card}>
              <View style={styles.row}>
                <LightAvatar photoUrl={o.clientPhoto} name={o.clientName} size={36} />
                <View style={styles.nameBlock}>
                  <Text style={styles.name} numberOfLines={1}>
                    {o.clientName}
                  </Text>
                  <Text style={styles.code} numberOfLines={1}>
                    {o.clientCode || '—'}
                  </Text>
                </View>
                {o.category === 'opportunity' && (
                  <Text style={styles.sessions}>
                    {Math.max(o.sessionsRemaining, 0)}/{o.sessionsTotal ?? '—'}
                  </Text>
                )}
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.subtext}>{o.packageName ?? '—'}</Text>
                {o.coachName && <Text style={styles.coach}>Coach: {o.coachName}</Text>}
              </View>
              {o.category === 'opportunity' && o.estimatedDaysRemaining != null && (
                <Text style={[styles.subtext, o.sessionsRemaining <= 0 && styles.overdueText]}>
                  {o.sessionsRemaining <= 0 ? 'Plan needs renewal now' : `~${o.estimatedDaysRemaining} days left`}
                </Text>
              )}
              <View style={[styles.badge, o.converted ? styles.badgeGreen : styles.badgeGray]}>
                <Text style={[styles.badgeText, o.converted ? styles.badgeTextGreen : styles.badgeTextGray]}>{o.converted ? 'Converted' : 'Not Converted'}</Text>
              </View>
            </LightCard>
          </Pressable>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameBlock: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.navy },
  code: { fontFamily: 'Manrope_500Medium', fontSize: 11, color: LightBrand.textMuted },
  sessions: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: LightBrand.teal },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  coach: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: LightBrand.textSecondary },
  subtext: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted },
  overdueText: { color: LightBrand.alertRed },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeGreen: { backgroundColor: '#DCFCE7' },
  badgeGray: { backgroundColor: '#F1F5F9' },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  badgeTextGreen: { color: '#15803D' },
  badgeTextGray: { color: LightBrand.textMuted },
});
