import { ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMarket } from '../../context/MarketContext';
import { get } from '../../lib/api';
import type { EvidenceStats, VerifyStatus } from '../../types';
import { timeAgo } from '../../utils/format';
import { EmptyState } from '../ui/EmptyState';
import { ProgressBar, Section, TokenAvatar } from '../ui/primitives';
import { VERIFY_TONE, VerifyBadge } from './VerificationPanel';

const ORDER: VerifyStatus[] = ['TRADEABLE', 'WATCH', 'AVOID', 'INSUFFICIENT DATA'];

/** Dashboard summary of the strict verified-coin filter (the only source of Telegram alerts). */
export function StrictFilterCard() {
  const { tokens } = useMarket();
  const [evidence, setEvidence] = useState<EvidenceStats | null>(null);

  useEffect(() => {
    const load = () =>
      get<{ evidence: EvidenceStats }>('/api/verification/stats')
        .then((r) => setEvidence(r.evidence))
        .catch(() => undefined);
    void load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const counts = useMemo(() => {
    const c: Record<VerifyStatus, number> = { TRADEABLE: 0, WATCH: 0, AVOID: 0, 'INSUFFICIENT DATA': 0 };
    for (const t of tokens) if (t.verify) c[t.verify.status]++;
    return c;
  }, [tokens]);
  const passed = useMemo(() => tokens.filter((t) => t.verify?.status === 'TRADEABLE'), [tokens]);
  const closest = useMemo(
    () => tokens.filter((t) => t.verify && t.verify.status !== 'TRADEABLE' && t.verify.status !== 'AVOID').sort((a, b) => (b.verify?.passed ?? 0) - (a.verify?.passed ?? 0)).slice(0, 4),
    [tokens],
  );

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" /> Strict verified-coin filter
        </span>
      }
      action={<span className="text-[11px] text-muted">Strict mode sends only these</span>}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ORDER.map((s) => (
          <div key={s} className={`rounded-xl border p-2.5 text-center ${VERIFY_TONE[s]}`}>
            <p className="num text-lg font-bold">{counts[s]}</p>
            <p className="text-[10px] font-semibold tracking-wide">{s}</p>
          </div>
        ))}
      </div>

      {evidence && (
        <div className="mt-3 rounded-xl border border-line bg-bg-2/60 p-3 text-xs text-muted">
          <div className="mb-1.5 flex justify-between">
            <span>Comparable-outcome evidence base</span>
            <span className="num text-fg">
              {evidence.resolved} resolved · {evidence.pending} pending
            </span>
          </div>
          <ProgressBar value={Math.min(evidence.resolved, evidence.required)} max={evidence.required} tone={evidence.resolved >= evidence.required ? 'primary' : 'warning'} />
          <p className="mt-1.5">
            {evidence.resolved >= evidence.required
              ? `Probabilities and targets are estimated from recorded outcomes${evidence.lastResolvedAt ? ` (last resolved ${timeAgo(evidence.lastResolvedAt)})` : ''}.`
              : `Needs ≥ ${evidence.required} comparable outcomes before any token can pass. Each qualifying setup is measured ${evidence.horizonMin} min after it first passes the core checks.`}
          </p>
        </div>
      )}

      <div className="mt-3">
        {passed.length ? (
          <ul className="space-y-1">
            {passed.map((t) => (
              <li key={t.id}>
                <Link to={`/tokens/${t.id}?tab=verify`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                  <TokenAvatar token={t} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">${t.symbol}</span>
                  <VerifyBadge status="TRADEABLE" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={ShieldCheck} title="No token passes every check right now" description="That is expected — most launches fail at least one strict check. No alert is better than a weak one." />
        )}
        {closest.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Closest to qualifying</p>
            <ul className="space-y-1">
              {closest.map((t) => (
                <li key={t.id}>
                  <Link to={`/tokens/${t.id}?tab=verify`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs hover:bg-surface-2">
                    <TokenAvatar token={t} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-semibold">${t.symbol}</span>
                    <span className="num text-muted">
                      {t.verify?.passed}/{t.verify?.total}
                    </span>
                    <VerifyBadge status={t.verify!.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}
