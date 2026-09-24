import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeMarketStats, type MarketStats } from '../../shared/marketStats.ts';
import { del, get, post } from '../lib/api';
import { notifyBrowser } from '../lib/notify';
import { LiveStream, type StreamStatus } from '../lib/stream';
import type { Alert, ConnectionHealth, Token } from '../types';
import { playAlertSound } from '../utils/sound';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { useToast } from './ToastContext';

type Status = 'loading' | 'ready' | 'error';

interface MarketApi {
  status: Status;
  error: string | null;
  tokens: Token[];
  tokenMap: Map<string, Token>;
  getToken: (mint: string | undefined) => Token | undefined;
  alerts: Alert[];
  unreadCount: number;
  stats: MarketStats;
  statsHistory: { t: number; volume: number; liquidity: number; tokens: number }[];
  health: ConnectionHealth | null;
  stream: StreamStatus;
  solPrice: number;
  lastUpdated: number | null;
  /** UI freeze: keeps receiving data but stops re-rendering the feed. */
  live: boolean;
  setLive: (live: boolean) => void;
  refresh: () => Promise<void>;
  retry: () => void;
  markRead: (id: string, read?: boolean) => void;
  markAllRead: () => void;
  deleteAlert: (id: string) => void;
  clearAlerts: () => void;
  /** Incremented when the server reports a portfolio change (consumed by TradingContext). */
  portfolioVersion: number;
  telegramVersion: number;
}

const MarketContext = createContext<MarketApi | null>(null);

interface StreamPayload {
  tokens: Token[];
  removed?: string[];
  health: ConnectionHealth;
  solPrice: number;
  t: number;
}

export function MarketProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [tokenMap, setTokenMap] = useState<Map<string, Token>>(new Map());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [health, setHealth] = useState<ConnectionHealth | null>(null);
  const [stream, setStream] = useState<StreamStatus>('connecting');
  const [solPrice, setSolPrice] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [live, setLive] = useState(true);
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  const [telegramVersion, setTelegramVersion] = useState(0);
  const [statsHistory, setStatsHistory] = useState<MarketApi['statsHistory']>([]);
  const streamRef = useRef<LiveStream | null>(null);
  const pending = useRef<StreamPayload[]>([]);
  const liveRef = useRef(live);
  liveRef.current = live;
  const lastToast = useRef(0);
  const notifyRef = useRef(settings?.notifications);
  notifyRef.current = settings?.notifications;

  const onAlerts = useCallback(
    (incoming: Alert[]) => {
      setAlerts((list) => [...incoming, ...list.filter((a) => !incoming.some((n) => n.id === a.id))].slice(0, 300));
      const n = notifyRef.current;
      if (!n) return;
      const visible = incoming.filter((a) => n[a.severity]);
      const first = visible[0];
      if (!first) return;
      // Throttle pop-ups so a burst of launches doesn't flood the screen; everything stays in the inbox.
      const now = Date.now();
      if (now - lastToast.current < 6000 && first.severity !== 'critical') return;
      lastToast.current = now;
      if (n.inApp) {
        toast.show(first.severity === 'critical' ? 'error' : first.severity === 'warning' ? 'warning' : 'info', `$${first.symbol}: ${first.title}`, first.message + (visible.length > 1 ? ` (+${visible.length - 1} more)` : ''));
      }
      if (n.sound) playAlertSound(first.severity === 'critical');
      if (n.browser) visible.slice(0, 3).forEach(notifyBrowser);
    },
    [toast],
  );

  // Batched application of stream updates: many events per second → one render per flush.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!pending.current.length || !liveRef.current) return;
      const batch = pending.current;
      pending.current = [];
      setTokenMap((prev) => {
        const next = new Map(prev);
        for (const p of batch) {
          for (const t of p.tokens) next.set(t.id, t);
          for (const id of p.removed ?? []) next.delete(id);
        }
        return next;
      });
      const last = batch[batch.length - 1];
      setHealth(last.health);
      setSolPrice(last.solPrice);
      setLastUpdated(last.t);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const loadAlerts = useCallback(async () => {
    const r = await get<{ alerts: Alert[] }>('/api/alerts');
    setAlerts(r.alerts);
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      streamRef.current?.stop();
      streamRef.current = null;
      setTokenMap(new Map());
      setAlerts([]);
      setStatus('loading');
      return;
    }
    const s = new LiveStream(
      {
        onStatus: (st) => {
          setStream(st);
          if (st === 'offline') setError('Live connection lost — retrying automatically');
          if (st === 'open') setError(null);
        },
        onEvent: (event, data) => {
          if (event === 'snapshot') {
            const p = data as StreamPayload;
            setTokenMap(new Map(p.tokens.map((t) => [t.id, t])));
            setHealth(p.health);
            setSolPrice(p.solPrice);
            setLastUpdated(p.t);
            setStatus('ready');
          } else if (event === 'update') {
            pending.current.push(data as StreamPayload);
          } else if (event === 'health') {
            setHealth((data as { health: ConnectionHealth }).health);
          } else if (event === 'alert') {
            onAlerts(data as Alert[]);
          } else if (event === 'portfolio') {
            setPortfolioVersion((v) => v + 1);
          } else if (event === 'telegram') {
            setTelegramVersion((v) => v + 1);
          }
        },
      },
      ['snapshot', 'update', 'health', 'alert', 'portfolio', 'telegram'],
    );
    streamRef.current = s;
    s.start();
    void loadAlerts().catch(() => undefined);
    return () => s.stop();
  }, [authStatus, loadAlerts, onAlerts]);

  const tokens = useMemo(() => [...tokenMap.values()].sort((a, b) => b.detectedAt - a.detectedAt), [tokenMap]);
  const stats = useMemo(() => computeMarketStats(tokens), [tokens]);

  useEffect(() => {
    if (!lastUpdated) return;
    setStatsHistory((h) => (h.length && h[h.length - 1].t === lastUpdated ? h : [...h, { t: lastUpdated, volume: stats.totalVolume, liquidity: stats.totalLiquidity, tokens: stats.totalTokens }].slice(-60)));
  }, [lastUpdated, stats]);

  const getToken = useCallback((mint: string | undefined) => (mint ? tokenMap.get(mint) : undefined), [tokenMap]);

  const mutateAlerts = useCallback((fn: (a: Alert[]) => Alert[]) => setAlerts(fn), []);
  const failToast = useCallback((e: unknown) => toast.error('Could not update alerts', e instanceof Error ? e.message : undefined), [toast]);

  const value: MarketApi = {
    status,
    error,
    tokens,
    tokenMap,
    getToken,
    alerts,
    unreadCount: alerts.filter((a) => !a.read).length,
    stats,
    statsHistory,
    health,
    stream,
    solPrice,
    lastUpdated,
    live,
    setLive,
    refresh: async () => {
      streamRef.current?.connectNow();
      await loadAlerts().catch(() => undefined);
    },
    retry: () => streamRef.current?.connectNow(),
    markRead: (id, read = true) => {
      mutateAlerts((l) => l.map((a) => (a.id === id ? { ...a, read } : a)));
      post(`/api/alerts/${encodeURIComponent(id)}/read`, { read }).catch(failToast);
    },
    markAllRead: () => {
      mutateAlerts((l) => l.map((a) => ({ ...a, read: true })));
      post('/api/alerts/read-all').catch(failToast);
    },
    deleteAlert: (id) => {
      mutateAlerts((l) => l.filter((a) => a.id !== id));
      del(`/api/alerts/${encodeURIComponent(id)}`).catch(failToast);
    },
    clearAlerts: () => {
      mutateAlerts(() => []);
      del('/api/alerts').catch(failToast);
    },
    portfolioVersion,
    telegramVersion,
  };
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketApi {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used within MarketProvider');
  return ctx;
}
