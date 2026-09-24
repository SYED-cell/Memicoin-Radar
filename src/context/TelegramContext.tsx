import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { del, get, post } from '../lib/api';
import type { TelegramStatus } from '../types';
import { useAuth } from './AuthContext';
import { useMarket } from './MarketContext';

interface TelegramApi {
  status: TelegramStatus | null;
  loading: boolean;
  /** Creates a one-time deep link (t.me/<bot>?start=<code>) the user opens to link their chat. */
  createLink: () => Promise<{ url: string; expiresAt: number }>;
  sendTest: () => Promise<{ ok: boolean; error?: string }>;
  disconnect: () => Promise<void>;
  reload: () => Promise<void>;
}

const TelegramContext = createContext<TelegramApi | null>(null);

export function TelegramProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const { telegramVersion } = useMarket();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const r = await get<{ status: TelegramStatus }>('/api/telegram');
    setStatus(r.status);
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setStatus(null);
      return;
    }
    setLoading(true);
    reload()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [authStatus, reload, telegramVersion]);

  const value = useMemo<TelegramApi>(
    () => ({
      status,
      loading,
      reload,
      createLink: () => post<{ url: string; expiresAt: number }>('/api/telegram/link'),
      sendTest: async () => {
        const r = await post<{ ok: boolean; error?: string }>('/api/telegram/test');
        await reload();
        return r;
      },
      disconnect: async () => {
        const r = await del<{ status: TelegramStatus }>('/api/telegram');
        setStatus(r.status);
      },
    }),
    [status, loading, reload],
  );
  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram(): TelegramApi {
  const ctx = useContext(TelegramContext);
  if (!ctx) throw new Error('useTelegram must be used within TelegramProvider');
  return ctx;
}
