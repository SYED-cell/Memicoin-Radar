import { BellOff, CheckCheck, Search, Settings2, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCard } from '../components/token/AlertCard';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader, Segmented } from '../components/ui/primitives';
import { useMarket } from '../context/MarketContext';
import { useToast } from '../context/ToastContext';
import { useNow } from '../hooks/useNow';
import type { AlertCategory, AlertSeverity } from '../types';

type SevFilter = 'all' | AlertSeverity;
type ReadFilter = 'all' | 'unread' | 'read';

const CATEGORIES: { value: AlertCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All categories' },
  { value: 'new_token', label: 'New tokens' },
  { value: 'score', label: 'Score crossings' },
  { value: 'risk', label: 'Risk jumps' },
  { value: 'high_risk', label: 'Became high risk' },
  { value: 'price', label: 'Price moves' },
  { value: 'liquidity', label: 'Liquidity drops' },
  { value: 'creator_sell', label: 'Creator sells' },
  { value: 'whale_sell', label: 'Large holder sells' },
  { value: 'volume', label: 'Volume spikes' },
  { value: 'smart_money', label: 'Smart money' },
  { value: 'watchlist', label: 'Watchlist conditions' },
  { value: 'trade', label: 'Paper trades' },
];

const PAGE = 25;

export default function AlertsPage() {
  const { alerts, getToken, markRead, markAllRead, deleteAlert, clearAlerts, unreadCount } = useMarket();
  const toast = useToast();
  const now = useNow(30_000);
  const [sev, setSev] = useState<SevFilter>('all');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [category, setCategory] = useState<AlertCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [confirmClear, setConfirmClear] = useState(false);

  const counts = useMemo(
    () => ({
      all: alerts.length,
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
      info: alerts.filter((a) => a.severity === 'info').length,
    }),
    [alerts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\$/, '');
    return alerts.filter(
      (a) =>
        (sev === 'all' || a.severity === sev) &&
        (readFilter === 'all' || (readFilter === 'unread' ? !a.read : a.read)) &&
        (category === 'all' || a.category === category) &&
        (!q || a.symbol.toLowerCase().includes(q) || a.title.toLowerCase().includes(q)),
    );
  }, [alerts, sev, readFilter, category, query]);

  const reset = () => {
    setSev('all');
    setReadFilter('all');
    setCategory('all');
    setQuery('');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Alerts"
        subtitle={`${unreadCount} unread · ${alerts.length} total`}
        actions={
          <>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                markAllRead();
                toast.success('All alerts marked as read');
              }}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
            <button className="btn btn-outline btn-sm text-danger" onClick={() => setConfirmClear(true)} disabled={alerts.length === 0}>
              <Trash2 className="size-3.5" /> Clear all
            </button>
            <Link to="/settings#alerts" className="btn btn-ghost btn-sm" aria-label="Alert thresholds">
              <Settings2 className="size-3.5" /> <span className="hidden sm:inline">Thresholds</span>
            </Link>
          </>
        }
      />

      <div className="card space-y-3 p-3 sm:p-4">
        <Segmented
          label="Severity"
          value={sev}
          onChange={(v) => {
            setSev(v);
            setLimit(PAGE);
          }}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'critical', label: 'Critical', count: counts.critical },
            { value: 'warning', label: 'Warning', count: counts.warning },
            { value: 'info', label: 'Info', count: counts.info },
          ]}
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input type="search" className="input pl-9" placeholder="Filter by token or title" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter alerts" />
          </div>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as AlertCategory | 'all')} aria-label="Alert category">
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select className="input" value={readFilter} onChange={(e) => setReadFilter(e.target.value as ReadFilter)} aria-label="Read status">
            <option value="all">Read & unread</option>
            <option value="unread">Unread only</option>
            <option value="read">Read only</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={BellOff}
            title={alerts.length ? 'No alerts match these filters' : 'No alerts yet'}
            description={alerts.length ? 'Try widening your filters.' : 'New alerts appear automatically as the radar detects activity.'}
            action={alerts.length ? <button className="btn btn-outline" onClick={reset}>Reset filters</button> : undefined}
          />
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {filtered.slice(0, limit).map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                token={getToken(a.tokenId)}
                now={now}
                onToggleRead={() => markRead(a.id, !a.read)}
                onDelete={() => {
                  deleteAlert(a.id);
                  toast.info('Alert deleted');
                }}
              />
            ))}
          </ul>
          {filtered.length > limit && (
            <div className="flex justify-center">
              <button className="btn btn-outline btn-sm" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({filtered.length - limit})
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={confirmClear}
        title="Clear all alerts?"
        message="This permanently removes every alert from your inbox. New alerts will continue to arrive."
        confirmLabel="Clear all"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAlerts();
          setConfirmClear(false);
          toast.success('Alerts cleared');
        }}
      />
    </div>
  );
}
