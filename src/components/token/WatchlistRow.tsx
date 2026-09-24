import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getSparkline } from '../../services/chartService';
import type { Token } from '../../types';
import { formatPrice, timeAgo } from '../../utils/format';
import { ChangeText, Sparkline, TokenAvatar } from '../ui/primitives';
import { RiskBadge } from '../ui/RiskBadge';
import { ScoreBadge } from '../ui/ScoreBadge';

export function WatchlistRow({ token, addedAt, onRemove }: { token: Token; addedAt: number; onRemove: () => void }) {
  const spark = useMemo(() => getSparkline(token, 28), [token]);
  return (
    <li className="group flex items-center gap-3 px-3 py-3 transition hover:bg-surface-2/60 sm:px-4">
      <Link to={`/tokens/${token.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <TokenAvatar token={token} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">${token.symbol}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <ScoreBadge score={token.score} />
            <span className="hidden sm:inline-flex">
              <RiskBadge risk={token.riskScore} compact />
            </span>
          </div>
        </div>
        <Sparkline data={spark} className="hidden h-8 w-20 shrink-0 min-[400px]:block sm:w-28" positive={token.priceChange24h >= 0} />
        <div className="w-24 shrink-0 text-right">
          <p className="num text-sm">{formatPrice(token.price)}</p>
          <ChangeText value={token.priceChange24h} className="text-xs" />
          <p className="hidden text-[10px] text-subtle lg:block">added {timeAgo(addedAt)}</p>
        </div>
      </Link>
      <button onClick={onRemove} className="grid size-8 shrink-0 place-items-center rounded-lg text-subtle transition hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${token.symbol} from watchlist`}>
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}
