import { FlaskConical, RotateCcw, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { aggregate } from '../../shared/engineUtils.ts';
import { OPPORTUNITY_FACTOR_DEFS, scoreLabel } from '../../shared/opportunityEngine.ts';
import { FactorBreakdown } from '../components/token/FactorBreakdown';
import { TokenSwitcher, useRouteToken } from '../components/token/TokenSwitcher';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { DemoNotice, PageHeader, ScoreGauge, Section, SignalBadge } from '../components/ui/primitives';
import { cn } from '../utils/cn';

export default function ScoringPage() {
  const { token, requestedId, loading, notFound } = useRouteToken();
  const [simulate, setSimulate] = useState(false);
  const [draft, setDraft] = useState<Record<string, number | null>>({});

  useEffect(() => {
    setSimulate(false);
    setDraft({});
  }, [token?.id]);

  const breakdown = useMemo(() => {
    if (!token) return null;
    if (!simulate) return token.opportunity;
    return aggregate(token.opportunity.factors.map((f) => ({ ...f, value: f.key in draft ? draft[f.key] : f.value })));
  }, [token, simulate, draft]);

  if (loading) return <LoadingState label="Loading scores…" rows={3} />;
  if (!token || !breakdown) {
    return (
      <div className="card">
        <EmptyState icon={SearchX} title={notFound ? 'Token not found' : 'No scored tokens yet'} description={notFound ? `No scoring data for "${requestedId}".` : 'Scores appear once tokens have market data.'} action={<Link to="/tokens" className="btn btn-primary">Browse tokens</Link>} />
      </div>
    );
  }
  const delta = breakdown.total - token.score;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Opportunity scoring" subtitle={`Transparent weighted model for $${token.symbol}`} actions={<TokenSwitcher token={token} basePath="/scoring" />} />
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <Section className="xl:sticky xl:top-20 xl:self-start">
          <ScoreGauge value={breakdown.total} sublabel={scoreLabel(breakdown.total)} tone={breakdown.total >= 65 ? 'primary' : breakdown.total >= 45 ? 'warning' : 'danger'} size={240} />
          <div className="mt-3 flex justify-center">
            <SignalBadge signal={token.signal} />
          </div>
          {simulate && (
            <p className="mt-3 text-center text-sm">
              What-if vs live <span className={cn('num font-semibold', delta >= 0 ? 'text-primary' : 'text-danger')}>{delta >= 0 ? `+${delta}` : delta}</span>
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2">
            <button
              className={cn('btn', simulate ? 'btn-outline' : 'btn-accent')}
              aria-pressed={simulate}
              onClick={() => {
                setDraft({});
                setSimulate((s) => !s);
              }}
            >
              <FlaskConical className="size-4" /> {simulate ? 'Exit what-if mode' : 'What-if simulator'}
            </button>
            {simulate && (
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft({})}>
                <RotateCcw className="size-3.5" /> Reset to live values
              </button>
            )}
            <Link to={`/tokens/${token.id}`} className="btn btn-outline">
              Open ${token.symbol}
            </Link>
          </div>
          {simulate && (
            <div className="mt-5 space-y-3 border-t border-line pt-4">
              {token.opportunity.factors.map((f) => {
                const val = f.key in draft ? draft[f.key] : f.value;
                return (
                  <div key={f.key}>
                    <label htmlFor={`sim-${f.key}`} className="flex justify-between text-xs">
                      <span>{f.label}</span>
                      <span className="num text-muted">{val === null ? 'no data' : `${Math.round(val * 100)}%`}</span>
                    </label>
                    <input id={`sim-${f.key}`} type="range" min={0} max={100} value={Math.round((val ?? 0) * 100)} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) / 100 }))} className="w-full accent-[var(--color-accent)]" />
                  </div>
                );
              })}
            </div>
          )}
        </Section>
        <Section className="xl:col-span-2" title="Weighted factors" action={<span className="num text-xs text-muted">weights sum to {OPPORTUNITY_FACTOR_DEFS.reduce((s, f) => s + f.weight, 0)}</span>}>
          <FactorBreakdown breakdown={breakdown} kind="opportunity" />
        </Section>
      </div>
      <Section title="Methodology">
        <div className="grid gap-4 text-sm text-muted md:grid-cols-2">
          <p>Each factor converts live market, holder and flow data into a 0–1 signal and is multiplied by its weight. When a data source hasn&apos;t reported yet, that factor is excluded and the remaining weights are rescaled — the coverage figure shows how much of the model had data.</p>
          <p>Opportunity is independent from risk: a token can score highly and still be dangerous. The signal (WATCH / HIGH-RISK SETUP / AVOID / INSUFFICIENT DATA) combines both and never predicts price.</p>
        </div>
        <DemoNotice className="mt-4">Model-generated analysis of live data. Not financial advice.</DemoNotice>
      </Section>
    </div>
  );
}
