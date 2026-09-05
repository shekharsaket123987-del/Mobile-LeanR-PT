/**
 * Global Client Search — LEANR_PT_MOBILE_PRD.md §5. See
 * src/lib/data/coach-search.ts header for the confirmed RLS (any coach
 * can read any client's name/status, not just linked ones).
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { TextField } from '@/components/ui/text-field';
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
      <TextField icon="search-outline" placeholder="Search by name…" value={query} onChangeText={onSearch} accessibilityLabel="Search clients by name" />

      {loading && <LoadingState rows={1} />}
      {error && <ErrorState message={error} onRetry={() => onSearch(query)} />}
      {!loading && !error && results !== null && results.length === 0 && <EmptyState message="No clients found." icon="search-outline" />}
      {!loading &&
        !error &&
        results?.map((r) => (
          <GlassCard key={r.id}>
            <View style={styles.row}>
              <Text style={styles.name}>{r.fullName}</Text>
              {r.isMyClient && <Badge label="Your client" tone="green" />}
            </View>
            <Text style={styles.meta}>
              {r.clientCode} · {r.status}
            </Text>
            {!r.isMyClient && <Text style={styles.readOnlyNote}>Read-only — not one of your clients</Text>}
          </GlassCard>
        ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#FFFFFF', flexShrink: 1 },
  meta: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  readOnlyNote: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: Brand.streakEmberStart, marginTop: 4 },
});
