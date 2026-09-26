import { SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LiquidityChart } from '../components/charts/LiquidityChart';
import { PriceChart } from '../components/charts/PriceChart';
import { ScoreHistoryChart } from '../components/charts/ScoreHistoryChart';
import { VolumeChart } from '../components/charts/VolumeChart';
import { TokenSwitcher, useRouteToken } from '../components/token/TokenSwitcher';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { ChangeText, KeyValue, PageHeader, Section, Segmented } from '../components/ui/primitives';
import { useTrading } from '../context/TradingContext';
import { getSeries, TIMEFRAMES } from '../services/chartService';
import type { Timeframe } from '../types';
import { cn } from '../utils/cn';
import { formatCompactUsd, formatPercent, formatPrice } from '../utils/format';

export default function ChartsPage() {
  const { token, requestedId, loading, notFound } = useRouteToken();
  const { state } = useTrading();
  const [tf, setTf] = useState<Timeframe>('1H');
  const series = useMemo(() => (token ? getSeries(token, tf) : []), [token, tf]);
  const trades = useMemo(() => state.transactions.filter((t) => t.tokenId === token?.id), [state.transactions, token?.id]);

  const stats = useMemo(() => {
    if (series.length < 2) return null;
    const prices = series.map((p) => p.price);
    const buy = series.reduce((s, p) => s + p.buyVolume, 0);
    const sell = series.reduce((s, p) => s + p.sellVolume, 0);
    const rets = prices.slice(1).map((p, i) => Math.log(p / prices[i])).filter(Number.isFinite);
    const mean = rets.reduce((s, r) => s + r, 0) / Math.max(rets.length, 1);
    const vol = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(rets.length, 1)) * Math.sqrt(rets.length) * 100;
    return {
      high: Math.max(...prices),
      low: Math.min(...prices),
      change: (prices[prices.length - 1] / prices[0] - 1) * 100,
      volume: buy + sell,
      buyPct: buy + sell > 0 ? (buy / (buy + sell)) * 100 : 50,
      avgLiquidity: series.reduce((s, p) => s + p.liquidity, 0) / series.length,
      volatility: vol,
    };
  }, [series]);

  if (loading) return <LoadingState label="Loading chart data…" rows={3} />;
  if (!token) {
    return (
      <div className="card">
        <EmptyState
          icon={SearchX}
          title={notFound ? 'Token not found' : 'No scored tokens yet'}
          description={notFound ? `No chart data for "${requestedId}".` : 'Charts appear once tokens have market data.'}
          action={<Link to="/tokens" className="btn btn-primary">Browse tokens</Link>}
        />
      </div>
    );
  }

  const tfControl = <Segmented label="Timeframe" size="sm" value={tf} onChange={setTf} options={TIMEFRAMES.map((t) => ({ value: t, label: t }))} />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`$${token.symbol} charts`}
        subtitle={
          <>
            {token.marketCap ? formatCompactUsd(token.marketCap) : '—'} mcap · {token.priceChange5m !== null && <ChangeText value={token.priceChange5m} />} 5m
          </>
        }
        actions={<TokenSwitcher token={token} basePath="/charts" />}
      />
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Price" action={tfControl}>
          <PriceChart token={token} timeframe={tf} height={360} trades={trades} />
          <p className="mt-2 text-[11px] text-muted">Recorded live from market-data polls{token.trades.length ? ' and the trade stream' : ''}. Markers: largest observed trades (B/S) and your paper trades.</p>
        </Section>
        <div className="space-y-4 sm:space-y-6">
          <Section title="Volume (buy vs sell)">
            <VolumeChart token={token} timeframe={tf} height={150} />
          </Section>
          <Section title="Liquidity">
            <LiquidityChart token={token} timeframe={tf} height={150} />
          </Section>
        </div>
      </div>
      <Section title="Opportunity vs risk score">
        <ScoreHistoryChart data={token.scoreHistory} height={180} />
      </Section>
      {stats && (
        <Section title={`Trading statistics · ${tf}`}>
          <div className="mb-4">
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="num font-semibold text-primary">{formatPercent(stats.buyPct, 0, false)} buys</span>
              <span className="num font-semibold text-danger">{formatPercent(100 - stats.buyPct, 0, false)} sells</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full">
              <div className="bg-primary transition-all duration-700" style={{ width: `${stats.buyPct}%` }} />
              <div className="flex-1 bg-danger" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <KeyValue label="Period change" value={<span className={cn(stats.change >= 0 ? 'text-primary' : 'text-danger')}>{formatPercent(stats.change)}</span>} />
            <KeyValue label="High" value={formatPrice(stats.high)} />
            <KeyValue label="Low" value={formatPrice(stats.low)} />
            <KeyValue label="Volume" value={formatCompactUsd(stats.volume)} />
            <KeyValue label="Avg liquidity" value={formatCompactUsd(stats.avgLiquidity)} />
            <KeyValue label="Volatility" value={formatPercent(stats.volatility, 1, false)} />
          </div>
        </Section>
      )}
    </div>
  );
}
