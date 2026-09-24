import { Plus, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PositionSizeCalculator } from '../components/token/PositionSizeCalculator';
import { PositionList, TransactionList } from '../components/token/TradeLists';
import { TradingModal } from '../components/token/TradingModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { DemoNotice, PageHeader, ProgressBar, Section, Segmented } from '../components/ui/primitives';
import { StatCard } from '../components/ui/StatCard';
import { useMarket } from '../context/MarketContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useTrading } from '../context/TradingContext';
import { sortTokens } from '../services/tokenFilters';
import type { TradeSide } from '../types';
import { cn } from '../utils/cn';
import { formatPercent, formatSignedUsd, formatUsd } from '../utils/format';

export default function PaperTradingPage() {
  const { state, summary, reset } = useTrading();
  const { tokens } = useMarket();
  const { settings } = useSettings();
  const toast = useToast();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'positions' | 'history'>(params.get('tab') === 'history' ? 'history' : 'positions');
  const [modal, setModal] = useState<{ tokenId?: string; side: TradeSide } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const up = summary.totalPnl >= 0;
  const calcToken = useMemo(() => summary.positions[0]?.token ?? sortTokens(tokens.filter((t) => t.signal === 'WATCH'), 'score', 'desc')[0], [summary.positions, tokens]);
  const maxPos = settings?.trading.maxPositionPct ?? 10;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Paper trading"
        subtitle="Practice on live Solana prices with virtual funds — no wallet, no real money."
        actions={
          <>
            <button className="btn btn-outline btn-sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="size-3.5" /> Reset account
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setModal({ side: 'buy' })}>
              <Plus className="size-3.5" /> New trade
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <section className="card relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <p className="text-sm text-muted">Account equity</p>
          <p className="num mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{formatUsd(summary.totalValue)}</p>
          <p className={cn('num mt-1 text-sm font-semibold', up ? 'text-primary' : 'text-danger')}>
            {formatSignedUsd(summary.totalPnl)} ({formatPercent(summary.totalPnlPct)}) all time
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-line bg-bg-2/60 p-3">
              <p className="text-[11px] text-muted">Cash</p>
              <p className="num font-semibold">{formatUsd(summary.cash)}</p>
            </div>
            <div className="rounded-xl border border-line bg-bg-2/60 p-3">
              <p className="text-[11px] text-muted">In positions</p>
              <p className="num font-semibold">{formatUsd(summary.holdingsValue)}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[11px] text-muted">
              <span>Exposure</span>
              <span className="num">{formatPercent(summary.exposurePct, 1, false)}</span>
            </div>
            <ProgressBar value={summary.exposurePct} tone={summary.exposurePct > 60 ? 'warning' : 'accent'} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Starting balance {formatUsd(state.startingBalance)} · max position {maxPos}% ·{' '}
            <Link to="/settings#trading" className="text-primary hover:underline">
              risk settings
            </Link>
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:col-span-2">
          <StatCard label="Unrealized P/L" value={<span className={summary.unrealizedPnl >= 0 ? 'text-primary' : 'text-danger'}>{formatSignedUsd(summary.unrealizedPnl)}</span>} hint="Open positions at live prices" />
          <StatCard label="Realized P/L" value={<span className={summary.realizedPnl >= 0 ? 'text-primary' : 'text-danger'}>{formatSignedUsd(summary.realizedPnl)}</span>} hint="Closed trades, after fees" />
          <StatCard label="24h P/L" value={<span className={summary.pnl24h >= 0 ? 'text-primary' : 'text-danger'}>{formatSignedUsd(summary.pnl24h)}</span>} change={summary.pnl24hPct} />
          <StatCard label="Risk to stops" value={formatUsd(summary.riskAtStops)} hint={`${summary.positions.filter((p) => p.stopLoss).length}/${summary.positions.length} positions protected`} />
        </div>
      </div>

      <PositionSizeCalculator token={calcToken} />

      <Section>
        <Segmented
          label="Trading view"
          value={tab}
          onChange={setTab}
          className="mb-3 sm:max-w-xs"
          options={[
            { value: 'positions', label: 'Positions', count: summary.positions.length },
            { value: 'history', label: 'History', count: state.transactions.length },
          ]}
        />
        {tab === 'positions' ? <PositionList positions={summary.positions} onTrade={(tokenId, side) => setModal({ tokenId, side })} /> : <TransactionList transactions={state.transactions} />}
      </Section>

      <DemoNotice>Simulated fills on live prices with fees and slippage. Stop-loss/take-profit are enforced by the server on each price update, but meme coins can gap far beyond stops. Never enter real wallet keys anywhere.</DemoNotice>

      <TradingModal open={modal !== null} onClose={() => setModal(null)} tokenId={modal?.tokenId} initialSide={modal?.side ?? 'buy'} />
      <ConfirmModal
        open={confirmReset}
        title="Reset paper account?"
        message={`All positions, orders and trade history will be erased and your balance restored to ${formatUsd(10_000)}.`}
        confirmLabel="Reset account"
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          try {
            await reset();
            toast.success('Paper account reset');
          } catch (e) {
            toast.error('Reset failed', e instanceof Error ? e.message : undefined);
          }
        }}
      />
    </div>
  );
}
