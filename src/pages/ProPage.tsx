import {
  BadgeCheck,
  Check,
  Copy,
  Crosshair,
  Download,
  Loader2,
  Lock,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '../components/ui/LoadingState';
import { useToast } from '../context/ToastContext';
import { get, post } from '../lib/api';
import { cn } from '../utils/cn';
import { formatDateTime } from '../utils/format';

type Network = 'trc20' | 'erc20';

interface Intent {
  id: string;
  network: Network;
  address: string;
  amount: string;
  days: number;
  expiresAt: number;
  status: string;
}

interface BillingStatus {
  enabled: boolean;
  pro: boolean;
  proUntil: number | null;
  priceUsdt: number;
  days: number;
  networks: Record<Network, boolean>;
  pending: Intent | null;
  limits: { freeWatchlist: number; proWatchlist: number };
}

const NETWORK: Record<Network, { label: string; chain: string; note: string }> = {
  trc20: { label: 'TRC20', chain: 'Tron', note: 'Lowest fee — usually under $1' },
  erc20: { label: 'ERC20', chain: 'Ethereum', note: 'Higher gas, use if Tron is not an option' },
};

/** Pro upgrade paid in USDT. The payment goes wallet-to-wallet; this app never holds funds. */
export default function ProPage() {
  const toast = useToast();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState<Network | null>(null);
  const [copied, setCopied] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => get<BillingStatus>('/api/billing/status').then(setStatus).catch(() => undefined), []);

  useEffect(() => {
    void load();
    // The server confirms payments from the chain, so poll while one is open.
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, [load]);

  const start = async (network: Network) => {
    setBusy(network);
    try {
      const r = await post<{ intent: Intent }>('/api/billing/intent', { network });
      setStatus((s) => (s ? { ...s, pending: r.intent } : s));
    } catch (e) {
      toast.error('Could not start the payment', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(what);
        window.setTimeout(() => setCopied(''), 1500);
      },
      () => toast.error('Could not copy'),
    );
  };

  // The CSV comes back as a file, not JSON, so it is fetched directly and handed to the browser.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/export/tokens.csv', { credentials: 'include', headers: { 'x-requested-with': 'radar' } });
      if (!res.ok) throw new Error(res.status === 402 ? 'Exports are part of Pro' : `Export failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `memecoin-radar-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (e) {
      toast.error('Could not export', e instanceof Error ? e.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  if (!status) return <Spinner className="mx-auto mt-10 size-6" />;

  const { pending, pro, priceUsdt, days, limits } = status;

  const perks: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: Crosshair, title: 'Entry levels', body: 'Both entries with their split, the stop and three targets — on the chart, the coin page and your home screen.' },
    { icon: Send, title: 'Telegram buy signals', body: 'Every coin crossing your score threshold, pushed to your chat with its levels attached.' },
    { icon: ShieldCheck, title: 'Strict-filter alerts', body: 'The 14-check report the moment a coin passes all of them, with the evidence behind each check.' },
    { icon: Star, title: `Watchlist of ${limits.proWatchlist}`, body: `Free accounts keep ${limits.freeWatchlist} coins. Pro raises it to ${limits.proWatchlist}, enough to track a whole session.` },
    { icon: Download, title: 'CSV export', body: 'Every tracked coin with its caps, volumes, scores and creator — one file, ready for a spreadsheet.' },
    { icon: ShieldAlert, title: 'Risk breakdown', body: 'Holder concentration, creator history and liquidity checks, scored and explained per coin.' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* The offer, before anything else: what it is, what it costs, and the one button. */}
      <section className="card relative overflow-hidden p-6 text-center sm:p-10">
        <div
          className="pointer-events-none absolute -top-40 left-1/2 size-96 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgb(34 224 122 / 0.25), transparent 70%)' }}
          aria-hidden
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <BadgeCheck className="size-3.5" aria-hidden /> MemeCoin Radar Pro
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Know where you would get in</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
            The radar is free. Pro adds the levels, the signals and the exports — the parts you act on.
          </p>

          <p className="mt-6 flex items-baseline justify-center gap-2">
            <span className="num text-5xl font-bold tracking-tight sm:text-6xl">{priceUsdt}</span>
            <span className="text-lg font-semibold text-muted">USDT</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            for {days} days · no card, no subscription, no auto-renewal
          </p>

          {pro ? (
            <p className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary">
              <BadgeCheck className="size-4" aria-hidden />
              Pro is active until {status.proUntil ? formatDateTime(status.proUntil) : '—'}
            </p>
          ) : (
            <a href="#pay" className="btn btn-primary mt-6">
              Upgrade for {priceUsdt} USDT
            </a>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold tracking-tight">What Pro unlocks</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perks.map((p) => (
            <li key={p.title} className="card p-4">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary/12 text-primary">
                <p.icon className="size-5" aria-hidden />
              </span>
              <p className="mt-3 font-semibold">{p.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{p.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted">
          Signals are model output on live chain data, not financial advice, and no one can tell you a meme coin will go up. Trade only what you can afford to
          lose.
        </p>
      </section>

      {pro && (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-semibold">Export the market</p>
            <p className="text-xs text-muted">Every coin currently tracked, as CSV.</p>
          </div>
          <button className="btn btn-outline" onClick={() => void exportCsv()} disabled={exporting}>
            {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            {exporting ? 'Preparing…' : 'Download CSV'}
          </button>
        </section>
      )}

      <section id="pay" className="card p-5 sm:p-6">
        {!status.enabled ? (
          <>
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Lock className="size-4 text-warning" aria-hidden /> Payments are not configured
            </h2>
            <p className="mt-2 text-sm text-muted">
              No USDT wallet is set on this server, so upgrades are off. Set <code className="num text-fg">USDT_TRC20_ADDRESS</code> or{' '}
              <code className="num text-fg">USDT_ERC20_ADDRESS</code> and restart.
            </p>
          </>
        ) : pending ? (
          <>
            <h2 className="text-lg font-bold tracking-tight">Send the payment</h2>
            <p className="mt-2 text-sm text-muted">
              Send <span className="num font-semibold text-fg">exactly {pending.amount} USDT</span> on{' '}
              <span className="font-semibold text-fg">
                {NETWORK[pending.network].label} ({NETWORK[pending.network].chain})
              </span>
              . The amount is unique to you — it is how your transfer is matched to your account. Pro activates on its own within a minute of the transfer
              confirming.
            </p>
            <div className="mt-4 space-y-2">
              <CopyRow label="Amount (exact)" value={`${pending.amount} USDT`} copied={copied === 'amount'} onCopy={() => copy(pending.amount, 'amount')} />
              <CopyRow
                label={`${NETWORK[pending.network].label} address`}
                value={pending.address}
                copied={copied === 'address'}
                onCopy={() => copy(pending.address, 'address')}
              />
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Waiting for the transfer · expires {formatDateTime(pending.expiresAt)}
            </p>
            <p className="mt-2 text-[11px] text-warning">
              Send on the network shown above. USDT sent on a different chain cannot be recovered.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold tracking-tight">Pay {priceUsdt} USDT</h2>
            <p className="mt-1 text-sm text-muted">Pick a network. You will get an exact amount and an address to send it to.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(['trc20', 'erc20'] as Network[]).map((n) => {
                const available = status.networks[n];
                return (
                  <button
                    key={n}
                    onClick={() => void start(n)}
                    disabled={!available || busy !== null}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition',
                      available ? 'border-line bg-bg-2/60 hover:border-primary/50 hover:bg-surface-2' : 'border-line opacity-40',
                    )}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <Wallet className="size-4 text-primary" aria-hidden /> USDT · {NETWORK[n].label}
                    </span>
                    <span className="mt-1 block text-xs text-muted">{available ? NETWORK[n].note : 'Not available on this server'}</span>
                    {busy === n && <span className="mt-2 block text-xs text-primary">Creating your payment…</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-[11px] text-muted">
              Payment goes straight to the operator&apos;s wallet. This app never holds your funds, and never asks for a private key or seed phrase.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function CopyRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-line bg-bg-2/60 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted">{label}</p>
        <p className="num truncate text-sm font-semibold">{value}</p>
      </div>
      <button onClick={onCopy} className="btn btn-outline btn-sm shrink-0" aria-label={`Copy ${label}`} title={`Copy ${label}`}>
        {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
