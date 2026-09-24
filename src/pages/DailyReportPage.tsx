import { Copy, Download, FileText, RefreshCw, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { reportToMarkdown } from '../../shared/marketStats.ts';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState, Spinner } from '../components/ui/LoadingState';
import { DemoNotice, KeyValue, PageHeader, Section, TokenAvatar } from '../components/ui/primitives';
import { RISK_TONE } from '../components/ui/RiskBadge';
import { ScoreBadge } from '../components/ui/ScoreBadge';
import { useMarket } from '../context/MarketContext';
import { useToast } from '../context/ToastContext';
import { del, get, post } from '../lib/api';
import type { DailyReport, RiskLevel } from '../types';
import { cn } from '../utils/cn';
import { formatCompactUsd, formatDate, formatDateTime, formatPercent, formatTime } from '../utils/format';

const LEVELS: RiskLevel[] = ['Low', 'Medium', 'High', 'Extreme'];

export default function DailyReportPage() {
  const { getToken } = useMarket();
  const toast = useToast();
  const [reports, setReports] = useState<DailyReport[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const loaded = useRef(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const r = await post<{ report: DailyReport }>('/api/reports');
      setReports((list) => [r.report, ...(list ?? [])]);
      setSelectedId(r.report.id);
      toast.success('Report generated from live data', formatDateTime(r.report.generatedAt));
    } catch (e) {
      toast.error('Could not generate report', e instanceof Error ? e.message : undefined);
    } finally {
      setGenerating(false);
    }
  }, [toast]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    get<{ reports: DailyReport[] }>('/api/reports')
      .then((r) => {
        setReports(r.reports);
        if (r.reports.length === 0) void generate();
      })
      .catch(() => setReports([]));
  }, [generate]);

  if (reports === null) return <LoadingState label="Loading reports…" rows={3} />;
  const report = reports.find((r) => r.id === selectedId) ?? reports[0];

  const download = (r: DailyReport) => {
    const url = URL.createObjectURL(new Blob([reportToMarkdown(r)], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `memecoin-radar-report-${new Date(r.generatedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  if (!report) {
    return (
      <div className="card">
        <EmptyState
          icon={FileText}
          title="No reports yet"
          action={
            <button className="btn btn-primary" onClick={() => void generate()} disabled={generating}>
              {generating && <Spinner />} Generate report
            </button>
          }
        />
      </div>
    );
  }

  const riskTotal = Math.max(1, LEVELS.reduce((s, l) => s + report.riskSummary[l], 0));

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Market report"
        subtitle={`${formatDate(report.generatedAt)} · generated ${formatTime(report.generatedAt)} from ${report.source} data`}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => void generate()} disabled={generating}>
            {generating ? <Spinner /> : <RefreshCw className="size-3.5" />} {generating ? 'Generating…' : 'Generate now'}
          </button>
        }
      />
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <div className="space-y-4 sm:space-y-6 xl:col-span-2">
          <Section title="Market overview" action={<span className={cn('chip', report.marketStatus === 'Bullish' ? 'border-primary/40 bg-primary/10 text-primary' : report.marketStatus === 'Bearish' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-warning/40 bg-warning/10 text-warning')}>{report.marketStatus}</span>}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KeyValue label="Tokens tracked" value={report.totalTokens} />
              <KeyValue label="Launched (24h)" value={report.newTokens} />
              <KeyValue label="Volume" value={formatCompactUsd(report.totalVolume)} />
              <KeyValue label="Median change" value={<span className={report.avgChange >= 0 ? 'text-primary' : 'text-danger'}>{formatPercent(report.avgChange)}</span>} />
            </div>
            <ul className="mt-4 space-y-1.5 text-sm">
              {report.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <span className="text-primary">•</span>
                  {h}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Top opportunity scores">
            <ol className="divide-y divide-line">
              {report.topOpportunities.map((t, i) => {
                const token = getToken(t.tokenId);
                return (
                  <li key={t.tokenId}>
                    <Link to={`/tokens/${t.tokenId}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                      <span className="num w-5 text-xs text-subtle">{i + 1}</span>
                      {token && <TokenAvatar token={token} size="sm" />}
                      <span className="flex-1 text-sm font-semibold">${t.symbol}</span>
                      <ScoreBadge score={t.score} />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Section>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <Section title={<span className="flex items-center gap-2"><TrendingUp className="size-4 text-primary" /> Biggest gainers</span>}>
              <MoverList items={report.gainers} />
            </Section>
            <Section title={<span className="flex items-center gap-2"><TrendingDown className="size-4 text-danger" /> Biggest losers</span>}>
              <MoverList items={report.losers} />
            </Section>
          </div>
        </div>
        <div className="space-y-4 sm:space-y-6">
          <Section title="Risk summary">
            <div className="flex h-3 overflow-hidden rounded-full">
              {LEVELS.map((l) => (
                <div key={l} style={{ width: `${(report.riskSummary[l] / riskTotal) * 100}%` }} className={cn(l === 'Low' ? 'bg-primary' : l === 'Medium' ? 'bg-warning' : l === 'High' ? 'bg-danger/70' : 'bg-danger')} />
              ))}
            </div>
            <ul className="mt-3 space-y-2">
              {LEVELS.map((l) => (
                <li key={l} className="flex items-center justify-between text-sm">
                  <span className={cn('chip', RISK_TONE[l])}>{l}</span>
                  <span className="num font-semibold">{report.riskSummary[l]}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Export">
            <div className="grid gap-2">
              <button className="btn btn-outline" onClick={() => download(report)}>
                <Download className="size-4" /> Download (.md)
              </button>
              <button
                className="btn btn-outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(reportToMarkdown(report));
                    toast.success('Report copied');
                  } catch {
                    toast.error('Clipboard unavailable');
                  }
                }}
              >
                <Copy className="size-4" /> Copy to clipboard
              </button>
            </div>
          </Section>
          <Section title="History" action={<span className="num text-xs text-muted">{reports.length}</span>}>
            <ul className="space-y-1">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center gap-1">
                  <button onClick={() => setSelectedId(r.id)} className={cn('flex-1 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-surface-2', r.id === report.id && 'bg-surface-2 font-semibold text-primary')} aria-current={r.id === report.id}>
                    {formatDateTime(r.generatedAt)}
                  </button>
                  <button
                    className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                    disabled={reports.length === 1}
                    aria-label={`Delete report from ${formatDateTime(r.generatedAt)}`}
                    onClick={async () => {
                      try {
                        await del(`/api/reports/${encodeURIComponent(r.id)}`);
                        setReports((list) => (list ?? []).filter((x) => x.id !== r.id));
                      } catch (e) {
                        toast.error('Delete failed', e instanceof Error ? e.message : undefined);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
      <DemoNotice>Reports summarise live market data at generation time. Model-generated, not financial advice.</DemoNotice>
    </div>
  );
}

function MoverList({ items }: { items: DailyReport['gainers'] }) {
  const { getToken } = useMarket();
  if (!items.length) return <p className="text-sm text-muted">Not enough scored tokens.</p>;
  return (
    <ul className="space-y-1">
      {items.map((t) => {
        const token = getToken(t.tokenId);
        return (
          <li key={t.tokenId}>
            <Link to={`/tokens/${t.tokenId}`} className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-surface-2">
              {token && <TokenAvatar token={token} size="sm" />}
              <span className="flex-1 text-sm font-semibold">${t.symbol}</span>
              <span className={cn('num text-sm font-semibold', t.change >= 0 ? 'text-primary' : 'text-danger')}>{formatPercent(t.change)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
