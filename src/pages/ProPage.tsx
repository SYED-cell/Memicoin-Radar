import { BadgeCheck, Check, Copy, Crosshair, Send, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '../components/ui/LoadingState';
import { PageHeader, Section } from '../components/ui/primitives';
import { useToast } from '../context/ToastContext';
import { get, post } from '../lib/api';
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
}

const NETWORK_LABEL: Record<Network, string> = { trc20: 'USDT · TRC20 (Tron)', erc20: 'USDT · ERC20 (Ethereum)' };

/** Pro upgrade paid in USDT. The payment goes wallet-to-wallet; this app never holds funds. */
export default function ProPage() {
  const toast = useToast();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState<Network | null>(null);
  const [copied, setCopied] = useState('');

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

  if (!status) return <Spinner className="mx-auto mt-10 size-6" />;

  const pending = status.pending;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Pro" subtitle="Entry levels, targets and Telegram buy signals" />

      {status.pro && (
        <Section>
          <div className="flex items-center gap-3">
            <BadgeCheck className="size-6 text-primary" />
            <div>
              <p className="font-semibold">Pro is active</p>
              <p className="text-xs text-muted">Until {status.proUntil ? formatDateTime(status.proUntil) : '—'} · paying again extends it</p>
            </div>
          </div>
        </Section>
      )}

      <Section title="What Pro unlocks">
        <ul className="grid gap-2 sm:grid-cols-3">
          <Perk icon={Crosshair} title="Entry levels" body="Both entries with their split, stop and targets, on the chart and on your home screen." />
          <Perk icon={Send} title="Telegram buy signals" body="Every coin crossing your score threshold, pushed to your chat with its levels." />
          <Perk icon={ShieldAlert} title="Strict-filter alerts" body="The 14-check report when a coin passes, with the evidence behind it." />
        </ul>
        <p className="mt-3 text-[11px] text-muted">
          Signals are model output on live chain data, not financial advice, and no one can tell you a meme coin will go up. Trade what you can afford to lose.
        </p>
      </Section>

      {!status.enabled ? (
        <Section title="Payments not configured">
          <p className="text-sm text-muted">No USDT wallet is set on this server yet, so upgrades are off. Add USDT_TRC20_ADDRESS or USDT_ERC20_ADDRESS and restart.</p>
        </Section>
      ) : pending ? (
        <Section title="Send the payment">
          <p className="text-sm text-muted">
            Send <span className="num font-semibold text-fg">exactly {pending.amount} USDT</span> on{' '}
            <span className="font-semibold text-fg">{NETWORK_LABEL[pending.network]}</span>. The amount is unique to you — it is how the payment is matched to your
            account. Pro activates on its own within a minute of the transfer confirming.
          </p>
          <div className="mt-3 space-y-2">
            <CopyRow label="Amount (exact)" value={`${pending.amount} USDT`} copyValue={pending.amount} copied={copied === 'amount'} onCopy={() => copy(pending.amount, 'amount')} />
            <CopyRow label={`${pending.network.toUpperCase()} address`} value={pending.address} copyValue={pending.address} copied={copied === 'address'} onCopy={() => copy(pending.address, 'address')} />
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Expires {formatDateTime(pending.expiresAt)}. Send on the right network — USDT sent on another chain cannot be recovered. Waiting for the transfer…
          </p>
        </Section>
      ) : (
        <Section title={`Upgrade — ${status.priceUsdt} USDT for ${status.days} days`}>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['trc20', 'erc20'] as Network[]).map((n) => (
              <button
                key={n}
                onClick={() => void start(n)}
                disabled={!status.networks[n] || busy !== null}
                className="btn btn-outline flex-col items-start gap-0.5 py-3 text-left disabled:opacity-40"
              >
                <span className="font-semibold">{NETWORK_LABEL[n]}</span>
                <span className="text-[11px] text-muted">{status.networks[n] ? `Pay ${status.priceUsdt} USDT` : 'Not available on this server'}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">Payment goes straight to the operator's wallet. This app never holds your funds and never asks for a private key or seed phrase.</p>
        </Section>
      )}
    </div>
  );
}

function Perk({ icon: Icon, title, body }: { icon: typeof Crosshair; title: string; body: string }) {
  return (
    <li className="rounded-xl border border-line bg-bg-2/60 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-primary" /> {title}
      </p>
      <p className="mt-1 text-xs text-muted">{body}</p>
    </li>
  );
}

function CopyRow({ label, value, copyValue, copied, onCopy }: { label: string; value: string; copyValue: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-bg-2/60 p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted">{label}</p>
        <p className="num truncate text-sm font-semibold">{value}</p>
      </div>
      <button onClick={onCopy} className="btn btn-outline btn-sm shrink-0" aria-label={`Copy ${label}`} title={`Copy ${label}`}>
        {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
      </button>
      <span className="sr-only">{copyValue}</span>
    </div>
  );
}
