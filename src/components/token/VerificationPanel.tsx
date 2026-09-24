import { CheckCircle2, CircleHelp, FlaskConical, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { STRICT, VERIFY_DISCLAIMER } from '../../../shared/verification.ts';
import { useIntel } from '../../hooks/useTokenData';
import type { CheckOutcome, EvidenceStats, Token, VerificationResult, VerifyStatus } from '../../types';
import { cn } from '../../utils/cn';
import { formatDateTime, formatPercent, formatPrice, timeAgo } from '../../utils/format';
import { Spinner } from '../ui/LoadingState';
import { DemoNotice, ProgressBar } from '../ui/primitives';

export const VERIFY_TONE: Record<VerifyStatus, string> = {
  TRADEABLE: 'border-primary/50 bg-primary/10 text-primary',
  WATCH: 'border-accent/50 bg-accent/10 text-accent',
  AVOID: 'border-danger/50 bg-danger/10 text-danger',
  'INSUFFICIENT DATA': 'border-line-strong bg-surface-2 text-muted',
};

export function VerifyBadge({ status, className }: { status: VerifyStatus; className?: string }) {
  return <span className={cn('chip tracking-wide', VERIFY_TONE[status], className)}>{status === 'TRADEABLE' ? '✓ PASSED ALL CHECKS' : status}</span>;
}

const ICON: Record<CheckOutcome, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  pass: { icon: CheckCircle2, cls: 'text-primary', label: 'Pass' },
  fail: { icon: XCircle, cls: 'text-danger', label: 'Fail' },
  unknown: { icon: CircleHelp, cls: 'text-subtle', label: 'Insufficient data' },
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function VerificationPanel({ token }: { token: Token }) {
  const { data, error, loading, reload } = useIntel<{ result: VerificationResult; evidence: EvidenceStats }>(`/api/tokens/${token.id}/verification`);
  if (loading && !data)
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-muted" role="status">
        <Spinner /> Running the strict verification filter…
      </p>
    );
  if (error || !data)
    return (
      <p role="alert" className="text-sm text-danger">
        {error ?? 'Verification unavailable'}{' '}
        <button className="font-semibold underline" onClick={() => void reload()}>
          Retry
        </button>
      </p>
    );
  const v = data.result;
  const e = data.evidence;
  const c = v.estimates.comparables;
  const plan = v.estimates.plan;

  return (
    <div className="space-y-5">
      <div className={cn('rounded-2xl border p-4', VERIFY_TONE[v.status])}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-lg font-bold">
            <ShieldCheck className="size-5" /> 🎯 STATUS: {v.status}
          </p>
          <button className="btn btn-ghost btn-sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> Re-verify
          </button>
        </div>
        <p className="mt-1 text-sm">
          {v.passed}/{v.total} checks passed · checked {formatDateTime(v.checkedAt)}
        </p>
        <div className="mt-2">
          <ProgressBar value={v.passed} max={v.total} tone={v.status === 'TRADEABLE' ? 'primary' : v.status === 'AVOID' ? 'danger' : 'accent'} />
        </div>
        <p className="mt-3 text-sm text-fg">
          <span className="font-semibold">🧠 Decision reason: </span>
          {v.reason}
        </p>
        <p className="mt-2 text-xs text-muted">
          {v.status === 'TRADEABLE' ? 'This token qualifies for a Telegram alert.' : 'No Telegram alert is sent — Telegram only receives tokens that pass every check.'}
        </p>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Strict checks · evidence · source · time</h3>
        <ul className="grid gap-2 lg:grid-cols-2">
          {v.checks.map((ch) => {
            const I = ICON[ch.outcome];
            return (
              <li key={ch.key} className={cn('rounded-xl border bg-bg-2/60 p-3', ch.outcome === 'fail' ? 'border-danger/30' : 'border-line')}>
                <div className="flex items-start gap-2.5">
                  <I.icon className={cn('mt-0.5 size-4 shrink-0', I.cls)} aria-label={I.label} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                      {ch.label} {ch.critical && <span className="chip border-danger/30 text-[10px] text-danger">critical</span>}
                    </p>
                    <p className="mt-0.5 text-xs break-words text-fg/90">{ch.evidence}</p>
                    <p className="mt-1 text-[11px] break-words text-subtle">Requires: {ch.requirement}</p>
                    <p className="text-[11px] break-words text-subtle">
                      Source: {ch.source}
                      {ch.observedAt ? ` · ${timeAgo(ch.observedAt)}` : ''}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-line bg-bg-2/60 p-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">🔎 Verified facts (observed data)</h3>
          <dl className="space-y-1.5 text-xs">
            {v.facts.map((f) => (
              <div key={f.label} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2">
                <dt className="text-muted">{f.label}</dt>
                <dd className="min-w-0">
                  <span className="num break-all text-fg">{f.value}</span>
                  <span className="block text-[10px] text-subtle">
                    {f.source}
                    {f.observedAt ? ` · ${formatDateTime(f.observedAt)}` : ''}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-warning uppercase">
            <FlaskConical className="size-3.5" /> Model estimates (not predictions)
          </h3>
          <p className="text-xs text-muted">{v.estimates.note}</p>
          {c && c.n >= STRICT.minComparables ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
                  <p className="text-[11px] text-muted">📈 Bull (≥ +{STRICT.bullThresholdPct}%)</p>
                  <p className="num font-bold text-primary">{pct(c.bullProb)}</p>
                </div>
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-2">
                  <p className="text-[11px] text-muted">Base</p>
                  <p className="num font-bold text-accent">{pct(c.baseProb)}</p>
                </div>
                <div className="rounded-lg border border-danger/30 bg-danger/5 p-2">
                  <p className="text-[11px] text-muted">Bear (≤ {STRICT.bearThresholdPct}%)</p>
                  <p className="num font-bold text-danger">{pct(c.bearProb)}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted">
                Frequencies observed across {c.n} comparable setups ({c.band}) after {c.horizonMin} min · mean {formatPercent(c.meanReturn)}, median {formatPercent(c.medianReturn)}.
              </p>
              {plan ? (
                <dl className="num grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-line bg-bg-2/60 p-2">
                    <dt className="text-muted">💰 Entry zone</dt>
                    <dd>
                      {formatPrice(plan.entryLow)} – {formatPrice(plan.entryHigh)}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-line bg-bg-2/60 p-2">
                    <dt className="text-muted">🛑 Stop / invalidation</dt>
                    <dd className="text-danger">
                      {formatPrice(plan.stop)} (−{plan.stopPct.toFixed(0)}%)
                    </dd>
                  </div>
                  <div className="col-span-2 rounded-lg border border-line bg-bg-2/60 p-2">
                    <dt className="text-muted">🎯 Targets</dt>
                    <dd className="text-primary">
                      TP1 {formatPrice(plan.tp1)} · TP2 {formatPrice(plan.tp2)} · TP3 {formatPrice(plan.tp3)}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-line bg-bg-2/60 p-2">
                    <dt className="text-muted">⚖️ Risk/Reward (TP2)</dt>
                    <dd className={plan.rr >= STRICT.minRiskReward ? 'text-primary' : 'text-danger'}>{plan.rr.toFixed(2)}</dd>
                  </div>
                  <div className="rounded-lg border border-line bg-bg-2/60 p-2">
                    <dt className="text-muted">📊 Opp · 🚨 Risk</dt>
                    <dd>
                      {v.opportunityScore}/100 · {v.riskScore}/100
                    </dd>
                  </div>
                  <div className="col-span-2 text-[11px] text-muted">
                    <span className="font-semibold">Invalidate if: </span>
                    {plan.invalidation.join('; ')}.
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-muted">No trading plan — the token is not eligible (status {v.status}).</p>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-2 text-xs">
              <p className="font-semibold text-fg">INSUFFICIENT DATA — no probabilities, entry, stop or targets are shown.</p>
              <p className="text-muted">
                Outcome tracker: {e.resolved} resolved / {e.pending} pending setups (need ≥ {e.required} comparable outcomes). Each qualifying setup is measured {e.horizonMin} min after it first passes the core checks.
              </p>
              <ProgressBar value={Math.min(c?.n ?? 0, e.required)} max={e.required} tone="warning" />
            </div>
          )}
        </section>
      </div>
      <DemoNotice>{VERIFY_DISCLAIMER}</DemoNotice>
    </div>
  );
}
