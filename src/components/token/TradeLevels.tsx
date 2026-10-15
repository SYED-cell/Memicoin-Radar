import { Lock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildLevelsPlan } from '../../../shared/levels';
import type { ChartLevel } from '../../components/charts/CandleChart';
import { get } from '../../lib/api';
import type { EvidenceStats, PlanEntry, Token, TradePlan, VerificationResult } from '../../types';
import { formatCompactUsd } from '../../utils/format';

/**
 * Entry levels for the chart and the strip below it, in market-cap terms so they match the candles.
 *
 * Two sources, in order: the strict filter's plan, which is derived from recorded outcomes of
 * comparable setups, and — when that evidence does not exist yet — levels read from the token's own
 * price action. The second is structure, not a forecast, and is labelled as such everywhere.
 */
export function useTradeLevels(token: Token) {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [evidence, setEvidence] = useState<EvidenceStats | null>(null);
  const [pro, setPro] = useState(false);

  useEffect(() => {
    let cancelled = false;
    get<{ result: VerificationResult; evidence: EvidenceStats; pro: boolean }>(`/api/tokens/${token.mint}/verification`)
      .then((r) => {
        if (cancelled) return;
        setResult(r.result);
        setEvidence(r.evidence);
        setPro(Boolean(r.pro));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token.mint]);

  const supply = token.supply || 1e9;
  const modelPlan = result?.estimates.plan ?? null;
  // The model plan is priced per token; the fallback is already in market-cap terms.
  const toMcap = (price: number) => price * supply;
  const levelsPlan = useMemo(() => (modelPlan ? null : buildLevelsPlan(token)), [modelPlan, token]);

  const plan: TradePlan | null = modelPlan ?? levelsPlan;
  const asMcap = (price: number) => (modelPlan ? toMcap(price) : price);
  const kind: 'model' | 'price-action' | 'none' = modelPlan ? 'model' : levelsPlan ? 'price-action' : 'none';

  const levels: ChartLevel[] = plan
    ? [
        ...plan.entries.map((e, i) => ({ label: `Entry ${i + 1}`, value: asMcap(e.price), color: 'var(--color-accent)' })),
        { label: 'Stop', value: asMcap(plan.stop), color: 'var(--color-danger)' },
        { label: 'TP1', value: asMcap(plan.tp1), color: 'var(--color-primary)' },
        { label: 'TP2', value: asMcap(plan.tp2), color: 'var(--color-primary)' },
      ]
    : [];

  return { levels: pro ? levels : [], plan, kind, result, evidence, asMcap, levelsPlan, pro };
}

/** Levels strip under the chart. */
export function TradeLevels({ token, data }: { token: Token; data: ReturnType<typeof useTradeLevels> }) {
  const { plan, kind, result, evidence, asMcap, levelsPlan } = data;

  if (!plan) {
    return (
      <p className="mt-2 rounded-xl border border-line bg-bg-2/60 p-2.5 text-[11px] text-muted">
        No entry levels yet — {token.symbol} needs a few minutes of recorded price action before its range means anything.
      </p>
    );
  }

  if (!data.pro) {
    return (
      <div className="mt-2 rounded-2xl border border-line bg-bg-2/60 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="size-4 text-primary" /> Entry levels are part of Pro
        </p>
        <p className="mt-1 text-xs text-muted">
          Two entries with their split, the stop and three targets for {token.symbol} — plus the same on your home screen and as Telegram buy signals.
        </p>
        <Link to="/pro" className="btn btn-primary btn-sm mt-2.5">
          Unlock with Pro
        </Link>
      </div>
    );
  }

  const bull = result?.estimates.comparables?.bullProb;
  const model = kind === 'model';

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-bg-2/60 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/50 px-3 py-2">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-fg">Entry plan</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${model ? 'border-primary/40 bg-primary/10 text-primary' : 'border-line-strong bg-surface-2 text-muted'}`}>
            {model ? 'Model estimate' : 'From price action'}
          </span>
        </span>
        <span className="num text-[11px] text-muted">
          {model && bull !== undefined && (
            <>
              Bull <span className="font-semibold text-primary">{Math.round(bull * 100)}%</span> ·{' '}
            </>
          )}
          R/R <span className="font-semibold text-fg">{plan.rr.toFixed(2)}</span>
        </span>
      </div>

      <ol className="divide-y divide-line">
        {plan.entries.map((e: PlanEntry, i: number) => (
          <li key={e.label} className="flex items-center gap-3 px-3 py-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-[11px] font-bold text-accent">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="num block font-semibold text-fg">{formatCompactUsd(asMcap(e.price))}</span>
              <span className="block truncate text-[11px] text-muted">{e.reason}</span>
            </span>
            <span className="num shrink-0 rounded-lg border border-line bg-surface/60 px-2 py-1 text-[11px] font-semibold">{e.allocationPct}%</span>
          </li>
        ))}
      </ol>

      <div className="num grid grid-cols-2 gap-2 border-t border-line p-2.5">
        <Cell label={`Stop (−${plan.stopPct.toFixed(0)}%)`} value={formatCompactUsd(asMcap(plan.stop))} tone="text-danger" />
        <Cell label="Targets" value={`${formatCompactUsd(asMcap(plan.tp1))} · ${formatCompactUsd(asMcap(plan.tp2))} · ${formatCompactUsd(asMcap(plan.tp3))}`} tone="text-primary" />
      </div>

      <p className="px-3 pb-2.5 text-[11px] text-muted">
        {model ? (
          <>Model estimate from {result?.estimates.comparables?.n ?? 0} comparable setups — not a prediction or advice.</>
        ) : (
          <>
            Read from {levelsPlan?.samples ?? 0} readings over the last {levelsPlan?.windowMinutes ?? 30} minutes: floor {formatCompactUsd(levelsPlan?.support ?? 0)}, ceiling{' '}
            {formatCompactUsd(levelsPlan?.resistance ?? 0)}. Observed structure, not a forecast — the filter rates this token{' '}
            <span className="font-semibold text-fg">{result?.status ?? token.signal}</span>
            {evidence && evidence.resolved < evidence.required && <> and has {evidence.resolved}/{evidence.required} comparable outcomes for a model plan</>}.
          </>
        )}{' '}
        Invalidate if: {plan.invalidation.join('; ')}.
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
