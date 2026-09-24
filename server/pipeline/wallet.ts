import type { CreatorIntel, HolderEntry, HolderIntel, Token } from '../../shared/types.ts';
import type { ChainProvider } from './providers/types.ts';

/**
 * Creator / holder intelligence. Every result states its source (RPC, reconstructed from the
 * trade stream, or unavailable) so the UI never presents guesses as facts.
 */
const creatorCache = new Map<string, { at: number; intel: CreatorIntel }>();
const holderCache = new Map<string, { at: number; intel: HolderIntel }>();
const TTL = 60_000;

/** Wallets that bought within `windowMs` of launch — candidate insiders / bundle buyers. */
export function earlyBuyers(t: Token, windowMs = 15_000): string[] {
  const cutoff = t.createdAt + windowMs;
  return [...new Set(t.trades.filter((x) => x.side === 'buy' && x.t <= cutoff && !x.isCreator).map((x) => x.trader))];
}

function linkedWallets(t: Token): CreatorIntel['linkedWallets'] {
  const out = new Map<string, string>();
  for (const w of earlyBuyers(t)) out.set(w, 'Bought within 15s of launch (possible bundle)');
  const creatorSeconds = new Set(t.trades.filter((x) => x.isCreator).map((x) => Math.floor(x.t / 1000)));
  for (const x of t.trades) {
    if (!x.isCreator && creatorSeconds.has(Math.floor(x.t / 1000))) out.set(x.trader, 'Traded in the same second as the creator');
  }
  return [...out].slice(0, 12).map(([wallet, reason]) => ({ wallet, reason }));
}

export async function getCreatorIntel(chain: ChainProvider, t: Token, observed: CreatorIntel['launchesObserved']): Promise<CreatorIntel | null> {
  if (!t.creator) return null;
  const key = `${t.creator}:${t.id}`;
  const hit = creatorCache.get(key);
  const live = { launchesObserved: observed, linkedWallets: linkedWallets(t), soldPct: t.creatorSoldPct, currentHoldingPct: t.devHoldingPct };
  if (hit && Date.now() - hit.at < TTL) return { ...hit.intel, ...live };

  const errors: string[] = [];
  const [balance, sigs] = await Promise.all([
    chain.getBalanceSol(t.creator).catch((e: unknown) => {
      errors.push(`Balance: ${e instanceof Error ? e.message : 'unavailable'}`);
      return null;
    }),
    chain.getSignatures(t.creator, 25).catch((e: unknown) => {
      errors.push(`History: ${e instanceof Error ? e.message : 'unavailable'}`);
      return null;
    }),
  ]);
  const times = (sigs ?? []).map((s) => (s.blockTime ? s.blockTime * 1000 : null)).filter((x): x is number => x !== null);
  const intel: CreatorIntel = {
    wallet: t.creator,
    fetchedAt: Date.now(),
    balanceSol: balance,
    recentTxs: (sigs ?? []).map((s) => ({ signature: s.signature, t: s.blockTime ? s.blockTime * 1000 : null, ok: !s.err })),
    txCount: sigs ? sigs.length : null,
    firstSeen: times.length ? Math.min(...times) : null,
    launchesReported: t.devMints,
    migrationsReported: t.devMigrations,
    initialBuyPct: t.creatorInitialBuyPct,
    errors,
    ...live,
  };
  if (!errors.length) creatorCache.set(key, { at: Date.now(), intel });
  return intel;
}

function holdersFromTrades(t: Token): HolderEntry[] {
  const bal = new Map<string, number>();
  for (const x of [...t.trades].reverse()) bal.set(x.trader, (bal.get(x.trader) ?? 0) + (x.side === 'buy' ? x.tokens : -x.tokens));
  const supply = t.supply || 1;
  return [...bal]
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([owner, amount]) => ({ owner, tokenAccount: '', amount, pct: (amount / supply) * 100, label: owner === t.creator ? 'Creator' : undefined }));
}

export async function getHolderIntel(chain: ChainProvider, t: Token): Promise<HolderIntel> {
  const hit = holderCache.get(t.id);
  if (hit && Date.now() - hit.at < TTL) return hit.intel;
  let intel: HolderIntel;
  try {
    const accounts = await chain.getLargestAccounts(t.mint);
    const supply = t.supply || accounts.reduce((s, a) => s + a.amount, 0) || 1;
    const early = new Set(earlyBuyers(t));
    const holders: HolderEntry[] = accounts.map((a) => {
      const owner = a.owner ?? a.tokenAccount;
      const label: HolderEntry['label'] =
        owner === t.bondingCurve ? 'Bonding curve' : owner === t.pool ? 'Liquidity pool' : owner === t.creator ? 'Creator' : early.has(owner) ? 'Early buyer' : undefined;
      return { owner, tokenAccount: a.tokenAccount, amount: a.amount, pct: (a.amount / supply) * 100, label };
    });
    // Program-owned accounts (bonding curve / pool) are excluded from concentration.
    const wallets = holders.filter((h, i) => h.label !== 'Bonding curve' && h.label !== 'Liquidity pool' && !(i === 0 && !t.graduated && h.pct > 20 && !h.label));
    intel = { source: 'rpc', fetchedAt: Date.now(), holders, top10Pct: wallets.slice(0, 10).reduce((s, h) => s + h.pct, 0) };
    holderCache.set(t.id, { at: Date.now(), intel });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'RPC unavailable';
    const fromTrades = holdersFromTrades(t);
    intel = fromTrades.length
      ? {
          source: 'trade-flow',
          fetchedAt: Date.now(),
          holders: fromTrades,
          top10Pct: fromTrades.slice(0, 10).reduce((s, h) => s + h.pct, 0),
          note: `Reconstructed from ${t.trades.length} observed trades (${reason}).`,
        }
      : {
          source: 'unavailable',
          fetchedAt: Date.now(),
          holders: [],
          top10Pct: t.topHoldersPct,
          note: `${reason}. Aggregate top-holder concentration from the market provider is still used for scoring.`,
        };
  }
  return intel;
}
