import { Bot, CircleStop, Info, Lock, Play, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../components/ui/LoadingState';
import { PageHeader, Section } from '../components/ui/primitives';
import { useToast } from '../context/ToastContext';
import { get, put } from '../lib/api';
import { cn } from '../utils/cn';
import { formatSignedUsd, timeAgo } from '../utils/format';

interface ExitRule {
  label: string;
  price: number;
  sharePct: number;
  thenStop: string;
  reason: string;
}

interface Plan {
  id: string;
  mint: string;
  symbol: string;
  status: 'open' | 'closed';
  entry: number;
  originalQty: number;
  stop: number;
  initialStop: number;
  exits: ExitRule[];
  filled: number[];
  timeStopMin: number;
  openedAt: number;
  closedAt: number | null;
  closeCause: string | null;
  realizedPnl: number;
}

interface BotSettings {
  enabled: boolean;
  riskPct: number;
  maxPositions: number;
  maxPositionPct: number;
  minScore: number;
  maxRisk: number;
  timeStopMin: number;
}

interface BotState {
  settings: BotSettings;
  plans: Plan[];
  pro: boolean;
}

const FIELDS: { key: keyof BotSettings; label: string; hint: string; min: number; max: number; step: number; suffix: string }[] = [
  { key: 'riskPct', label: 'Risk per trade', hint: 'Share of the account lost if the stop fills. The position size falls out of this.', min: 0.25, max: 10, step: 0.25, suffix: '%' },
  { key: 'maxPositions', label: 'Open positions', hint: 'How many trades it may run at once.', min: 1, max: 10, step: 1, suffix: '' },
  { key: 'maxPositionPct', label: 'Max position', hint: 'Cap on any one position, however tight the stop is.', min: 1, max: 50, step: 1, suffix: '%' },
  { key: 'minScore', label: 'Minimum score', hint: 'Opportunity score a coin must reach before it is considered.', min: 50, max: 100, step: 1, suffix: '' },
  { key: 'maxRisk', label: 'Maximum risk', hint: 'Risk score above which it will not trade.', min: 0, max: 100, step: 1, suffix: '' },
  { key: 'timeStopMin', label: 'Time stop', hint: 'Close a position that has hit neither a target nor its stop in this long.', min: 5, max: 1440, step: 5, suffix: 'm' },
];

/** The paper trading bot: what it is doing, and the switch that stops it. */
export default function TradingBotPage() {
  const toast = useToast();
  const [state, setState] = useState<BotState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => get<BotState>('/api/bot').then(setState).catch(() => undefined), []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(id);
  }, [load]);

  const save = async (patch: Partial<BotSettings>) => {
    setSaving(true);
    try {
      const r = await put<{ settings: BotSettings }>('/api/bot', patch);
      setState((s) => (s ? { ...s, settings: r.settings } : s));
    } catch (e) {
      toast.error('Could not save', e instanceof Error ? e.message : undefined);
      void load();
    } finally {
      setSaving(false);
    }
  };

  if (!state) return <Spinner className="mx-auto mt-10 size-6" />;

  const { settings, plans, pro } = state;
  const open = plans.filter((p) => p.status === 'open');
  const closed = plans.filter((p) => p.status === 'closed');
  const realized = closed.reduce((s, p) => s + p.realizedPnl, 0);
  const wins = closed.filter((p) => p.realizedPnl > 0).length;

  return (
    <div className="space-y-5">
      <PageHeader title="Trading bot" subtitle="Runs the strategy on your paper account, without you watching" />

      {/* Stated once, plainly, at the top — not buried in a footnote. */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-line bg-bg-2/60 p-3 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          This bot trades <span className="font-semibold text-fg">paper money only</span>. This application holds no wallet, no private key and no way to sign a
          transaction, so nothing here can place a real order. It is a way to test whether the rules are worth anything before you risk your own money — never a
          promise that they are.
        </p>
      </div>

      <Section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={cn('grid size-11 place-items-center rounded-2xl', settings.enabled ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-muted')}>
              <Bot className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">{settings.enabled ? 'Running' : 'Stopped'}</p>
              <p className="text-xs text-muted">
                {open.length} open · {closed.length} closed · realised{' '}
                <span className={cn('num font-semibold', realized >= 0 ? 'text-primary' : 'text-danger')}>{formatSignedUsd(realized)}</span>
              </p>
            </div>
          </div>

          {pro ? (
            <button
              className={cn('btn', settings.enabled ? 'btn-outline text-danger' : 'btn-primary')}
              disabled={saving}
              onClick={() => void save({ enabled: !settings.enabled })}
            >
              {settings.enabled ? (
                <>
                  <CircleStop className="size-4" /> Stop the bot
                </>
              ) : (
                <>
                  <Play className="size-4" /> Start the bot
                </>
              )}
            </button>
          ) : (
            <Link to="/pro" className="btn btn-primary">
              <Lock className="size-4" /> Unlock with Pro
            </Link>
          )}
        </div>
      </Section>

      <Section title="Rules it follows">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{f.label}</span>
                <span className="num text-sm font-semibold text-primary">
                  {settings[f.key] as number}
                  {f.suffix}
                </span>
              </span>
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={settings[f.key] as number}
                disabled={saving}
                onChange={(e) => setState((s) => (s ? { ...s, settings: { ...s.settings, [f.key]: Number(e.target.value) } } : s))}
                onPointerUp={(e) => void save({ [f.key]: Number((e.target as HTMLInputElement).value) })}
                onKeyUp={(e) => void save({ [f.key]: Number((e.target as HTMLInputElement).value) })}
                className="mt-2 w-full accent-[var(--color-primary)]"
              />
              <span className="mt-1 block text-[11px] leading-relaxed text-muted">{f.hint}</span>
            </label>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 text-[11px] text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          It takes most of a position off at the first target, then lifts the stop to the entry to cap what a reversal costs on the rest. That is not the same
          as risk-free: a stop is a price it watches, not one it is guaranteed, and a coin this thin can gap straight through and fill well below it. Changes
          apply to the next position it opens, not to ones already running.
        </p>
      </Section>

      <Section title={`Positions (${open.length} open)`}>
        {plans.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            {settings.enabled ? 'Waiting for a setup that passes every rule. Most coins never do.' : 'Nothing yet — the bot is stopped.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {plans.slice(0, 20).map((p) => (
              <li key={p.id} className="rounded-2xl border border-line bg-bg-2/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/tokens/${p.mint}`} className="font-semibold hover:text-primary">
                    ${p.symbol}
                  </Link>
                  <span className={cn('chip', p.status === 'open' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-line bg-surface-2 text-muted')}>
                    {p.status === 'open' ? 'Open' : (p.closeCause ?? 'closed')}
                  </span>
                  <span className="text-[11px] text-muted">{timeAgo(p.openedAt)}</span>
                  <span className={cn('num ml-auto text-sm font-semibold', p.realizedPnl >= 0 ? 'text-primary' : 'text-danger')}>{formatSignedUsd(p.realizedPnl)}</span>
                </div>
                <div className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                  <span>entry ${p.entry.toPrecision(4)}</span>
                  <span className={p.stop >= p.entry ? 'text-primary' : undefined}>
                    stop ${p.stop.toPrecision(4)}
                    {p.stop >= p.entry ? ' (break-even)' : ''}
                  </span>
                  {p.exits.map((e, i) => (
                    <span key={e.label} className={p.filled.includes(i) ? 'text-primary line-through' : undefined}>
                      {e.label} ${e.price.toPrecision(4)} · {e.sharePct}%
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {closed.length > 0 && (
          <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-muted">
            {wins} of {closed.length} closed trades were profitable. That is a record of what happened, not a forecast — and on this few trades it is far too
            small a sample to call an edge.
          </p>
        )}
      </Section>
    </div>
  );
}
