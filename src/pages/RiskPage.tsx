import { SearchX, ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { riskLevel } from '../../shared/riskEngine.ts';
import { FactorBreakdown } from '../components/token/FactorBreakdown';
import { TokenSwitcher, useRouteToken } from '../components/token/TokenSwitcher';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { DemoNotice, PageHeader, ScoreGauge, Section, TokenAvatar } from '../components/ui/primitives';
import { RISK_TONE, RiskBadge } from '../components/ui/RiskBadge';
import { useMarket } from '../context/MarketContext';
import { topBy } from '../services/tokenFilters';
import type { RiskLevel } from '../types';
import { cn } from '../utils/cn';

const LEVELS: RiskLevel[] = ['Low', 'Medium', 'High', 'Extreme'];
const GUIDANCE: Record<RiskLevel, string> = {
  Low: 'No major red flags in the available data. Meme-coin volatility still applies.',
  Medium: 'Some warning signs. Confirm with holder and creator data before any exposure.',
  High: 'Multiple manipulation or safety signals. Paper-trade only, if at all.',
  Extreme: 'Critical safety failures or rug characteristics. Avoid.',
};
const GUIDANCE_TONE: Record<RiskLevel, string> = {
  Low: 'border-primary/35 bg-primary/10 text-primary',
  Medium: 'border-warning/35 bg-warning/10 text-warning',
  High: 'border-danger/35 bg-danger/10 text-danger',
  Extreme: 'border-danger bg-danger/15 text-danger',
};

export default function RiskPage() {
  const { token, requestedId, loading, notFound } = useRouteToken();
  const { tokens } = useMarket();
  const scored = useMemo(() => tokens.filter((t) => t.signal !== 'INSUFFICIENT DATA'), [tokens]);
  const distribution = useMemo(() => {
    const d: Record<RiskLevel, number> = { Low: 0, Medium: 0, High: 0, Extreme: 0 };
    scored.forEach((t) => d[riskLevel(t.riskScore)]++);
    return d;
  }, [scored]);
  const riskiest = useMemo(() => topBy(scored, 'riskScore', 6), [scored]);

  if (loading) return <LoadingState label="Loading risk data…" rows={3} />;
  if (!token) {
    return (
      <div className="card">
        <EmptyState icon={SearchX} title={notFound ? 'Token not found' : 'No scored tokens yet'} description={notFound ? `No risk data for "${requestedId}".` : 'Risk scores appear once tokens have market data.'} action={<Link to="/tokens" className="btn btn-primary">Browse tokens</Link>} />
      </div>
    );
  }
  const level = riskLevel(token.riskScore);
  const flagged = token.risk.factors.filter((f) => (f.value ?? 0) >= 0.6).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Risk engine" subtitle={`Manipulation & safety analysis for $${token.symbol}`} actions={<TokenSwitcher token={token} basePath="/risk" />} />
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <Section>
          <ScoreGauge value={token.riskScore} sublabel={`${level} risk`} tone={level === 'Low' ? 'primary' : level === 'Medium' ? 'warning' : 'danger'} size={240} label="Risk" />
          <div className={cn('mt-5 rounded-xl border p-3 text-sm', GUIDANCE_TONE[level])}>
            <p className="font-semibold">
              {flagged} of {token.risk.factors.length} signals flagged
            </p>
            <p className="mt-1 text-xs opacity-90">{GUIDANCE[level]}</p>
          </div>
          <Link to={`/tokens/${token.id}?tab=security`} className="btn btn-outline mt-3 w-full">
            On-chain security checks
          </Link>
        </Section>
        <Section className="xl:col-span-2" title="Risk signals" action={<span className="num text-xs text-muted">13 weighted signals</span>}>
          <FactorBreakdown breakdown={token.risk} kind="risk" />
        </Section>
      </div>
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Section title="Risk distribution (scored tokens)">
          <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label="Risk distribution">
            {LEVELS.map((l) => (
              <div key={l} style={{ width: `${(distribution[l] / Math.max(scored.length, 1)) * 100}%` }} className={cn(l === 'Low' ? 'bg-primary' : l === 'Medium' ? 'bg-warning' : l === 'High' ? 'bg-danger/70' : 'bg-danger')} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LEVELS.map((l) => (
              <div key={l} className="rounded-xl border border-line bg-bg-2/60 p-3">
                <span className={cn('chip', RISK_TONE[l])}>{l}</span>
                <p className="num mt-2 text-xl font-bold">{distribution[l]}</p>
              </div>
            ))}
          </div>
        </Section>
        <Section title={<span className="flex items-center gap-2"><ShieldAlert className="size-4 text-danger" /> Highest risk right now</span>}>
          <ul className="space-y-1">
            {riskiest.map((t) => (
              <li key={t.id}>
                <Link to={`/risk/${t.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-surface-2">
                  <TokenAvatar token={t} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">${t.symbol}</span>
                  <span className="hidden truncate text-xs text-muted sm:block">{t.risk.floorReason ?? t.risk.factors.slice().sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]?.label}</span>
                  <RiskBadge risk={t.riskScore} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <DemoNotice>Risk scores summarise available on-chain and market data. A low score never means &quot;safe&quot; — meme coins are highly speculative.</DemoNotice>
    </div>
  );
}
