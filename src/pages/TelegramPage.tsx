import { CheckCircle2, ExternalLink, Send, ServerCog, Unplug, XCircle, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/LoadingState';
import { DemoNotice, PageHeader, Section, Toggle } from '../components/ui/primitives';
import { useMarket } from '../context/MarketContext';
import { useSettings } from '../context/SettingsContext';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { get } from '../lib/api';
import type { EvidenceStats, TelegramPrefs } from '../types';

const STRICT_CHECKS = [
  'Verified on-chain data',
  'Valid token/contract metadata',
  'Sufficient liquidity',
  'Stable liquidity — no major LP withdrawal',
  'Healthy volume and transaction activity',
  'Organic holder growth',
  'Acceptable top-holder concentration',
  'Creator wallet risk below threshold',
  'No critical mint/freeze/security warning',
  'No obvious wash trading/manipulation',
  'No abnormal insider dumping',
  'Positive momentum confirmation',
  'Sufficient historical comparable evidence',
  'Minimum Risk/Reward satisfied',
];
import { cn } from '../utils/cn';
import { formatDateTime, formatTime } from '../utils/format';

export default function TelegramPage() {
  const { status, loading, createLink, sendTest, disconnect, reload } = useTelegram();
  const { settings, update } = useSettings();
  const { tokens } = useMarket();
  const toast = useToast();
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  const [linking, setLinking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const prefs = settings?.telegram;
  const [draftScore, setDraftScore] = useState<number | null>(null);
  const minScore = draftScore ?? prefs?.minScore ?? 40;
  const commitScore = () => {
    if (draftScore !== null && draftScore !== prefs?.minScore) setPref({ minScore: draftScore });
    setDraftScore(null);
  };

  // While a link is pending, poll until the bot confirms the chat (SSE also triggers a reload).
  useEffect(() => {
    if (!link || status?.connected) return;
    const id = window.setInterval(() => void reload().catch(() => undefined), 3000);
    return () => window.clearInterval(id);
  }, [link, status?.connected, reload]);

  useEffect(() => {
    if (status?.connected && link) {
      setLink(null);
      toast.success('Telegram connected', 'Alerts will now be delivered to your chat.');
    }
  }, [status?.connected, link, toast]);

  const [evidence, setEvidence] = useState<EvidenceStats | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const verified = useMemo(() => tokens.find((t) => t.verify?.status === 'TRADEABLE'), [tokens]);

  useEffect(() => {
    get<{ evidence: EvidenceStats }>('/api/verification/stats')
      .then((r) => setEvidence(r.evidence))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!verified) {
      setPreview(null);
      return;
    }
    get<{ telegramPreview: string | null }>(`/api/tokens/${verified.id}/verification`)
      .then((r) => setPreview(r.telegramPreview))
      .catch(() => setPreview(null));
  }, [verified?.id]); // refresh when a different token qualifies

  const setPref = (patch: Partial<TelegramPrefs>) => void update({ telegram: patch }).catch(() => toast.error('Could not save preference'));

  if (loading && !status) return <Spinner className="mx-auto mt-10 size-6" />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader back="/settings" title="Telegram alerts" subtitle="Real-time alerts from the MemeCoin Radar bot" />

      {!status?.configured ? (
        <Section>
          <EmptyState
            icon={ServerCog}
            title="Telegram bot not configured on this server"
            description="An administrator must set TELEGRAM_BOT_TOKEN (from @BotFather) in the server environment and restart it. The token is stored server-side only."
          />
        </Section>
      ) : (
        <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
          <Section>
            <div className="flex flex-col items-center py-4 text-center">
              <span className={cn('grid size-16 place-items-center rounded-full text-white shadow-lg', status.connected ? 'bg-primary shadow-primary/30' : 'bg-accent shadow-accent/30')}>
                {status.connected ? <CheckCircle2 className="size-8" /> : <Send className="size-7" />}
              </span>
              <p className="mt-4 font-semibold">{status.connected ? `Connected${status.username ? ` as ${status.username}` : ''}` : 'Get instant alerts on your phone'}</p>
              <p className="mt-1 text-sm text-muted">
                {status.connected && status.linkedAt ? `Linked ${formatDateTime(status.linkedAt)} via @${status.botUsername}` : `Link your Telegram account to @${status.botUsername} securely — no chat IDs to copy.`}
              </p>
            </div>

            {status.connected ? (
              <div className="space-y-2">
                <button
                  className="btn btn-accent w-full py-3"
                  disabled={testing}
                  onClick={async () => {
                    setTesting(true);
                    try {
                      const r = await sendTest();
                      if (r.ok) toast.success('Test message delivered', 'Check your Telegram chat.');
                      else toast.error('Telegram rejected the message', r.error);
                    } catch (e) {
                      toast.error('Test failed', e instanceof Error ? e.message : undefined);
                    } finally {
                      setTesting(false);
                    }
                  }}
                >
                  {testing ? <Spinner /> : <Zap className="size-4" />} Send test notification
                </button>
                <button className="btn btn-outline w-full text-danger" onClick={() => setConfirmDisconnect(true)}>
                  <Unplug className="size-4" /> Disconnect
                </button>
              </div>
            ) : link ? (
              <div className="space-y-3 rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm">
                <ol className="list-decimal space-y-1 pl-5 text-muted">
                  <li>Open the link below — it launches Telegram with @{status.botUsername}.</li>
                  <li>
                    Press <span className="font-semibold text-fg">Start</span>. This page updates automatically.
                  </li>
                </ol>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="btn btn-accent w-full">
                  <ExternalLink className="size-4" /> Open Telegram
                </a>
                <p className="flex items-center justify-center gap-2 text-xs text-muted">
                  <Spinner /> Waiting for confirmation · link expires {formatTime(link.expiresAt)}
                </p>
              </div>
            ) : (
              <button
                className="btn btn-accent w-full py-3"
                disabled={linking}
                onClick={async () => {
                  setLinking(true);
                  try {
                    setLink(await createLink());
                  } catch (e) {
                    toast.error('Could not create link', e instanceof Error ? e.message : undefined);
                  } finally {
                    setLinking(false);
                  }
                }}
              >
                {linking ? <Spinner /> : <Send className="size-4" />} Connect Telegram
              </button>
            )}
            <DemoNotice className="mt-4">Your chat ID is encrypted at rest (AES-256-GCM). Send /stop to the bot at any time to disconnect.</DemoNotice>
          </Section>

          <Section title="What gets sent">
            {prefs ? (
              <>
                <Toggle label="Telegram notifications" description="Master switch for this account" checked={prefs.enabled} onChange={(v) => setPref({ enabled: v })} />
                <div role="radiogroup" aria-label="Telegram delivery mode" className="mt-3 grid grid-cols-2 gap-2">
                  {(
                    [
                      ['score', 'Score threshold', 'Every analysed coin at or above a minimum opportunity score, any status'],
                      ['strict', 'Strict verified only', `Only coins passing all ${STRICT_CHECKS.length} checks`],
                    ] as const
                  ).map(([m, label, desc]) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={prefs.mode === m}
                      onClick={() => setPref({ mode: m })}
                      className={cn('rounded-xl border p-2.5 text-left text-xs transition', prefs.mode === m ? 'border-primary bg-primary/10' : 'border-line hover:bg-surface-2')}
                    >
                      <p className="font-semibold text-fg">{label}</p>
                      <p className="mt-0.5 text-muted">{desc}</p>
                    </button>
                  ))}
                </div>
                {prefs.mode === 'score' ? (
                  <div className="mt-3">
                    <label htmlFor="tg-min-score" className="flex justify-between text-sm">
                      <span>Minimum opportunity score</span>
                      <span className="num font-semibold">{minScore}/100</span>
                    </label>
                    <input id="tg-min-score" type="range" min={0} max={100} step={5} value={minScore} onChange={(e) => setDraftScore(Number(e.target.value))} onPointerUp={commitScore} onKeyUp={commitScore} onBlur={commitScore} className="mt-1 w-full accent-[var(--color-primary)]" />
                    <p className="mt-2 text-sm text-muted">
                      Each coin scoring ≥ {minScore} is sent once (then at most every 6 h) with its status — <span className="font-semibold text-fg">TRADEABLE, WATCH, AVOID or INSUFFICIENT DATA</span> — plus verified facts, all {STRICT_CHECKS.length} check results and model estimates. A high score is not a buy signal: read the status and the failed checks.
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    Telegram receives <span className="font-semibold text-fg">only</span> tokens that pass all {STRICT_CHECKS.length} checks below — with the verified facts, evidence, data sources, timestamps, model estimates and the exact decision reason. Everything else stays in the in-app inbox.
                  </p>
                )}
                <ul className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
                  {STRICT_CHECKS.map((c) => (
                    <li key={c} className="flex items-start gap-1.5">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden /> {c}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 rounded-lg border border-line bg-bg-2/60 p-2.5 text-xs text-muted">
                  Evidence base: {evidence ? `${evidence.resolved} resolved comparable outcomes (≥ ${evidence.required} required), ${evidence.pending} pending` : 'loading…'}. Missing or conflicting evidence means <span className="font-semibold text-fg">INSUFFICIENT DATA</span>{prefs.mode === 'strict' ? ' — no alert' : ' for probabilities and targets — never a guess'}.
                </p>
              </>
            ) : (
              <Spinner />
            )}
          </Section>
        </div>
      )}

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <Section title="Delivery log" action={<span className="text-xs text-muted">{status?.recent.length ?? 0} recent</span>}>
          {status?.recent.length ? (
            <ul className="space-y-2">
              {status.recent.map((m) => (
                <li key={m.id} className="rounded-2xl rounded-tl-sm border border-line bg-surface-2 px-3.5 py-2.5 text-sm">
                  <p className="line-clamp-4 whitespace-pre-line">{m.text}</p>
                  <p className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-subtle">
                    {m.status === 'sent' ? <CheckCircle2 className="size-3 text-primary" /> : m.status === 'failed' ? <XCircle className="size-3 text-danger" /> : <Spinner className="size-3" />}
                    {m.status}
                    {m.error && ` — ${m.error}`} · {formatTime(m.at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Send} title="Nothing sent yet" description={status?.connected ? 'Alerts appear here as they are delivered.' : 'Connect Telegram to start receiving alerts.'} />
          )}
        </Section>
        <Section title="Message preview">
          {preview ? (
            <pre className="max-h-[520px] overflow-auto rounded-2xl rounded-tl-sm border border-line bg-surface-2 p-3.5 font-sans text-xs whitespace-pre-wrap">{preview}</pre>
          ) : (
            <p className="text-sm text-muted">No token currently passes every strict check, so there is nothing to preview. When one does, the exact message sent to Telegram will appear here.</p>
          )}
        </Section>
      </div>

      <ConfirmModal
        open={confirmDisconnect}
        title="Disconnect Telegram?"
        message="You'll stop receiving alerts in Telegram. Your preferences are kept."
        confirmLabel="Disconnect"
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={async () => {
          setConfirmDisconnect(false);
          try {
            await disconnect();
            toast.info('Telegram disconnected');
          } catch (e) {
            toast.error('Failed', e instanceof Error ? e.message : undefined);
          }
        }}
      />
    </div>
  );
}
