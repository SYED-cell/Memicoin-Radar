import { ArrowLeftRight, Copy, ExternalLink, SearchX, ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SIGNAL_EXPLAINER } from '../../shared/aiService.ts';
import { scoreLabel } from '../../shared/opportunityEngine.ts';
import { riskLevel } from '../../shared/riskEngine.ts';
import { LiquidityChart } from '../components/charts/LiquidityChart';
import { PriceChart } from '../components/charts/PriceChart';
import { ScoreHistoryChart } from '../components/charts/ScoreHistoryChart';
import { VolumeChart } from '../components/charts/VolumeChart';
import { AIAnalysisCard, ScenarioRanges } from '../components/token/AIAnalysisCard';
import { FactorBreakdown } from '../components/token/FactorBreakdown';
import { CreatorPanel, ExtLink, HoldersPanel, SecurityPanel, solscan, TransactionsPanel } from '../components/token/IntelPanels';
import { TradingModal } from '../components/token/TradingModal';
import { VerificationPanel, VerifyBadge } from '../components/token/VerificationPanel';
import { WatchButton } from '../components/token/WatchButton';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { ChangeText, KeyValue, NewBadge, PageHeader, ProgressBar, ScoreGauge, Section, Segmented, SignalBadge, SourceBadge, TokenAvatar } from '../components/ui/primitives';
import { RiskBadge } from '../components/ui/RiskBadge';
import { useMarket } from '../context/MarketContext';
import { useToast } from '../context/ToastContext';
import { useTrading } from '../context/TradingContext';
import { useFullToken } from '../hooks/useTokenData';
import { TIMEFRAMES } from '../services/chartService';
import type { Timeframe, Token, TradeSide } from '../types';
import { cn } from '../utils/cn';
import { formatAge, formatCompact, formatCompactUsd, formatDateTime, formatNumber, formatPercent, formatPrice, formatQty, formatSignedUsd, shortAddress } from '../utils/format';

const TABS = ['overview', 'verify', 'chart', 'holders', 'creator', 'security', 'transactions', 'ai'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: 'Overview', verify: 'Strict filter', chart: 'Chart', holders: 'Holders', creator: 'Creator', security: 'Security', transactions: 'Transactions', ai: 'AI Analysis' };

export default function TokenDetailsPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'overview';
  const { token, loading, notFound, error } = useFullToken(id);
  const { health } = useMarket();
  const [trade, setTrade] = useState<TradeSide | null>(null);

  if (loading) return <LoadingState label="Loading token from the live feed…" rows={5} />;
  if (!token) {
    return (
      <div className="card">
        <EmptyState
          icon={SearchX}
          title={notFound ? 'Token not found' : 'Could not load token'}
          description={notFound ? `No Solana token with mint "${id}" is known to the radar or market data providers.` : (error ?? 'Please retry.')}
          action={
            <Link to="/tokens" className="btn btn-primary">
              Browse live tokens
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header token={token} onTrade={setTrade} />
      <div className="sticky top-14 z-30 -mx-4 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur md:top-16 md:-mx-6 md:px-6">
        <Segmented label="Token sections" size="sm" value={tab} onChange={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })} options={TABS.map((t) => ({ value: t, label: TAB_LABEL[t] }))} />
      </div>
      {tab === 'overview' && <Overview token={token} onTrade={setTrade} />}
      {tab === 'verify' && (
        <Section title="Strict verified-coin filter">
          <VerificationPanel token={token} />
        </Section>
      )}
      {tab === 'chart' && <ChartTab token={token} />}
      {tab === 'holders' && (
        <Section title="Holder distribution">
          <HoldersPanel token={token} />
        </Section>
      )}
      {tab === 'creator' && (
        <Section title="Creator / owner intelligence">
          <CreatorPanel token={token} />
        </Section>
      )}
      {tab === 'security' && (
        <div className="grid gap-4 xl:grid-cols-5">
          <Section title="Security checks" className="xl:col-span-3">
            <SecurityPanel token={token} />
          </Section>
          <Section title="Risk breakdown" className="xl:col-span-2">
            <FactorBreakdown breakdown={token.risk} kind="risk" dense />
          </Section>
        </div>
      )}
      {tab === 'transactions' && (
        <Section title="Transactions">
          <TransactionsPanel token={token} tradeStream={Boolean(health?.tradeStream)} />
        </Section>
      )}
      {tab === 'ai' && <AIAnalysisCard token={token} />}
      <TradingModal open={trade !== null} onClose={() => setTrade(null)} tokenId={token.id} initialSide={trade ?? 'buy'} />
    </div>
  );
}

function Header({ token, onTrade }: { token: Token; onTrade: (s: TradeSide) => void }) {
  const toast = useToast();
  const { positionFor } = useTrading();
  const position = positionFor(token.id);
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Clipboard unavailable');
    }
  };
  return (
    <PageHeader
      back="/tokens"
      title={
        <span className="flex items-center gap-3">
          <TokenAvatar token={token} size="lg" />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              ${token.symbol} <NewBadge detectedAt={token.detectedAt} /> <SourceBadge source={token.source} />
              {token.verify && (
                <Link to="?tab=verify" aria-label="Strict filter status">
                  <VerifyBadge status={token.verify.status} />
                </Link>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 text-sm font-normal text-muted">
              <span className="truncate">{token.name}</span>·<span>{token.launchpad}</span>·
              <button onClick={() => copy(token.mint, 'Mint address')} className="num inline-flex items-center gap-1 hover:text-primary" aria-label="Copy mint address">
                {shortAddress(token.mint)} <Copy className="size-3" />
              </button>
            </span>
          </span>
        </span>
      }
      actions={
        <>
          <WatchButton token={token} variant="button" className="btn-sm" />
          <button className="btn btn-primary btn-sm" onClick={() => onTrade('buy')} disabled={!token.price}>
            <ShoppingCart className="size-3.5" /> Buy
          </button>
          {position && (
            <button className="btn btn-danger btn-sm" onClick={() => onTrade('sell')}>
              <ArrowLeftRight className="size-3.5" /> Sell
            </button>
          )}
        </>
      }
    />
  );
}

function Overview({ token, onTrade }: { token: Token; onTrade: (s: TradeSide) => void }) {
  const [tf, setTf] = useState<Timeframe>('1H');
  const { state, positionFor } = useTrading();
  const trades = useMemo(() => state.transactions.filter((t) => t.tokenId === token.id), [state.transactions, token.id]);
  const position = positionFor(token.id);
  const flowTotal = token.buyVolume + token.sellVolume;
  const buyShare = flowTotal > 0 ? token.buyVolume / flowTotal : 0.5;
  const level = riskLevel(token.riskScore);
  const scored = token.signal !== 'INSUFFICIENT DATA';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Section className="xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p key={token.updatedAt} className="num animate-flash rounded text-3xl font-bold tracking-tight sm:text-4xl">
                {token.price ? formatPrice(token.price) : '—'}
              </p>
              <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
                {token.priceChange5m !== null && (
                  <span>
                    <ChangeText value={token.priceChange5m} /> <span className="text-muted">5m</span>
                  </span>
                )}
                {token.priceChange1h !== null && (
                  <span>
                    <ChangeText value={token.priceChange1h} /> <span className="text-muted">1h</span>
                  </span>
                )}
                <span>
                  <ChangeText value={token.priceChange24h} /> <span className="text-muted">24h</span>
                </span>
              </p>
            </div>
            <Segmented label="Timeframe" size="sm" value={tf} onChange={setTf} options={TIMEFRAMES.map((t) => ({ value: t, label: t }))} className="w-full sm:w-auto" />
          </div>
          <PriceChart token={token} timeframe={tf} height={280} trades={trades} />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-primary" /> Buy marker
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-danger" /> Sell marker
            </span>
            <span>Updated {formatDateTime(token.updatedAt)}</span>
            <span className="ml-auto flex gap-3">
              <ExtLink href={solscan('token', token.mint)}>Solscan</ExtLink>
              <ExtLink href={`https://dexscreener.com/solana/${token.mint}`}>DexScreener</ExtLink>
              {/pump/i.test(token.launchpad) && <ExtLink href={`https://pump.fun/coin/${token.mint}`}>pump.fun</ExtLink>}
            </span>
          </div>
        </Section>

        <Section>
          <div className="flex items-center justify-between">
            <h2 className="section-title">Signal</h2>
            <SignalBadge signal={token.signal} />
          </div>
          <p className="mt-2 text-xs text-muted">{SIGNAL_EXPLAINER[token.signal]}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <ScoreGauge value={token.score} sublabel={scored ? scoreLabel(token.score) : 'Pending'} size={170} label="Opportunity" />
              <p className="mt-1 text-center text-[11px] text-muted">Opportunity</p>
            </div>
            <div>
              <ScoreGauge value={token.riskScore} sublabel={scored ? `${level} risk` : 'Pending'} tone={level === 'Low' ? 'primary' : level === 'Medium' ? 'warning' : 'danger'} size={170} label="Risk" />
              <p className="mt-1 text-center text-[11px] text-muted">Risk</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <KeyValue label="Momentum" value={token.momentum} />
            <KeyValue label="Phase" value={token.phase} />
            <KeyValue label="Confidence" value={`${token.confidence}%`} />
          </div>
          {token.lastChange && (
            <Link to={`?tab=ai`} className="mt-3 block rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs hover:border-accent">
              <p className="font-semibold text-accent">
                Last change: Opp {token.lastChange.scoreDelta >= 0 ? '+' : ''}
                {token.lastChange.scoreDelta}, Risk {token.lastChange.riskDelta >= 0 ? '+' : ''}
                {token.lastChange.riskDelta}
              </p>
              <p className="mt-0.5 truncate text-muted">{token.lastChange.reasons[0]}</p>
            </Link>
          )}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Token data" className="xl:col-span-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
            <KeyValue label="Market cap" value={token.marketCap ? formatCompactUsd(token.marketCap) : '—'} />
            <KeyValue label="FDV" value={token.fdv ? formatCompactUsd(token.fdv) : '—'} />
            <KeyValue label="Liquidity" value={<>{token.liquidity ? formatCompactUsd(token.liquidity) : '—'} {token.liquidityChange5m !== null && <ChangeText value={token.liquidityChange5m} className="text-[11px]" />}</>} />
            <KeyValue label="Volume 5m / 1h" value={`${formatCompactUsd(token.volume5m)} / ${formatCompactUsd(token.volume1h)}`} />
            <KeyValue label="Volume 24h" value={formatCompactUsd(token.volume24h)} />
            <KeyValue label="Holders" value={<>{formatCompact(token.holders)} {token.holdersChange !== null && <ChangeText value={token.holdersChange} className="text-[11px]" />}</>} />
            <KeyValue label="Transactions (24h)" value={formatNumber(token.transactions24h)} />
            <KeyValue label="Buys / Sells" value={`${formatNumber(token.buys24h)} / ${formatNumber(token.sells24h)}`} />
            <KeyValue label="Age" value={formatAge(token.createdAt)} />
            <KeyValue label="Launched" value={new Date(token.createdAt).toLocaleString()} />
            <KeyValue label="Bonding curve" value={token.graduated ? 'Graduated' : token.bondingProgress !== null ? `${token.bondingProgress.toFixed(0)}%` : '—'} />
            <KeyValue label="Organic score" value={token.organicScore === null ? '—' : `${Math.round(token.organicScore)}/100`} />
          </div>
          {!token.graduated && token.bondingProgress !== null && (
            <div className="mt-3">
              <ProgressBar value={token.bondingProgress} tone="accent" />
            </div>
          )}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold">Buy / Sell flow (1h)</span>
              <span className="num text-muted">
                {formatCompactUsd(token.buyVolume)} / {formatCompactUsd(token.sellVolume)}
              </span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={`Buys ${Math.round(buyShare * 100)} percent of flow`}>
              <div className="bg-primary transition-all duration-700" style={{ width: `${buyShare * 100}%` }} />
              <div className="flex-1 bg-danger" />
            </div>
            <div className="num mt-1 flex justify-between text-xs">
              <span className="text-primary">{formatPercent(buyShare * 100, 0, false)} buy</span>
              <span className="text-danger">{formatPercent((1 - buyShare) * 100, 0, false)} sell</span>
            </div>
          </div>
          {(token.socials.twitter || token.socials.telegram || token.socials.website || token.description) && (
            <div className="mt-4 rounded-xl border border-line bg-bg-2/60 p-3 text-sm">
              {token.description && <p className="text-xs break-words text-muted">{token.description}</p>}
              <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                {token.socials.twitter && <ExtLink href={token.socials.twitter}>X / Twitter</ExtLink>}
                {token.socials.telegram && <ExtLink href={token.socials.telegram}>Telegram</ExtLink>}
                {token.socials.website && <ExtLink href={token.socials.website}>Website</ExtLink>}
              </div>
            </div>
          )}
        </Section>

        <Section title="Paper position">
          {position ? (
            <div className="space-y-2 text-sm">
              <p className="num font-semibold">
                {formatQty(position.quantity)} ${token.symbol}
              </p>
              <p className="num text-xs text-muted">Entry {formatPrice(position.avgEntry)}</p>
              <p className={cn('num text-sm font-semibold', token.price >= position.avgEntry ? 'text-primary' : 'text-danger')}>{formatSignedUsd((token.price - position.avgEntry) * position.quantity)}</p>
              <p className="num text-xs text-muted">
                SL {position.stopLoss ? formatPrice(position.stopLoss) : '—'} · TP {position.takeProfit ? formatPrice(position.takeProfit) : '—'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">No position. Paper-trade this token at the live price with a stop-loss and take-profit.</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="btn btn-primary" onClick={() => onTrade('buy')} disabled={!token.price}>
              <ShoppingCart className="size-4" /> Buy
            </button>
            <button className="btn btn-danger" onClick={() => onTrade('sell')} disabled={!position}>
              <ArrowLeftRight className="size-4" /> Sell
            </button>
          </div>
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Scenario ranges</h3>
            {scored ? <ScenarioRanges token={token} /> : <p className="text-xs text-muted">Available once enough data is collected.</p>}
          </div>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={<span className="flex items-center gap-2">Opportunity breakdown <span className="num text-primary">{token.score}/100</span></span>}>
          <FactorBreakdown breakdown={token.opportunity} kind="opportunity" dense />
        </Section>
        <Section title={<span className="flex items-center gap-2">Risk breakdown <RiskBadge risk={token.riskScore} /></span>}>
          <FactorBreakdown breakdown={token.risk} kind="risk" dense />
        </Section>
      </div>
      <AIAnalysisCard token={token} compact />
    </div>
  );
}

function ChartTab({ token }: { token: Token }) {
  const [tf, setTf] = useState<Timeframe>('1H');
  const { state } = useTrading();
  const trades = useMemo(() => state.transactions.filter((t) => t.tokenId === token.id), [state.transactions, token.id]);
  return (
    <div className="space-y-4">
      <Section title="Price" action={<Segmented label="Timeframe" size="sm" value={tf} onChange={setTf} options={TIMEFRAMES.map((t) => ({ value: t, label: t }))} />}>
        <PriceChart token={token} timeframe={tf} height={360} trades={trades} />
        <p className="mt-2 text-[11px] text-muted">
          Real-time series recorded from market-data polls{token.trades.length ? ' and the trade stream' : ''}. B/S markers = largest observed trades and your paper trades.{' '}
          <a href={`https://dexscreener.com/solana/${token.mint}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent">
            Full candles on DexScreener <ExternalLink className="size-3" />
          </a>
        </p>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Volume (buy vs sell)">
          <VolumeChart token={token} timeframe={tf} height={200} />
        </Section>
        <Section title="Liquidity">
          <LiquidityChart token={token} timeframe={tf} height={200} />
        </Section>
      </div>
      <Section title="Opportunity vs risk over time">
        <ScoreHistoryChart data={token.scoreHistory} height={200} />
      </Section>
    </div>
  );
}
