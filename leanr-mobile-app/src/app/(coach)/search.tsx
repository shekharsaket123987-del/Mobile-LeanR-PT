/**
 * Global Client Search — New PRD.md §4.B. See src/lib/data/coach-search.ts
 * header for the confirmed RLS (any coach can read any client's name/
 * status, not just linked ones). Relit; results now push to Client
 * Detail (`coach-clients.ts`'s `getCoachClientDetail` already handles the
 * non-roster/read-only case) — previously these rows weren't tappable at
 * all, a real gap this stage closes.
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
import { searchClients, type ClientSearchResult } from '@/lib/data/coach-search';
import { getErrorMessage } from '@/lib/data/errors';

export default function CoachSearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientSearchResult[] | null>(null);
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
      setResults(await searchClients(text));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LightScreenScaffold title="Search Clients">
      <LightTextField
        icon="search-outline"
        placeholder="Search by name…"
        value={query}
        onChangeText={onSearch}
        accessibilityLabel="Search clients by name"
      />

      {loading && <LightLoadingState rows={1} />}
      {error && <LightErrorState message={error} onRetry={() => onSearch(query)} />}
      {!loading && !error && results !== null && results.length === 0 && <LightEmptyState message="No clients found." icon="search-outline" />}
      {!loading &&
        !error &&
        results?.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => router.push({ pathname: '/clients/[id]', params: { id: r.id } })}
            accessibilityRole="button"
            accessibilityLabel={r.fullName}>
            <LightCard>
              <View style={styles.row}>
                <Text style={styles.name}>{r.fullName}</Text>
                {r.isMyClient && <LightBadge label="Your client" tone="green" />}
              </View>
              <Text style={styles.meta}>
                {r.clientCode} · {r.status}
              </Text>
              {!r.isMyClient && <Text style={styles.readOnlyNote}>Read-only — not one of your clients</Text>}
            </LightCard>
          </Pressable>
        ))}
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: LightBrand.navy, flexShrink: 1 },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.textMuted, marginTop: 2 },
  readOnlyNote: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: LightBrand.amber, marginTop: 4 },
});
