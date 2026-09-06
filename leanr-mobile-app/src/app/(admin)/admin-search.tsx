/**
 * Admin Universal Search — New PRD.md §4.C. Pushed from the Dashboard
 * header per the approved UI reference (frame 3). Results open the same
 * detail records as web (§4: "Search results must open the same detail
 * records as web").
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightTextField } from '@/components/light/light-text-field';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { searchAdmin, type AdminSearchResult } from '@/lib/data/admin-search';
import { getErrorMessage } from '@/lib/data/errors';

const KIND_LABEL: Record<AdminSearchResult['kind'], string> = { client: 'Client', coach: 'Coach', plan: 'Plan' };
const KIND_TONE: Record<AdminSearchResult['kind'], 'teal' | 'green' | 'gray'> = { client: 'teal', coach: 'green', plan: 'gray' };

export default function AdminSearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSearch = async (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setResults(await searchAdmin(text));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const onOpen = (r: AdminSearchResult) => {
    if (r.kind === 'client') router.push({ pathname: '/admin-clients/[id]', params: { id: r.id } });
    else if (r.kind === 'coach') router.push({ pathname: '/coaches/[id]', params: { id: r.id } });
    else router.push('/settings');
  };

  return (
    <LightScreenScaffold title="Global Search">
      <LightTextField
        icon="search-outline"
        placeholder="Search by name, ID, email, or phone"
        value={query}
        onChangeText={onSearch}
        accessibilityLabel="Search clients, coaches, or plans"
      />

      {loading && <LightLoadingState rows={1} />}
      {error && <LightErrorState message={error} onRetry={() => onSearch(query)} />}
      {!loading && !error && results !== null && results.length === 0 && <LightEmptyState message="No results found." icon="search-outline" />}
      {!loading &&
        !error &&
        results?.map((r) => (
          <Pressable key={`${r.kind}-${r.id}`} onPress={() => onOpen(r)} accessibilityRole="button" accessibilityLabel={r.title}>
            <LightCard>
              <View style={styles.row}>
                <Text style={styles.title} numberOfLines={1}>
                  {r.title}
                </Text>
                <LightBadge label={KIND_LABEL[r.kind]} tone={KIND_TONE[r.kind]} />
              </View>
              <Text style={styles.subtitle}>{r.subtitle}</Text>
            </LightCard>
          </Pressable>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: LightBrand.navy, flexShrink: 1 },
  subtitle: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.textMuted, marginTop: 2 },
});
