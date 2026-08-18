/**
 * Global Client Search — LEANR_PT_MOBILE_PRD.md §5. See
 * src/lib/data/coach-search.ts header for the confirmed RLS (any coach
 * can read any client's name/status, not just linked ones).
 */
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, EmptyState, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import { searchClients, type ClientSearchResult } from '@/lib/data/coach-search';

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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenScaffold title="Search Clients">
      <TextInput
        style={styles.input}
        placeholder="Search by name…"
        value={query}
        onChangeText={onSearch}
        accessibilityLabel="Search clients by name"
      />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => onSearch(query)} />}
      {!loading && !error && results !== null && results.length === 0 && <EmptyState message="No clients found." />}
      {!loading &&
        !error &&
        results?.map((r) => (
          <Card key={r.id}>
            <View style={styles.row}>
              <Text style={shared.bigStat}>{r.fullName}</Text>
              {r.isMyClient && <Text style={styles.myClientTag}>Your client</Text>}
            </View>
            <Text style={shared.cardLabel}>
              {r.clientCode} · {r.status}
            </Text>
            {!r.isMyClient && <Text style={styles.readOnlyNote}>Read-only — not one of your clients</Text>}
          </Card>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(128,128,128,0.15)',
    color: Brand.charcoal2,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  myClientTag: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: Brand.successEmerald },
  readOnlyNote: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: Brand.streakEmberStart, marginTop: 4 },
});
