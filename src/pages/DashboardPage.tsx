import { Activity, ArrowRight, Bell, Coins, Droplets, Eye, Flame, History, Radio, ShieldAlert, Zap } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConnectionDot } from '../components/layout/ConnectionStatus';
import { AlertCard } from '../components/token/AlertCard';
import { StrictFilterCard } from '../components/token/StrictFilterCard';
import { TokenCard } from '../components/token/TokenCard';
import { EmptyState } from '../components/ui/EmptyState';
import { ChangeText, NewBadge, PageHeader, ProgressBar, Section, Segmented, SignalBadge, TokenAvatar } from '../components/ui/primitives';
import { StatCard } from '../components/ui/StatCard';
import { VirtualList } from '../components/ui/VirtualList';
import { useAuth } from '../context/AuthContext';
import { useMarket } from '../context/MarketContext';
import { useTrading } from '../context/TradingContext';
import { useNow } from '../hooks/useNow';
import { isTrending, sortTokens } from '../services/tokenFilters';
import type { Token } from '../types';
import { cn } from '../utils/cn';
import { formatAge, formatCompactUsd, formatNumber, formatSignedUsd, formatTime, formatUsd } from '../utils/format';

const SIGNALS = ['WATCH', 'HIGH-RISK SETUP', 'AVOID', 'INSUFFICIENT DATA'] as const;

export default function DashboardPage() {
  const { tokens, stats, statsHistory, alerts, unreadCount, markRead, deleteAlert, getToken, health, lastUpdated } = useMarket();
  const { summary } = useTrading();
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow(5_000);
  const [moverTab, setMoverTab] = useState<'gainers' | 'losers'>('gainers');

  const scored = useMemo(() => tokens.filter((t) => t.signal !== 'INSUFFICIENT DATA'), [tokens]);
  const watch = useMemo(() => sortTokens(scored.filter((t) => t.signal === 'WATCH'), 'score', 'desc').slice(0, 6), [scored]);
  const highRisk = useMemo(() => sortTokens(scored.filter((t) => t.riskScore >= 60 && t.volume5m > 0), 'volume5m', 'desc').slice(0, 5), [scored]);
  const trending = useMemo(() => sortTokens(scored.filter(isTrending), 'volume5m', 'desc').slice(0, 6), [scored]);
  const movers = useMemo(
    () => sortTokens(scored.filter((t) => t.priceChange5m !== null), 'priceChange5m', moverTab === 'gainers' ? 'desc' : 'asc').slice(0, 6),
    [scored, moverTab],
  );
  const changes = useMemo(
    () =>
      tokens
        .filter((t) => t.lastChange && now - t.lastChange.t < 30 * 60_000)
        .sort((a, b) => (b.lastChange?.t ?? 0) - (a.lastChange?.t ?? 0))
        .slice(0, 6),
    [tokens, now],
  );
  const recentAlerts = alerts.slice(0, 4);
  const criticalUnread = alerts.filter((a) => !a.read && a.severity === 'critical').length;
  const statusTone = stats.status === 'Bullish' ? 'text-primary' : stats.status === 'Bearish' ? 'text-danger' : 'text-warning';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Hey ${user?.name.split(' ')[0] ?? 'trader'} 👋`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            Live Solana launch terminal <ConnectionDot /> {lastUpdated && <span className="num text-xs text-muted">· {formatTime(lastUpdated)}</span>}
          </span>
        }
        actions={
          <>
            <Link to="/report" className="btn btn-outline btn-sm">
              Market report
            </Link>
            <Link to="/tokens" className="btn btn-primary btn-sm">
              All tokens <ArrowRight className="size-3.5" />
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard label="Tokens tracked" value={formatNumber(stats.totalTokens)} hint={`${stats.launchesLastHour} launched in the last hour`} icon={Coins} trend={statsHistory.map((h) => h.tokens)} onClick={() => navigate('/tokens')} />
        <StatCard label="Launches detected" value={formatNumber(health?.launchesDetected ?? 0)} hint={health?.stream === 'open' ? 'Streaming live since server start' : 'Polling fallback'} icon={Radio} tone="accent" onClick={() => navigate('/tokens?tab=new')} />
        <StatCard label="24h volume" value={formatCompactUsd(stats.totalVolume)} hint="Across tracked tokens" icon={Activity} tone="accent" trend={statsHistory.map((h) => h.volume)} />
        <StatCard label="Liquidity" value={formatCompactUsd(stats.totalLiquidity)} hint="Across tracked tokens" icon={Droplets} tone="accent" trend={statsHistory.map((h) => h.liquidity)} />
        <StatCard
          label="Unread alerts"
          value={<span className={unreadCount ? 'text-danger' : undefined}>{unreadCount}</span>}
          hint={criticalUnread ? `${criticalUnread} critical` : unreadCount ? 'None critical' : 'All caught up'}
          icon={Bell}
          tone="danger"
          onClick={() => navigate('/alerts')}
        />
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-5 3xl:grid-cols-6">
        <Section
          className="xl:col-span-3 3xl:col-span-4"
          title={
            <span className="flex items-center gap-2">
              <Radio className="size-4 text-primary" /> New launches <span className="num text-xs font-normal text-muted">({stats.launchesLastHour}/h)</span>
            </span>
          }
          action={
            <Link to="/tokens?tab=new" className="text-xs font-semibold text-primary hover:underline">
              Full feed
            </Link>
          }
        >
          {tokens.length ? (
            <VirtualList
              items={tokens}
              rowHeight={60}
              height={440}
              ariaLabel="New token feed"
              getKey={(t) => t.id}
              renderRow={(t) => (
                <Link to={`/tokens/${t.id}`} className={cn('flex h-full items-center gap-3 border-b border-line/60 px-1 transition hover:bg-surface-2/60', now - t.detectedAt < 15_000 && 'animate-flash')}>
                  <TokenAvatar token={t} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                      ${t.symbol} <span className="truncate text-xs font-normal text-muted">{t.name}</span> <NewBadge detectedAt={t.detectedAt} />
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {formatAge(t.createdAt)} · {t.launchpad} · {t.marketCap ? `${formatCompactUsd(t.marketCap)} mcap` : 'awaiting market data'}
                      {t.holders > 1 && ` · ${t.holders} holders`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <SignalBadge signal={t.signal} short />
                    {t.priceChange5m !== null ? <ChangeText value={t.priceChange5m} className="text-[11px]" /> : <span className="text-[11px] text-subtle">—</span>}
                  </div>
                </Link>
              )}
            />
          ) : (
            <EmptyState icon={Radio} title="Listening for launches…" description="New Solana tokens appear here the moment they are created." />
          )}
        </Section>

        <div className="space-y-4 sm:space-y-6 xl:col-span-2">
          <Section
            title={
              <span className="flex items-center gap-2">
                <Eye className="size-4 text-primary" /> WATCH signals
              </span>
            }
            action={
              <Link to="/tokens?signal=WATCH&sort=score&dir=desc" className="text-xs font-semibold text-primary hover:underline">
                See all
              </Link>
            }
          >
            {watch.length ? (
              <div className="space-y-2">
                {watch.map((t) => (
                  <TokenCard key={t.id} token={t} />
                ))}
              </div>
            ) : (
              <EmptyState icon={Eye} title="Nothing on watch" description="No token currently combines a strong score with manageable risk." />
            )}
          </Section>

          <StrictFilterCard />

          <Section title="Market pulse">
            <div className="flex items-end justify-between">
              <div>
                <p className={cn('text-2xl font-bold', statusTone)}>{stats.status}</p>
                <p className="text-xs text-muted">Breadth of tracked tokens (1h)</p>
              </div>
              <p className="num text-3xl font-bold">
                {stats.sentiment}
                <span className="text-sm text-muted">/100</span>
              </p>
            </div>
            <div className="mt-3">
              <ProgressBar value={stats.sentiment} tone={stats.status === 'Bullish' ? 'primary' : stats.status === 'Bearish' ? 'danger' : 'warning'} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {SIGNALS.map((s) => (
                <Link key={s} to={`/tokens?signal=${encodeURIComponent(s)}`} className="flex flex-col items-center gap-1 rounded-lg border border-line bg-bg-2/60 p-2 text-center hover:border-line-strong">
                  <span className="num text-base font-bold">{stats.signals[s]}</span>
                  <SignalBadge signal={s} short />
                </Link>
              ))}
            </div>
            <Link to="/portfolio" className="mt-3 flex items-center justify-between rounded-xl border border-line bg-bg-2/60 p-3 transition hover:border-line-strong">
              <div>
                <p className="text-[11px] text-muted">Paper portfolio</p>
                <p className="num font-bold">{formatUsd(summary.totalValue)}</p>
              </div>
              <span className={cn('num text-sm font-semibold', summary.pnl24h >= 0 ? 'text-primary' : 'text-danger')}>{formatSignedUsd(summary.pnl24h)} 24h</span>
            </Link>
          </Section>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 2xl:grid-cols-4">
        <Section
          title={
            <span className="flex items-center gap-2">
              <Flame className="size-4 text-warning" /> Volume accelerating
            </span>
          }
          action={
            <Link to="/tokens?tab=trending" className="text-xs font-semibold text-primary hover:underline">
              More
            </Link>
          }
        >
          {trending.length ? (
            <ul className="space-y-1">
              {trending.map((t) => (
                <MiniRow key={t.id} token={t} right={<span className="num text-xs text-muted">{formatCompactUsd(t.volume5m)}/5m</span>} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={Flame} title="No accelerating volume" />
          )}
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              <Zap className="size-4 text-accent" /> 5m movers
            </span>
          }
          action={
            <Segmented
              size="sm"
              label="Movers"
              value={moverTab}
              onChange={setMoverTab}
              options={[
                { value: 'gainers', label: 'Up' },
                { value: 'losers', label: 'Down' },
              ]}
            />
          }
        >
          {movers.length ? (
            <ul className="space-y-1">
              {movers.map((t) => (
                <MiniRow key={t.id} token={t} right={<ChangeText value={t.priceChange5m ?? 0} className="text-sm" />} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={Zap} title="No movers yet" />
          )}
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              <History className="size-4 text-accent" /> Why scores changed
            </span>
          }
        >
          {changes.length ? (
            <ul className="space-y-2">
              {changes.map((t) => {
                const c = t.lastChange!;
                return (
                  <li key={t.id}>
                    <Link to={`/tokens/${t.id}?tab=ai`} className="block rounded-lg px-2 py-1.5 hover:bg-surface-2">
                      <p className="flex items-center justify-between gap-2 text-sm font-semibold">
                        ${t.symbol}
                        <span className="num text-xs">
                          <span className={c.scoreDelta >= 0 ? 'text-primary' : 'text-danger'}>
                            Opp {c.scoreDelta >= 0 ? '+' : ''}
                            {c.scoreDelta}
                          </span>{' '}
                          <span className={c.riskDelta > 0 ? 'text-danger' : 'text-primary'}>
                            Risk {c.riskDelta >= 0 ? '+' : ''}
                            {c.riskDelta}
                          </span>
                        </span>
                      </p>
                      <p className="truncate text-[11px] text-muted">{c.reasons[0]}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={History} title="No recent changes" description="Material score changes and their causes appear here." />
          )}
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-danger" /> High risk, high activity
            </span>
          }
        >
          {highRisk.length ? (
            <ul className="space-y-1">
              {highRisk.map((t) => (
                <MiniRow key={t.id} token={t} right={<span className="num text-xs font-semibold text-danger">{t.riskScore}/100</span>} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={ShieldAlert} title="None right now" />
          )}
        </Section>
      </div>

      <Section
        title={
          <span className="flex items-center gap-2">
            <Bell className="size-4 text-danger" /> Recent alerts
          </span>
        }
        action={
          <Link to="/alerts" className="text-xs font-semibold text-primary hover:underline">
            View all
          </Link>
        }
      >
        {recentAlerts.length ? (
          <ul className="grid gap-2 lg:grid-cols-2">
            {recentAlerts.map((a) => (
              <AlertCard key={a.id} alert={a} token={getToken(a.tokenId)} now={now} onToggleRead={() => markRead(a.id, !a.read)} onDelete={() => deleteAlert(a.id)} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={Bell} title="No alerts yet" description="Alerts arrive as launches qualify for your thresholds (Settings → Alerts)." />
        )}
      </Section>
    </div>
  );
}

function MiniRow({ token, right }: { token: Token; right: ReactNode }) {
  return (
    <li>
      <Link to={`/tokens/${token.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-surface-2">
        <TokenAvatar token={token} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">${token.symbol}</p>
          <p className="truncate text-[11px] text-muted">
            {formatAge(token.createdAt)} · {formatCompactUsd(token.marketCap)}
          </p>
        </div>
        {right}
      </Link>
    </li>
  );
}
