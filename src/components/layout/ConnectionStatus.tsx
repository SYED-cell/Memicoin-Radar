import { Activity, Pause, Play, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMarket } from '../../context/MarketContext';
import { useNow } from '../../hooks/useNow';
import { cn } from '../../utils/cn';
import { formatNumber, formatTime, formatUsd, timeAgo } from '../../utils/format';

type Level = 'live' | 'degraded' | 'down' | 'demo' | 'paused';

/** Summarises client ↔ server (SSE) and server ↔ blockchain (stream/RPC/market) health. */
export function useConnectionLevel(): { level: Level; label: string } {
  const { stream, health, live } = useMarket();
  if (!live) return { level: 'paused', label: 'Paused' };
  if (stream !== 'open') return { level: 'down', label: stream === 'offline' ? 'Offline' : 'Reconnecting' };
  if (health?.mode === 'mock') return { level: 'demo', label: 'Demo data' };
  if (health && health.stream !== 'open') return { level: 'degraded', label: 'Polling fallback' };
  if (health && !health.market.ok) return { level: 'degraded', label: 'Degraded' };
  return { level: 'live', label: 'Live' };
}

const DOT: Record<Level, string> = {
  live: 'bg-primary animate-pulse-dot',
  degraded: 'bg-warning',
  down: 'bg-danger animate-pulse',
  demo: 'bg-warning',
  paused: 'bg-subtle',
};
const TEXT: Record<Level, string> = { live: 'text-primary', degraded: 'text-warning', down: 'text-danger', demo: 'text-warning', paused: 'text-muted' };

export function ConnectionDot({ className }: { className?: string }) {
  const { level, label } = useConnectionLevel();
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('size-2 rounded-full', DOT[level])} aria-hidden />
      <span className={cn('text-[11px] font-semibold', TEXT[level])}>{label}</span>
    </span>
  );
}

export function ConnectionStatus() {
  const { live, setLive, lastUpdated, health, stream, solPrice, retry, refresh } = useMarket();
  const { level, label } = useConnectionLevel();
  const now = useNow(1000);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const rows: [string, string, boolean | null][] = health
    ? [
        ['Data mode', health.mode === 'live' ? 'Live Solana mainnet' : 'Demo simulator', health.mode === 'live'],
        ['App ↔ server', stream === 'open' ? 'Connected (SSE)' : stream, stream === 'open'],
        ['Launch stream', `${health.stream}${health.reconnectAttempts ? ` · retry ${health.reconnectAttempts}` : ''}`, health.stream === 'open'],
        ['Trade stream', health.tradeStream ? 'Enabled' : 'Off (needs PumpPortal key)', health.tradeStream ? true : null],
        ['Market data', health.market.ok ? `OK${health.market.lastOk ? ` · ${timeAgo(health.market.lastOk, now)}` : ''}` : health.market.lastError ?? 'Error', health.market.ok],
        ['Solana RPC', `${health.rpcKind === 'dedicated' ? 'Dedicated' : 'Public'} · ${health.rpc.ok ? 'OK' : health.rpc.lastError ?? '—'}`, health.rpc.ok ? (health.rpcKind === 'dedicated' ? true : null) : false],
        ['Launches detected', formatNumber(health.launchesDetected), null],
        ['SOL price', solPrice ? formatUsd(solPrice) : '—', null],
      ]
    : [];

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1 rounded-xl border border-line bg-surface/70 py-1 pr-1 pl-3">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2" aria-expanded={open} aria-haspopup="dialog" aria-label={`Connection: ${label}. Show details`}>
          <span className={cn('size-2 rounded-full', DOT[level])} aria-hidden />
          <span className="text-xs font-semibold" aria-live="polite">
            <span className={TEXT[level]}>{label}</span>
            <span className="num hidden font-normal text-muted lg:inline">{lastUpdated ? ` · ${formatTime(lastUpdated)}` : ''}</span>
          </span>
        </button>
        <button
          onClick={() => setLive(!live)}
          className="ml-1 grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-fg"
          aria-label={live ? 'Pause live feed rendering' : 'Resume live feed'}
          title={live ? 'Pause feed' : 'Resume feed'}
        >
          {live ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <button onClick={() => void refresh()} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-fg" aria-label="Reconnect and refresh" title="Reconnect">
          <RefreshCw className={cn('size-3.5', stream !== 'open' && 'animate-spin')} />
        </button>
      </div>
      {open && (
        <div role="dialog" aria-label="Connection health" className="absolute right-0 z-50 mt-2 w-80 animate-fade-in rounded-xl border border-line-strong bg-surface-2 p-3 shadow-2xl">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Activity className="size-4 text-accent" /> Connection health
          </p>
          {health?.fallbackReason && <p className="mb-2 rounded-lg bg-warning/10 p-2 text-[11px] text-warning">{health.fallbackReason}</p>}
          <dl className="space-y-1.5 text-xs">
            {rows.map(([k, val, ok]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className={cn('num truncate text-right', ok === true && 'text-primary', ok === false && 'text-danger')}>{val}</dd>
              </div>
            ))}
            {!health && <p className="text-muted">Waiting for server…</p>}
          </dl>
          {stream !== 'open' && (
            <button className="btn btn-outline btn-sm mt-3 w-full" onClick={retry}>
              Reconnect now
            </button>
          )}
        </div>
      )}
    </div>
  );
}
