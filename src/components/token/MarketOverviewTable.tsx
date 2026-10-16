import { Link } from 'react-router-dom';
import type { Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatAge, formatCompactUsd, formatPercent } from '../../utils/format';
import { PriceText } from '../ui/PriceText';
import { TokenAvatar } from '../ui/primitives';

function Pill({ value }: { value: number | null }) {
  if (value === null) return <span className="text-subtle">—</span>;
  const up = value >= 0;
  return (
    <span className={cn('num rounded-md px-2 py-1 text-xs font-semibold', up ? 'bg-primary/12 text-primary' : 'bg-danger/12 text-danger')}>
      {formatPercent(value)}
    </span>
  );
}

/** The ranked table the desktop dashboard closes on: rank, coin, market cap, and how it moved. */
export function MarketOverviewTable({ tokens }: { tokens: Token[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th scope="col" className="w-14 px-4 py-3 font-medium">No</th>
            <th scope="col" className="px-4 py-3 font-medium">Coin name</th>
            <th scope="col" className="w-36 px-4 py-3 text-right font-medium">Market cap</th>
            <th scope="col" className="w-24 px-4 py-3 text-right font-medium">1h</th>
            <th scope="col" className="w-24 px-4 py-3 text-right font-medium">24h</th>
            <th scope="col" className="w-24 px-4 py-3 text-right font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t, i) => (
            <tr key={t.id} className="border-t border-line/70 transition hover:bg-surface-2/60">
              <td className="num px-4 py-3 text-muted">#{i + 1}</td>
              <td className="px-4 py-3">
                <Link to={`/tokens/${t.id}`} className="flex min-w-0 items-center gap-3">
                  <TokenAvatar token={t} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{t.name || `$${t.symbol}`}</span>
                    <span className="block truncate text-[11px] text-muted">${t.symbol}</span>
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3 text-right">
                <PriceText key={t.updatedAt} value={formatCompactUsd(t.marketCap)} className="animate-flash rounded font-semibold" />
              </td>
              <td className="px-4 py-3 text-right"><Pill value={t.priceChange1h} /></td>
              <td className="px-4 py-3 text-right"><Pill value={t.priceChange24h} /></td>
              <td className="num px-4 py-3 text-right text-muted">{formatAge(t.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
