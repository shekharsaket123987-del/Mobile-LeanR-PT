/**
 * Sales (admin) — New PRD.md §4.C "Screen: Sales" — transaction list,
 * search (client/plan), header shows filtered total ₹.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { TextField } from '@/components/ui/text-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
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
    return (sales ?? []).filter(
      (s) => !q || s.clientName.toLowerCase().includes(q) || s.clientCode.toLowerCase().includes(q) || s.packageName.toLowerCase().includes(q)
    );
  }, [sales, query]);

  const total = filtered.reduce((sum, s) => sum + s.amount, 0);

  return (
    <ScreenScaffold title="Sales" subtitle={`Total: ${formatCurrency(total)}`}>
      <TextField icon="search-outline" placeholder="Search by client, ID, or plan" value={query} onChangeText={setQuery} />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && filtered.length === 0 && <EmptyState message="No transactions match." icon="cash-outline" />}
      {!loading &&
        !error &&
        filtered.map((s) => (
          <Pressable key={s.subscriptionId} onPress={() => router.push({ pathname: '/admin-clients/[id]', params: { id: s.clientId } })} accessibilityRole="button" accessibilityLabel={s.clientName}>
            <GlassCard style={styles.row}>
              <View style={styles.info}>
                <Text style={styles.name}>{s.clientName}</Text>
                <Text style={styles.meta}>
                  {s.packageName} · #{s.clientCode}
                </Text>
                <Text style={styles.date}>{formatDate(s.saleDate)}</Text>
              </View>
              <Text style={styles.amount}>{formatCurrency(s.amount)}</Text>
            </GlassCard>
          </Pressable>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFFFFF' },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' },
  date: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: 'rgba(255,255,255,0.45)' },
  amount: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: Brand.yellow },
});
