import { Crosshair } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildLevelsPlan } from '../../../shared/levels';
import type { Token } from '../../types';
import { formatCompactUsd } from '../../utils/format';
import { EmptyState } from '../ui/EmptyState';
import { Section, SignalBadge, TokenAvatar } from '../ui/primitives';

/**
 * Entry levels for the highest-scoring coins, read from their own recorded price action.
 * Same figures as the coin page, so the home screen answers "where would I get in" directly.
 */
export function EntryLevelsCard({ tokens, limit = 5 }: { tokens: Token[]; limit?: number }) {
  const rows = useMemo(
    () =>
      tokens
        .filter((t) => t.signal !== 'INSUFFICIENT DATA' && t.signal !== 'AVOID')
        .sort((a, b) => b.score - a.score)
        .map((token) => ({ token, plan: buildLevelsPlan(token) }))
        .filter((r): r is { token: Token; plan: NonNullable<ReturnType<typeof buildLevelsPlan>> } => r.plan !== null)
        .slice(0, limit),
    [tokens, limit],
  );

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Crosshair className="size-4 text-accent" /> Entry levels
        </span>
      }
      action={<span className="text-[11px] text-muted">From price action</span>}
    >
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map(({ token, plan }) => (
            <li key={token.id}>
              <Link to={`/tokens/${token.id}`} className="block rounded-lg px-1 py-2.5 transition hover:bg-surface-2">
                <div className="flex items-center gap-2.5">
                  <TokenAvatar token={token} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">${token.symbol}</span>
                  <SignalBadge signal={token.signal} short />
                  <span className="num text-xs text-muted">R/R {plan.rr.toFixed(2)}</span>
                </div>
                <div className="num mt-1.5 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4">
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
        <EmptyState icon={Crosshair} title="No entry levels yet" description="Levels appear once a coin has a few minutes of recorded price action and is not rated AVOID." />
      )}
      <p className="mt-2 text-[11px] text-muted">Where each coin has traded — floor, ceiling and a split entry. Observed structure, not advice.</p>
    </Section>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span className="block rounded-lg border border-line bg-bg-2/60 px-2 py-1">
      <span className="block text-[10px] text-muted">{label}</span>
      <span className={`block truncate font-semibold ${tone}`}>{value}</span>
    </span>
  );
}
