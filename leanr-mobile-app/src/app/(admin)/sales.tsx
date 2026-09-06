/**
 * Sales (admin) — New PRD.md §4.C "Screen: Sales" — transaction list,
 * search (client/plan), header shows filtered total ₹.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightTextField } from '@/components/light/light-text-field';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { listSales } from '@/lib/data/admin-sales';
import { useAsync } from '@/lib/data/use-async';

function formatCurrency(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminSalesScreen() {
  const { data: sales, loading, error, reload } = useAsync(listSales, []);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sales ?? []).filter((s) => !q || s.clientName.toLowerCase().includes(q) || s.packageName.toLowerCase().includes(q));
  }, [sales, query]);

  const total = filtered.reduce((sum, s) => sum + s.amount, 0);

  return (
    <LightScreenScaffold title="Sales" subtitle={`Total: ${formatCurrency(total)}`}>
      <LightTextField icon="search-outline" placeholder="Search by client or plan" value={query} onChangeText={setQuery} />

      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <LightEmptyState message="No transactions match." icon="cash-outline" />}
      {!loading &&
        !error &&
        filtered.map((s) => (
          <Pressable key={s.subscriptionId} onPress={() => router.push({ pathname: '/admin-clients/[id]', params: { id: s.clientId } })} accessibilityRole="button" accessibilityLabel={s.clientName}>
            <LightCard style={styles.row}>
              <View style={styles.info}>
                <Text style={styles.name}>{s.clientName}</Text>
                <Text style={styles.meta}>
                  {s.packageName} · #{s.clientCode}
                </Text>
                <Text style={styles.date}>{formatDate(s.saleDate)}</Text>
              </View>
              <Text style={styles.amount}>{formatCurrency(s.amount)}</Text>
            </LightCard>
          </Pressable>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.navy },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.textSecondary },
  date: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: LightBrand.textMuted },
  amount: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: LightBrand.teal },
});
