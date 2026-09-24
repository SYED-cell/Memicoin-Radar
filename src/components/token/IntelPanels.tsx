import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useIntel } from '../../hooks/useTokenData';
import type { CheckStatus, CreatorIntel, HolderIntel, SecurityIntel, Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatDateTime, formatNumber, formatPercent, formatPrice, formatQty, formatUsd, shortAddress, timeAgo } from '../../utils/format';
import { EmptyState } from '../ui/EmptyState';
import { Spinner } from '../ui/LoadingState';
import { KeyValue } from '../ui/primitives';

export const solscan = (kind: 'account' | 'token' | 'tx', id: string) => `https://solscan.io/${kind}/${id}`;

export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn('inline-flex items-center gap-1 hover:text-primary', className)}>
      {children}
      <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden />
    </a>
  );
}

function PanelState({ loading, error, onRetry, children }: { loading: boolean; error: string | null; onRetry: () => void; children: ReactNode }) {
  if (loading && !error)
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-muted" role="status">
        <Spinner /> Querying the Solana blockchain…
      </p>
    );
  if (error)
    return (
      <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
        {error}
        <button className="ml-2 font-semibold underline" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  return <>{children}</>;
}

function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button className="btn btn-ghost btn-sm" onClick={onClick} disabled={loading} aria-label="Refresh">
      <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> Refresh
    </button>
  );
}

/* ─────────────────────────── Holders ─────────────────────────── */

export function HoldersPanel({ token }: { token: Token }) {
  const { data, error, loading, reload } = useIntel<HolderIntel>(`/api/tokens/${token.id}/holders`);
  const wallets = data?.holders.filter((h) => h.label !== 'Bonding curve' && h.label !== 'Liquidity pool') ?? [];
  const max = Math.max(...(data?.holders.map((h) => h.pct) ?? [1]), 1);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KeyValue label="Holders" value={formatNumber(token.holders)} />
        <KeyValue label="Holder change (1h)" value={token.holdersChange === null ? '—' : formatPercent(token.holdersChange)} />
        <KeyValue label="Top holders (provider)" value={token.topHoldersPct === null ? '—' : formatPercent(token.topHoldersPct, 1, false)} />
        <KeyValue label="Top 10 wallets (on-chain)" value={data && data.source !== 'unavailable' && data.top10Pct != null ? formatPercent(data.top10Pct, 1, false) : '—'} />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Source: <span className="font-semibold text-fg">{data?.source === 'rpc' ? 'Solana RPC (getTokenLargestAccounts)' : data?.source === 'trade-flow' ? 'Reconstructed from trade stream' : data ? 'Unavailable' : '…'}</span>
          {data && ` · ${timeAgo(data.fetchedAt)}`}
        </p>
        <RefreshButton onClick={reload} loading={loading} />
      </div>
      <PanelState loading={loading && !data} error={error} onRetry={reload}>
        {data?.note && <p className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">{data.note}</p>}
        {data && data.holders.length > 0 ? (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" role="img" aria-label="Holder distribution">
              {wallets.slice(0, 10).map((h, i) => (
                <div key={h.owner} style={{ width: `${h.pct}%`, opacity: 1 - i * 0.07 }} className={h.label === 'Creator' ? 'bg-danger' : 'bg-accent'} title={`${shortAddress(h.owner)} ${h.pct.toFixed(2)}%`} />
              ))}
            </div>
            <ol className="divide-y divide-line text-sm">
              {data.holders.map((h, i) => (
                <li key={h.tokenAccount || h.owner} className="flex items-center gap-3 py-2">
                  <span className="num w-5 text-xs text-subtle">{i + 1}</span>
                  <ExtLink href={solscan('account', h.owner)} className="num min-w-0 truncate text-xs">
                    {shortAddress(h.owner)}
                  </ExtLink>
                  {h.label && (
                    <span className={cn('chip', h.label === 'Creator' ? 'border-danger/40 bg-danger/10 text-danger' : h.label === 'Early buyer' ? 'border-warning/40 bg-warning/10 text-warning' : 'border-line-strong text-muted')}>{h.label}</span>
                  )}
                  <div className="ml-auto hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface-3 sm:block">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(h.pct / max) * 100}%` }} />
                  </div>
                  <span className="num w-16 text-right text-xs font-semibold">{h.pct.toFixed(2)}%</span>
                  <span className="num hidden w-20 text-right text-xs text-muted md:block">{formatQty(h.amount)}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          data && <EmptyState icon={CircleHelp} title="Holder list unavailable" description="Aggregate concentration from the market provider is still used in the risk score." />
        )}
      </PanelState>
    </div>
  );
}

/* ─────────────────────────── Creator ─────────────────────────── */

export function CreatorPanel({ token }: { token: Token }) {
  const { data, error, loading, reload } = useIntel<{ intel: CreatorIntel | null }>(token.creator ? `/api/tokens/${token.id}/creator` : null);
  const intel = data?.intel;
  if (!token.creator) return <EmptyState icon={CircleHelp} title="Creator unknown" description="The launch event did not include a deployer wallet." />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">Creator wallet</p>
          <ExtLink href={solscan('account', token.creator)} className="num text-sm font-semibold break-all">
            {token.creator}
          </ExtLink>
        </div>
        <RefreshButton onClick={reload} loading={loading} />
      </div>
      <PanelState loading={loading && !intel} error={error} onRetry={reload}>
        {intel && (
          <>
            {intel.errors.length > 0 && <p className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">Partial data: {intel.errors.join(' · ')}</p>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <KeyValue label="SOL balance" value={intel.balanceSol === null ? '—' : `${intel.balanceSol.toFixed(3)} SOL`} />
              <KeyValue label="Initial buy" value={intel.initialBuyPct === null ? '—' : formatPercent(intel.initialBuyPct, 2, false)} />
              <KeyValue label="Holding now" value={intel.currentHoldingPct === null ? '—' : formatPercent(intel.currentHoldingPct, 2, false)} />
              <KeyValue label="Sold (est.)" value={<span className={intel.soldPct > 30 ? 'text-danger' : undefined}>{formatPercent(intel.soldPct, 0, false)}</span>} />
              <KeyValue label="Prior launches" value={intel.launchesReported === null ? '—' : formatNumber(intel.launchesReported)} />
              <KeyValue label="Graduated" value={intel.migrationsReported === null ? '—' : formatNumber(intel.migrationsReported)} />
            </div>
            {intel.launchesReported !== null && intel.launchesReported > 20 && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger">
                Serial launcher: this wallet has created {intel.launchesReported} tokens. Most serial launches are abandoned quickly.
              </p>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Recent wallet activity</h3>
                {intel.recentTxs.length ? (
                  <ul className="divide-y divide-line text-xs">
                    {intel.recentTxs.slice(0, 12).map((t) => (
                      <li key={t.signature} className="flex items-center gap-2 py-1.5">
                        {t.ok ? <CheckCircle2 className="size-3.5 text-primary" /> : <XCircle className="size-3.5 text-danger" />}
                        <ExtLink href={solscan('tx', t.signature)} className="num min-w-0 truncate">
                          {shortAddress(t.signature)}
                        </ExtLink>
                        <span className="ml-auto text-muted">{t.t ? timeAgo(t.t) : '—'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">No recent transactions returned.</p>
                )}
                {intel.firstSeen && <p className="mt-2 text-[11px] text-subtle">Oldest fetched tx: {formatDateTime(intel.firstSeen)}</p>}
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Launches seen by this radar</h3>
                  {intel.launchesObserved.length ? (
                    <ul className="space-y-1 text-xs">
                      {intel.launchesObserved.slice(0, 10).map((l) => (
                        <li key={l.mint} className="flex items-center justify-between gap-2">
                          <Link to={`/tokens/${l.mint}`} className="font-semibold hover:text-primary">
                            ${l.symbol}
                          </Link>
                          <span className="text-muted">{timeAgo(l.t)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted">No other launches from this wallet since monitoring started.</p>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Linked wallets</h3>
                  {intel.linkedWallets.length ? (
                    <ul className="space-y-1 text-xs">
                      {intel.linkedWallets.map((w) => (
                        <li key={w.wallet} className="flex items-center justify-between gap-2">
                          <ExtLink href={solscan('account', w.wallet)} className="num">
                            {shortAddress(w.wallet)}
                          </ExtLink>
                          <span className="truncate text-right text-muted">{w.reason}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted">{token.trades.length ? 'No bundled or co-timed wallets detected.' : 'Requires the per-trade stream (PUMPPORTAL_API_KEY on the server).'}</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </PanelState>
    </div>
  );
}

/* ─────────────────────────── Security ─────────────────────────── */

const CHECK_ICON: Record<CheckStatus, { icon: typeof CheckCircle2; cls: string }> = {
  pass: { icon: CheckCircle2, cls: 'text-primary' },
  warn: { icon: AlertTriangle, cls: 'text-warning' },
  fail: { icon: XCircle, cls: 'text-danger' },
  unknown: { icon: CircleHelp, cls: 'text-subtle' },
};

export function SecurityPanel({ token }: { token: Token }) {
  const { data, error, loading, reload } = useIntel<SecurityIntel>(`/api/tokens/${token.id}/security`);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">On-chain mint account + metadata checks{data && ` · ${timeAgo(data.fetchedAt)}`}</p>
        <RefreshButton onClick={reload} loading={loading} />
      </div>
      <PanelState loading={loading && !data} error={error} onRetry={reload}>
        {data && (
          <>
            {data.errors.length > 0 && <p className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">{data.errors.join(' · ')}</p>}
            <ul className="grid gap-2 md:grid-cols-2">
              {data.checks.map((c) => {
                const I = CHECK_ICON[c.status];
                return (
                  <li key={c.key} className="flex items-start gap-3 rounded-xl border border-line bg-bg-2/60 p-3">
                    <I.icon className={cn('mt-0.5 size-4 shrink-0', I.cls)} aria-label={c.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{c.label}</p>
                      <p className="text-xs break-words text-muted">{c.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <KeyValue label="Token program" value={data.tokenProgram ? shortAddress(data.tokenProgram) : '—'} />
              <KeyValue label="Decimals" value={data.decimals ?? '—'} />
              <KeyValue label="Supply" value={data.supply ? formatQty(data.supply) : '—'} />
              <KeyValue label="Update authority" value={data.updateAuthority ? shortAddress(data.updateAuthority) : 'None'} />
            </div>
            {data.metadata && (
              <div className="rounded-xl border border-line bg-bg-2/60 p-3 text-sm">
                <p className="text-xs text-muted">Metadata</p>
                <p className="font-semibold">
                  {data.metadata.name} ({data.metadata.symbol})
                </p>
                {data.metadata.description && <p className="mt-1 text-xs break-words text-muted">{data.metadata.description}</p>}
                {data.metadata.uri && (
                  <ExtLink href={data.metadata.uri} className="mt-1 text-[11px] break-all text-subtle">
                    {data.metadata.uri}
                  </ExtLink>
                )}
              </div>
            )}
          </>
        )}
      </PanelState>
    </div>
  );
}

/* ─────────────────────────── Transactions ─────────────────────────── */

export function TransactionsPanel({ token, tradeStream }: { token: Token; tradeStream: boolean }) {
  if (token.trades.length) {
    return (
      <div>
        <p className="mb-2 text-xs text-muted">Live trade stream · last {token.trades.length} trades</p>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-2 py-2 font-medium">Time</th>
                <th className="px-2 py-2 font-medium">Side</th>
                <th className="px-2 py-2 text-right font-medium">USD</th>
                <th className="px-2 py-2 text-right font-medium">SOL</th>
                <th className="px-2 py-2 text-right font-medium">Price</th>
                <th className="px-2 py-2 font-medium">Wallet</th>
                <th className="px-2 py-2 font-medium">Tx</th>
              </tr>
            </thead>
            <tbody>
              {token.trades.map((t) => (
                <tr key={t.signature} className={cn('border-b border-line/60 last:border-0', t.isCreator && 'bg-danger/5')}>
                  <td className="num px-2 py-1.5 text-xs text-muted">{new Date(t.t).toLocaleTimeString()}</td>
                  <td className="px-2 py-1.5">
                    <span className={cn('chip uppercase', t.side === 'buy' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-danger/40 bg-danger/10 text-danger')}>{t.side}</span>
                  </td>
                  <td className="num px-2 py-1.5 text-right">{formatUsd(t.usd)}</td>
                  <td className="num px-2 py-1.5 text-right text-muted">{t.sol.toFixed(3)}</td>
                  <td className="num px-2 py-1.5 text-right text-muted">{formatPrice(t.price)}</td>
                  <td className="px-2 py-1.5 text-xs">
                    <ExtLink href={solscan('account', t.trader)} className="num">
                      {shortAddress(t.trader)}
                    </ExtLink>
                    {t.isCreator && <span className="chip ml-1 border-danger/40 text-danger">creator</span>}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    <ExtLink href={solscan('tx', t.signature)} className="num text-muted">
                      {t.signature.slice(0, 6)}
                    </ExtLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  const flow = [...token.history].reverse().filter((h) => h.volume > 0).slice(0, 40);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KeyValue label="Buys (24h)" value={formatNumber(token.buys24h)} />
        <KeyValue label="Sells (24h)" value={formatNumber(token.sells24h)} />
        <KeyValue label="Unique traders" value={formatNumber(token.traders)} />
        <KeyValue label="Net buyers (1h)" value={formatNumber(token.netBuyers)} />
      </div>
      <p className="rounded-lg border border-line bg-bg-2/60 p-2.5 text-xs text-muted">
        {tradeStream
          ? 'Waiting for trades on this token…'
          : 'Individual trades require the per-trade stream (set PUMPPORTAL_API_KEY on the server). Showing aggregated flow between market-data updates instead.'}
      </p>
      {flow.length ? (
        <ul className="divide-y divide-line text-xs">
          {flow.map((h) => (
            <li key={h.t} className="flex items-center gap-3 py-1.5">
              <span className="num w-20 text-muted">{new Date(h.t).toLocaleTimeString()}</span>
              <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="bg-primary" style={{ width: `${(h.buyVolume / Math.max(h.volume, 1)) * 100}%` }} />
                <div className="flex-1 bg-danger" />
              </div>
              <span className="num w-20 text-right">{formatUsd(h.volume)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">No volume recorded yet.</p>
      )}
    </div>
  );
}
