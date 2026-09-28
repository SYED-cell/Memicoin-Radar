import { useEffect, useState } from 'react';
import type { ChartLevel } from '../../components/charts/CandleChart';
import { get } from '../../lib/api';
import type { EvidenceStats, Token, VerificationResult } from '../../types';
import { formatCompactUsd, formatPercent } from '../../utils/format';

/**
 * Entry / stop / target levels for the chart, in market-cap terms so they line up with the candles.
 *
 * The plan comes from the strict filter, which derives it only from recorded outcomes of comparable
 * setups. Until enough of those exist there is no plan, and we say so rather than inventing levels:
 * what we can show honestly is the range the market cap has actually traded in.
 */
export function useTradeLevels(token: Token) {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [evidence, setEvidence] = useState<EvidenceStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    get<{ result: VerificationResult; evidence: EvidenceStats }>(`/api/tokens/${token.mint}/verification`)
      .then((r) => {
        if (cancelled) return;
        setResult(r.result);
        setEvidence(r.evidence);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token.mint]);

  const supply = token.supply || 1e9;
  const plan = result?.estimates.plan ?? null;
  const toMcap = (price: number) => price * supply;

  const levels: ChartLevel[] = plan
    ? [
        { label: 'Entry', value: toMcap((plan.entryLow + plan.entryHigh) / 2), color: 'var(--color-accent)' },
        { label: 'Stop', value: toMcap(plan.stop), color: 'var(--color-danger)' },
        { label: 'TP1', value: toMcap(plan.tp1), color: 'var(--color-primary)' },
        { label: 'TP2', value: toMcap(plan.tp2), color: 'var(--color-primary)' },
      ]
    : [];

  return { levels, plan, result, evidence, toMcap };
}

/** Levels strip under the chart: the model's plan when it exists, the observed range otherwise. */
export function TradeLevels({ token, data }: { token: Token; data: ReturnType<typeof useTradeLevels> }) {
  const { plan, result, evidence, toMcap } = data;
  const window = token.history.slice(-120);
  const caps = window.map((h) => h.mcap).filter((m) => m > 0);
  const low = caps.length ? Math.min(...caps) : 0;
  const high = caps.length ? Math.max(...caps) : 0;

  if (plan) {
    const rr = plan.rr.toFixed(2);
    return (
      <div className="mt-2 rounded-xl border border-line bg-bg-2/60 p-2.5 text-xs">
        <div className="num grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cell label="Entry zone" value={`${formatCompactUsd(toMcap(plan.entryLow))} – ${formatCompactUsd(toMcap(plan.entryHigh))}`} tone="text-accent" />
          <Cell label={`Stop (−${plan.stopPct.toFixed(0)}%)`} value={formatCompactUsd(toMcap(plan.stop))} tone="text-danger" />
          <Cell label="Targets" value={`${formatCompactUsd(toMcap(plan.tp1))} · ${formatCompactUsd(toMcap(plan.tp2))} · ${formatCompactUsd(toMcap(plan.tp3))}`} tone="text-primary" />
          <Cell label="Risk / reward" value={rr} />
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Model estimate from {result?.estimates.comparables?.n ?? 0} comparable setups — not a prediction or advice. Invalidate if: {plan.invalidation.join('; ')}.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-line bg-bg-2/60 p-2.5 text-xs">
      <div className="num grid grid-cols-3 gap-2">
        <Cell label="Now" value={formatCompactUsd(token.marketCap)} />
        <Cell label="Range low" value={low ? formatCompactUsd(low) : '—'} tone="text-danger" />
        <Cell label="Range high" value={high ? formatCompactUsd(high) : '—'} tone="text-primary" />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        No entry plan for this token: {result?.status === 'AVOID' ? 'it fails a critical safety check.' : `the filter needs ${evidence?.required ?? 20} recorded outcomes of comparable setups and has ${evidence?.resolved ?? 0}.`} The
        figures above are the market cap now and the range it has traded in while tracked — observations, not a recommendation.
        {token.priceChange5m !== null && ` Moved ${formatPercent(token.priceChange5m)} in the last 5 minutes.`}
      </p>
    </div>
  );
}

function Cell({ label, value, tone = 'text-fg' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface/60 p-2">
      <p className="text-[10px] text-muted">{label}</p>
      <p className={`truncate font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
