import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { del, get, post } from '../lib/api';
import type { WatchItem } from '../types';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface WatchlistApi {
  items: WatchItem[];
  ids: Set<string>;
  loading: boolean;
  isWatched: (tokenId: string) => boolean;
  add: (tokenId: string) => Promise<void>;
  remove: (tokenId: string) => Promise<void>;
  /** Returns the new watched state. */
  toggle: (tokenId: string) => Promise<boolean>;
  clear: () => Promise<void>;
}

const WatchlistContext = createContext<WatchlistApi | null>(null);

/** Server-backed, per-account watchlist with optimistic updates. */
export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'authenticated') {
      setItems([]);
      return;
    }
    setLoading(true);
    get<{ items: WatchItem[] }>('/api/watchlist')
      .then((r) => setItems(r.items))
      .catch(() => toast.error('Could not load watchlist'))
      .finally(() => setLoading(false));
  }, [status, toast]);

  const ids = useMemo(() => new Set(items.map((i) => i.tokenId)), [items]);

  const add = useCallback(
    async (tokenId: string) => {
      setItems((l) => (l.some((i) => i.tokenId === tokenId) ? l : [{ tokenId, addedAt: Date.now() }, ...l]));
      try {
        setItems((await post<{ items: WatchItem[] }>('/api/watchlist', { mint: tokenId })).items);
      } catch (e) {
        setItems((l) => l.filter((i) => i.tokenId !== tokenId));
        toast.error('Could not add to watchlist', e instanceof Error ? e.message : undefined);
        throw e;
      }
    },
    [toast],
  );

  const remove = useCallback(
    async (tokenId: string) => {
      const snapshot = items;
      setItems((l) => l.filter((i) => i.tokenId !== tokenId));
      try {
        setItems((await del<{ items: WatchItem[] }>(`/api/watchlist/${encodeURIComponent(tokenId)}`)).items);
      } catch (e) {
        setItems(snapshot);
        toast.error('Could not remove from watchlist', e instanceof Error ? e.message : undefined);
        throw e;
      }
    },
    [items, toast],
  );

  const toggle = useCallback(
    async (tokenId: string) => {
      if (ids.has(tokenId)) {
        await remove(tokenId);
        return false;
      }
      await add(tokenId);
      return true;
    },
    [ids, add, remove],
  );

  const clear = useCallback(async () => {
    await del('/api/watchlist');
    setItems([]);
  }, []);

  const isWatched = useCallback((id: string) => ids.has(id), [ids]);
  const value = useMemo(() => ({ items, ids, loading, isWatched, add, remove, toggle, clear }), [items, ids, loading, isWatched, add, remove, toggle, clear]);
  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistApi {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider');
  return ctx;
}
