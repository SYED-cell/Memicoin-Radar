import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMarket } from '../../context/MarketContext';
import { useFullToken } from '../../hooks/useTokenData';
import { sortTokens } from '../../services/tokenFilters';
import type { Token } from '../../types';
import { TokenAvatar } from '../ui/primitives';

/**
 * Resolves the token for pages addressed as /<base>/:id? — defaults to the highest-scoring token
 * with a full analysis. Loads the full record (history, trades) for charts.
 */
export function useRouteToken() {
  const { id } = useParams();
  const { tokens } = useMarket();
  const fallback = useMemo(() => sortTokens(tokens.filter((t) => t.signal !== 'INSUFFICIENT DATA'), 'score', 'desc')[0] ?? tokens[0], [tokens]);
  const mint = id ?? fallback?.id;
  const { token, loading, notFound } = useFullToken(mint);
  return { token: token ?? undefined, requestedId: id, loading, notFound };
}

export function TokenSwitcher({ token, basePath }: { token: Token; basePath: string }) {
  const { tokens } = useMarket();
  const navigate = useNavigate();
  const options = useMemo(() => {
    const list = sortTokens(tokens.filter((t) => t.signal !== 'INSUFFICIENT DATA'), 'score', 'desc').slice(0, 150);
    return list.some((t) => t.id === token.id) ? list : [token, ...list];
  }, [tokens, token]);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TokenAvatar token={token} size="sm" />
      <label htmlFor="token-switcher" className="sr-only">
        Select token
      </label>
      <select id="token-switcher" className="input h-9 w-48 py-1.5" value={token.id} onChange={(e) => navigate(`${basePath}/${e.target.value}`)}>
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            ${t.symbol} · {t.score}/100 · risk {t.riskScore}
          </option>
        ))}
      </select>
    </div>
  );
}
