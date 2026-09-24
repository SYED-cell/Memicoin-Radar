import { useCallback, useEffect, useState } from 'react';
import { useMarket } from '../context/MarketContext';
import { ApiError, get } from '../lib/api';
import type { Token } from '../types';

/**
 * Full token (complete history + trade stream) for detail views. The SSE feed only carries
 * lightweight summaries, so this polls the REST endpoint while the tab is visible and falls back
 * to the live summary between polls.
 */
export function useFullToken(mint: string | undefined, intervalMs = 4000) {
  const { getToken } = useMarket();
  const [full, setFull] = useState<Token | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mint) return;
    let cancelled = false;
    let timer: number | undefined;
    const ctrl = new AbortController();
    setFull(null);
    setNotFound(false);
    setLoading(true);
    const load = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const r = await get<{ token: Token }>(`/api/tokens/${encodeURIComponent(mint)}`, ctrl.signal);
          if (cancelled) return;
          setFull(r.token);
          setError(null);
        } catch (e) {
          if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return;
          if (e instanceof ApiError && (e.status === 404 || e.status === 422)) setNotFound(true);
          else setError(e instanceof Error ? e.message : 'Failed to load token');
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      if (!cancelled) timer = window.setTimeout(load, intervalMs);
    };
    void load();
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [mint, intervalMs]);

  // Prefer the freshest price from the live feed, keep history/trades from the full fetch.
  const summary = getToken(mint);
  const token = full && summary && summary.updatedAt > full.updatedAt ? { ...full, ...summary, history: full.history, trades: full.trades, scoreHistory: full.scoreHistory } : (full ?? summary ?? null);
  return { token, loading: loading && !token, error, notFound: notFound && !summary };
}

/** One-shot intel fetch (holders / creator / security) with manual refresh. */
export function useIntel<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await get<T>(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}
