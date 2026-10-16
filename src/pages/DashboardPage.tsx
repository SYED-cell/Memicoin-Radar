import { ArrowRight, Bell, Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MobileHome } from '../components/layout/MobileHome';
import { AlertCard } from '../components/token/AlertCard';
import { CoinSpotlight } from '../components/token/CoinSpotlight';
import { EntryLevelsCard } from '../components/token/EntryLevelsCard';
import { MarketOverviewTable } from '../components/token/MarketOverviewTable';
import { TokenCard } from '../components/token/TokenCard';
import { EmptyState } from '../components/ui/EmptyState';
import { Section } from '../components/ui/primitives';
import { useMarket } from '../context/MarketContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useNow } from '../hooks/useNow';
import { MIN_OPPORTUNITY, sortTokens } from '../services/tokenFilters';
import { cn } from '../utils/cn';
import { timeAgo } from '../utils/format';

type Lens = 'all' | 'gainers' | 'new';

const LENSES: { value: Lens; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'gainers', label: 'Gainers' },
  { value: 'new', label: 'Newest' },
];

export default function DashboardPage() {
  // One screen or the other, never both: the phone gets its own layout rather than a squeezed
  // desktop, so neither design pays for the other's markup.
  const wide = useMediaQuery('(min-width: 768px)');
  return wide ? <DesktopDashboard /> : <MobileHome />;
}

function DesktopDashboard() {
  const { tokens, alerts, markRead, deleteAlert, getToken, lastUpdated } = useMarket();
  const now = useNow(5_000);
  const [lens, setLens] = useState<Lens>('all');

  const scored = useMemo(() => tokens.filter((t) => t.signal !== 'INSUFFICIENT DATA' && t.score >= MIN_OPPORTUNITY), [tokens]);
  const watch = useMemo(() => sortTokens(scored.filter((t) => t.signal === 'WATCH'), 'score', 'desc').slice(0, 4), [scored]);
  const priced = useMemo(() => tokens.filter((t) => t.marketCap > 0), [tokens]);
  const spotlight = useMemo(() => sortTokens(priced, 'marketCap', 'desc').slice(0, 6), [priced]);
  const overview = useMemo(() => {
    if (lens === 'gainers') return sortTokens(priced.filter((t) => t.priceChange1h !== null), 'priceChange1h', 'desc').slice(0, 10);
    if (lens === 'new') return sortTokens(priced, 'detectedAt', 'desc').slice(0, 10);
    return sortTokens(priced, 'marketCap', 'desc').slice(0, 10);
  }, [priced, lens]);
  const recentAlerts = alerts.slice(0, 4);

  return (
    <div className="space-y-8">
      <header>
        <p className="flex items-center gap-2 text-xs text-muted">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-primary" aria-hidden />
          Last update: {lastUpdated ? timeAgo(lastUpdated, now) : 'connecting…'}
        </p>
        <h1 className="mt-2 max-w-[14ch] text-4xl leading-[1.05] font-bold tracking-tight xl:text-5xl">Live Solana Updates</h1>
      </header>

      {spotlight.length > 0 && (
        <div className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {spotlight.map((t) => (
            <CoinSpotlight key={t.id} token={t} />
          ))}
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
          <div>
            <p className="text-xs text-muted">Live updates</p>
            <h2 className="text-xl font-bold tracking-tight">Market overview</h2>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-line bg-bg-2/70 p-1" role="tablist" aria-label="Market lens">
            {LENSES.map((l) => (
              <button
                key={l.value}
                role="tab"
                aria-selected={lens === l.value}
                onClick={() => setLens(l.value)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                  lens === l.value ? 'bg-primary text-on-primary' : 'text-muted hover:text-fg',
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        {overview.length ? (
          <MarketOverviewTable tokens={overview} />
        ) : (
          <EmptyState icon={Eye} title="Waiting for market data" description="Coins appear here as soon as the feed prices them." />
        )}
        <div className="border-t border-line p-3 text-center">
          <Link to="/tokens" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            See every tracked coin <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      <EntryLevelsCard tokens={scored} />

      <div className="grid gap-6 xl:grid-cols-2">
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
            <EmptyState icon={Eye} title="Nothing on watch" description="No coin currently combines a strong score with manageable risk." />
          )}
        </Section>

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
            <ul className="space-y-2">
              {recentAlerts.map((a) => (
                <AlertCard key={a.id} alert={a} token={getToken(a.tokenId)} now={now} onToggleRead={() => markRead(a.id, !a.read)} onDelete={() => deleteAlert(a.id)} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={Bell} title="No alerts yet" description="Alerts arrive as launches qualify for your thresholds (Settings → Alerts)." />
          )}
        </Section>
      </div>
    </div>
  );
}
