import { Bot, SearchX } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SIGNAL_EXPLAINER } from '../../shared/aiService.ts';
import { AIAnalysisCard } from '../components/token/AIAnalysisCard';
import { TokenSwitcher, useRouteToken } from '../components/token/TokenSwitcher';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { ChangeText, PageHeader, Section, SignalBadge, TokenAvatar } from '../components/ui/primitives';
import { ScoreBadge } from '../components/ui/ScoreBadge';
import { useMarket } from '../context/MarketContext';
import { topBy } from '../services/tokenFilters';

const SIGNALS = ['WATCH', 'HIGH-RISK SETUP', 'AVOID', 'INSUFFICIENT DATA'] as const;

export default function AIAnalysisPage() {
  const { token, requestedId, loading, notFound } = useRouteToken();
  const { tokens } = useMarket();
  const queue = useMemo(() => topBy(tokens.filter((t) => t.signal !== 'INSUFFICIENT DATA'), 'score', 10), [tokens]);

  if (loading) return <LoadingState label="Loading analysis…" rows={3} />;
  if (!token) {
    return (
      <div className="card">
        <EmptyState icon={SearchX} title={notFound ? 'Token not found' : 'Nothing to analyse yet'} description={notFound ? `No analysis available for "${requestedId}".` : 'Analysis appears once tokens have market data.'} action={<Link to="/tokens" className="btn btn-primary">Browse tokens</Link>} />
      </div>
    );
  }
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Bot className="size-6 text-accent" /> AI analysis
          </span>
        }
        subtitle="Explainable, rule-based read of live metrics — including why the signal changed."
        actions={<TokenSwitcher token={token} basePath="/ai" />}
      />
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AIAnalysisCard token={token} />
        </div>
        <div className="space-y-4 sm:space-y-6">
          <Section title="What the signals mean">
            <ul className="space-y-3">
              {SIGNALS.map((s) => (
                <li key={s} className="flex flex-col gap-1">
                  <SignalBadge signal={s} className="self-start" />
                  <p className="text-xs text-muted">{SIGNAL_EXPLAINER[s]}</p>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Analyse another token">
            <ul className="space-y-1">
              {queue.map((t) => (
                <li key={t.id}>
                  <Link to={`/ai/${t.id}`} aria-current={t.id === token.id ? 'page' : undefined} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-surface-2 aria-[current=page]:bg-surface-2">
                    <TokenAvatar token={t} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">${t.symbol}</p>
                      {t.priceChange5m !== null && <ChangeText value={t.priceChange5m} className="text-[11px]" />}
                    </div>
                    <ScoreBadge score={t.score} showMax={false} />
                    <SignalBadge signal={t.signal} short />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
