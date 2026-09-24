import { AlertTriangle, Bot, CheckCircle2, History, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AI_DISCLAIMER, analyze, SCENARIO_DISCLAIMER, SIGNAL_EXPLAINER } from '../../../shared/aiService.ts';
import type { Scenario, Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatCompactUsd, formatPercent, timeAgo } from '../../utils/format';
import { DemoNotice, KeyValue, SignalBadge } from '../ui/primitives';

const SCENARIO_TONE: Record<Scenario['label'], string> = {
  Bull: 'border-primary/30 bg-primary/5 text-primary',
  Base: 'border-accent/30 bg-accent/5 text-accent',
  Bear: 'border-danger/30 bg-danger/5 text-danger',
};

export function ScenarioRanges({ token }: { token: Token }) {
  const a = useMemo(() => analyze(token), [token]);
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {a.scenarios.map((s) => (
          <div key={s.label} className={cn('rounded-xl border p-3', SCENARIO_TONE[s.label])}>
            <p className="text-xs font-semibold tracking-wide uppercase">{s.label}</p>
            <p className="num mt-1 text-lg font-bold">
              {formatPercent(s.changeLow, 0)} → {formatPercent(s.changeHigh, 0)}
            </p>
            <p className="num text-[11px] text-muted">
              {formatCompactUsd(s.mcapLow)} – {formatCompactUsd(s.mcapHigh)} mcap
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-muted">{s.rationale}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-warning">
        {a.horizon} · {SCENARIO_DISCLAIMER}
      </p>
    </div>
  );
}

export function AIAnalysisCard({ token, compact = false }: { token: Token; compact?: boolean }) {
  const a = useMemo(() => analyze(token), [token]);

  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
          <Bot className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">AI Analysis</h2>
          <p className="text-[11px] text-muted">Updated {timeAgo(token.updatedAt)} · rule-based model over live metrics</p>
        </div>
        <SignalBadge signal={a.signal} />
      </div>

      <p className="text-sm leading-relaxed text-fg/90">{a.summary}</p>
      <p className="mt-2 text-xs text-muted">{SIGNAL_EXPLAINER[a.signal]}</p>

      {!compact && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <KeyValue label="Opportunity" value={`${a.opportunityScore}/100`} />
            <KeyValue label="Risk" value={`${a.riskScore}/100`} />
            <KeyValue label="Momentum" value={a.momentum} />
            <KeyValue label="Phase" value={a.phase} />
            <KeyValue label="Confidence" value={`${a.confidence}%`} />
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-bg-2/60 p-3 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p>
              <span className="text-muted">Catalyst: </span>
              {a.catalyst}
            </p>
          </div>
        </>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">Supporting signals</h3>
          <ul className="space-y-1.5">
            {a.confirmations.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 break-words">{c}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-danger uppercase">Risks</h3>
          <ul className="space-y-1.5">
            {a.risks.map((r) => (
              <li key={r} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <span className="min-w-0 break-words">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-bg-2/60 p-3">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-accent uppercase">
          <History className="size-3.5" /> Why the score changed
        </h3>
        <ul className="space-y-1 text-xs text-muted">
          {a.whyChanged.map((w, i) => (
            <li key={i} className={cn('break-words', i === 0 && token.lastChange && 'font-medium text-fg')}>
              {w}
            </li>
          ))}
        </ul>
      </div>

      {!compact && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Scenario ranges</h3>
          <ScenarioRanges token={token} />
        </div>
      )}

      {compact && (
        <Link to={`/tokens/${token.id}?tab=ai`} className="btn btn-outline mt-4 w-full">
          Full analysis & scenarios
        </Link>
      )}
      <DemoNotice className="mt-3">{AI_DISCLAIMER}</DemoNotice>
    </section>
  );
}
