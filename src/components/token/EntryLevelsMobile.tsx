import { ChevronRight, Crosshair, Lock } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildLevelsPlan, type LevelsPlan } from '../../../shared/levels';
import { useAuth } from '../../context/AuthContext';
import type { Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatCompactUsd } from '../../utils/format';
import { TokenAvatar } from '../ui/primitives';

/**
 * Entry levels on the phone: where a coin has actually traded, and where a split entry would sit
 * against that. The desktop card shows five coins across four columns; a phone gets three coins,
 * each with its four figures in a grid you can read without squinting.
 */
export function EntryLevelsMobile({ tokens, limit = 3 }: { tokens: Token[]; limit?: number }) {
  const { user } = useAuth();
  const pro = Boolean(user?.pro);

  const rows = useMemo(
    () =>
      tokens
        .filter((t) => t.signal !== 'INSUFFICIENT DATA' && t.signal !== 'AVOID')
        .sort((a, b) => b.score - a.score)
        .map((token) => ({ token, plan: buildLevelsPlan(token) }))
        .filter((r): r is { token: Token; plan: LevelsPlan } => r.plan !== null)
        .slice(0, limit),
    [tokens, limit],
  );

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3 py-1.5 text-xs font-semibold text-primary">
          <Crosshair className="size-3.5" aria-hidden /> Entry levels
        </span>
        <span className="text-[11px] text-muted">From price action</span>
      </div>

      {!pro ? (
        <div className="rounded-2xl border border-line bg-surface-2 p-4 text-center">
          <Lock className="mx-auto size-5 text-primary" aria-hidden />
          <p className="mt-1.5 text-sm font-semibold">Entry levels are part of Pro</p>
          <p className="mt-1 text-xs text-muted">
            {rows.length ? `${rows.length} coins have levels right now` : 'Levels appear as coins build price action'} — two entries with their split, a stop and a
            target.
          </p>
          <Link to="/pro" className="btn btn-primary btn-sm mt-3">
            Unlock with Pro
          </Link>
        </div>
      ) : rows.length ? (
        <ul className="space-y-3">
          {rows.map(({ token, plan }) => (
            <li key={token.id}>
              <Link to={`/tokens/${token.id}`} className="block rounded-2xl border border-line bg-surface-2/60 p-3 transition active:scale-[0.99]">
                <div className="flex items-center gap-2.5">
                  <TokenAvatar token={token} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">${token.symbol}</span>
                  <span className="num shrink-0 rounded-full border border-line bg-bg-2 px-2 py-0.5 text-[11px] font-semibold">R/R {plan.rr.toFixed(1)}</span>
                  <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                  {plan.entries.map((e, i) => (
                    <Cell key={e.label} label={`Entry ${i + 1} · ${e.allocationPct}%`} value={formatCompactUsd(e.price)} tone="text-accent" />
                  ))}
                  <Cell label={`Stop −${plan.stopPct.toFixed(0)}%`} value={formatCompactUsd(plan.stop)} tone="text-danger" />
                  <Cell label="Target 1" value={formatCompactUsd(plan.tp1)} tone="text-primary" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted">
          Levels appear once a coin has a few minutes of recorded price action and is not rated AVOID.
        </p>
      )}

      <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-muted">
        Where each coin has traded — floor, ceiling and a split entry. Observed structure, not advice.
      </p>
    </section>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span className="block rounded-xl border border-line bg-surface px-2.5 py-1.5">
      <span className="block truncate text-[10px] text-muted">{label}</span>
      <span className={cn('num block truncate text-sm font-semibold', tone)}>{value}</span>
    </span>
  );
}
