import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '@/lib/data/errors';

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/** Shared fetch/loading/error/reload pattern for the read hooks in this folder. */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // This hook takes a caller-supplied deps array by design (it's a
    // generic wrapper, not a single fixed fetch), so the dependency list
    // can't be a static array literal — spreading is what makes callers'
    // primitive deps (e.g. an activeTab string) tracked by value instead
    // of by the deps array's reference, which is what we actually want.
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, [...deps, tick]);

  useEffect(() => load(), [load]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}
