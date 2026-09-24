import { Link } from 'react-router-dom';
import type { Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatAge, formatCompactUsd, formatPrice } from '../../utils/format';
import { ChangeText, NewBadge, SignalBadge, TokenAvatar } from '../ui/primitives';
import { scoreTextTone } from '../ui/ScoreBadge';

/** Compact token row used on the dashboard feeds. */
export function TokenCard({ token, className, showWhy = false }: { token: Token; className?: string; showWhy?: boolean }) {
  const scored = token.signal !== 'INSUFFICIENT DATA';
  return (
    <Link
      to={`/tokens/${token.id}`}
      className={cn('flex min-w-0 items-center gap-3 rounded-xl border border-line bg-bg-2/50 p-3 transition hover:border-line-strong hover:bg-surface-2', className)}
    >
      <TokenAvatar token={token} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">${token.symbol}</span>
          <NewBadge detectedAt={token.detectedAt} />
          {token.priceChange5m !== null && <ChangeText value={token.priceChange5m} className="text-[11px]" />}
        </div>
        <p className="truncate text-[11px] text-muted">
          {scored ? (
            <>
              Opp <span className={cn('num font-semibold', scoreTextTone(token.score))}>{token.score}</span> · Risk{' '}
              <span className="num font-semibold">{token.riskScore}</span> · {formatAge(token.createdAt)}
            </>
          ) : (
            <>Analysing · {formatAge(token.createdAt)} old</>
          )}
        </p>
        {showWhy && token.lastChange && <p className="mt-0.5 truncate text-[10px] text-subtle">{token.lastChange.reasons[0]}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <SignalBadge signal={token.signal} short />
        <span className="num text-[11px] text-muted">{token.marketCap ? formatCompactUsd(token.marketCap) : token.price ? formatPrice(token.price) : '—'}</span>
      </div>
    </Link>
  );
}
