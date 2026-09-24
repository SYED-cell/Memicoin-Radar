import { BellOff, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PriceChart } from '../components/charts/PriceChart';
import { SEVERITY_STYLE } from '../components/token/AlertCard';
import { TradingModal } from '../components/token/TradingModal';
import { WatchButton } from '../components/token/WatchButton';
import { EmptyState } from '../components/ui/EmptyState';
import { ChangeText, DemoNotice, KeyValue, PageHeader, Section, SignalBadge, TokenAvatar } from '../components/ui/primitives';
import { RiskBadge } from '../components/ui/RiskBadge';
import { ScoreBadge } from '../components/ui/ScoreBadge';
import { useMarket } from '../context/MarketContext';
import { useToast } from '../context/ToastContext';
import { AI_DISCLAIMER, analyze } from '../../shared/aiService.ts';
import { cn } from '../utils/cn';
import { formatAge, formatCompact, formatCompactUsd, formatDateTime, formatPrice, timeAgo } from '../utils/format';

export default function AlertDetailsPage() {
  const { id } = useParams();
  const { alerts, getToken, markRead, deleteAlert } = useMarket();
  const toast = useToast();
  const navigate = useNavigate();
  const [trading, setTrading] = useState(false);
  const alert = alerts.find((a) => a.id === id);
  const token = getToken(alert?.tokenId);
  const analysis = useMemo(() => (token ? analyze(token) : null), [token]);
  const related = useMemo(() => (alert ? alerts.filter((a) => a.tokenId === alert.tokenId && a.id !== alert.id).slice(0, 5) : []), [alerts, alert]);

  useEffect(() => {
    if (alert && !alert.read) markRead(alert.id, true);
  }, [alert, markRead]);

  if (!alert) {
    return (
      <div className="card">
        <EmptyState icon={BellOff} title="Alert not found" description="It may have been deleted or cleared." action={<Link to="/alerts" className="btn btn-primary">Back to alerts</Link>} />
      </div>
    );
  }

  const sev = SEVERITY_STYLE[alert.severity];
  const title = alert.category === 'new_token' ? 'New Token Alert' : `${sev.label} Alert`;

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      <PageHeader
        back="/alerts"
        title={title}
        subtitle={`${formatDateTime(alert.createdAt)} · ${timeAgo(alert.createdAt)}`}
        actions={
          <button
            className="btn btn-outline btn-sm text-danger"
            onClick={() => {
              deleteAlert(alert.id);
              toast.info('Alert deleted');
              navigate('/alerts');
            }}
          >
            <Trash2 className="size-3.5" /> Delete
          </button>
        }
      />

      <Section>
        <div className="flex flex-wrap items-start gap-3">
          {token ? <TokenAvatar token={token} size="lg" /> : <span className="grid size-12 place-items-center rounded-full bg-surface-3 text-2xl">🪙</span>}
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">${alert.symbol}</p>
            <p className="text-sm text-muted">{token?.name ?? 'Delisted token'}</p>
          </div>
          <span className={cn('chip', sev.cls)}>
            <sev.icon className="size-3" /> {sev.label}
          </span>
          {token && <RiskBadge risk={token.riskScore} />}
        </div>
        <div className="mt-4 rounded-xl border border-line bg-bg-2/60 p-3">
          <p className="font-semibold">{alert.title}</p>
          <p className="text-sm text-muted">{alert.message}</p>
        </div>

        {token ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <KeyValue label="Score" value={<ScoreBadge score={token.score} />} />
              <KeyValue label="Price" value={formatPrice(token.price)} />
              <KeyValue label="Change (5m)" value={token.priceChange5m === null ? '—' : <ChangeText value={token.priceChange5m} />} />
              <KeyValue label="Liquidity" value={formatCompactUsd(token.liquidity)} />
              <KeyValue label="Volume" value={formatCompactUsd(token.volume24h)} />
              <KeyValue label="Holders · Age" value={`${formatCompact(token.holders)} · ${formatAge(token.createdAt)}`} />
            </div>
            <div className="mt-4">
              <PriceChart token={token} timeframe="1H" height={200} showMarkers={false} />
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">This token is no longer tracked, so live metrics are unavailable.</p>
        )}
      </Section>

      {token && analysis && (
        <Section title="Quick Analysis" action={<SignalBadge signal={analysis.signal} />}>
          <p className="text-sm leading-relaxed">{analysis.summary}</p>
          <p className="mt-2 text-xs text-muted">Watch for: {analysis.risks.slice(0, 2).join(' · ')}</p>
          <DemoNotice className="mt-3">{AI_DISCLAIMER}</DemoNotice>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Link to={`/tokens/${token.id}`} className="btn btn-outline">View Details</Link>
            <WatchButton token={token} variant="button" />
            <button className="btn btn-primary" onClick={() => setTrading(true)}>Paper trade</button>
          </div>
        </Section>
      )}

      {related.length > 0 && (
        <Section title={`Other alerts for $${alert.symbol}`}>
          <ul className="divide-y divide-line">
            {related.map((r) => (
              <li key={r.id}>
                <Link to={`/alerts/${r.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary">
                  <span className={cn('chip', SEVERITY_STYLE[r.severity].cls)}>{SEVERITY_STYLE[r.severity].label}</span>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <span className="text-xs text-muted">{timeAgo(r.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {token && <TradingModal open={trading} onClose={() => setTrading(false)} tokenId={token.id} />}
    </div>
  );
}
