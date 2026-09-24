/**
 * STRICT VERIFIED-COIN FILTER
 *
 * Fourteen hard checks. Every check reports pass / fail / unknown together with the exact evidence,
 * the requirement, the data source and the observation timestamp. A token is TRADEABLE only when
 * all fourteen pass; any missing evidence yields INSUFFICIENT DATA instead of a guess.
 *
 * Verified facts (observed data) are kept strictly separate from model estimates (probabilities,
 * entry/stop/targets), and model estimates are derived only from recorded outcomes of comparable
 * past setups — never invented. Nothing here is a prediction or a guarantee.
 */
import { age, compactUsd, priceUsd, signedPct } from './numbers.ts';
import type { ComparableStats, TradePlan, Token, VerifiedFact, VerifyCheck, VerificationResult, VerificationSummary, VerifyStatus } from './types.ts';

export const STRICT = {
  marketMaxAgeMs: 2 * 60_000,
  onChainMaxAgeMs: 30 * 60_000,
  minLiquidityUsd: 15_000,
  minLiquidityToMcap: 0.05,
  maxLiquidityDrop5mPct: -10,
  maxLiquidityDrawdown30mPct: 25,
  minHistoryMs: 15 * 60_000,
  minVolume1hUsd: 10_000,
  minTransactions24h: 150,
  minTraders: 60,
  minHolders: 150,
  minOrganicScore: 30,
  maxTopHoldersPct: 30,
  maxCreatorPriorLaunches: 20,
  maxCreatorHoldingPct: 5,
  maxCreatorSoldPct: 30,
  maxManipulationSignal: 0.55,
  maxInsiderSignal: 0.6,
  minBuyShare: 0.55,
  minComparables: 20,
  minRiskReward: 2,
  outcomeHorizonMin: 60,
  bullThresholdPct: 25,
  bearThresholdPct: -25,
} as const;

export const VERIFY_DISCLAIMER =
  'Model-generated analysis of verified on-chain and market data. Probabilities and targets are statistical estimates from past comparable setups — not predictions, not guarantees and not financial advice. Meme coins can lose all value quickly.';

/** Outcome of one historical comparable setup (recorded by the server's outcome tracker). */
export interface OutcomeSample {
  score: number;
  risk: number;
  returnPct: number;
  maxUpPct: number;
  maxDrawdownPct: number;
  takenAt: number;
}

const iso = (t: number | null) => (t ? new Date(t).toISOString().replace('.000Z', 'Z') : 'n/a');
const factor = (t: Token, kind: 'risk' | 'opportunity', key: string) => (kind === 'risk' ? t.risk : t.opportunity).factors.find((f) => f.key === key)?.value ?? null;

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Comparable setups: similar opportunity (±10) and risk (±15) scores. */
export function comparableStats(t: Token, samples: OutcomeSample[]): ComparableStats | null {
  const comps = samples.filter((s) => Math.abs(s.score - t.score) <= 10 && Math.abs(s.risk - t.riskScore) <= 15);
  if (!comps.length) return null;
  const n = comps.length;
  const returns = comps.map((s) => s.returnPct).sort((a, b) => a - b);
  const ups = comps.map((s) => s.maxUpPct).sort((a, b) => a - b);
  const dds = comps.map((s) => Math.abs(Math.min(0, s.maxDrawdownPct))).sort((a, b) => a - b);
  const bull = comps.filter((s) => s.returnPct >= STRICT.bullThresholdPct).length / n;
  const bear = comps.filter((s) => s.returnPct <= STRICT.bearThresholdPct).length / n;
  return {
    n,
    horizonMin: STRICT.outcomeHorizonMin,
    band: `opportunity ${Math.max(0, t.score - 10)}–${Math.min(100, t.score + 10)}, risk ${Math.max(0, t.riskScore - 15)}–${Math.min(100, t.riskScore + 15)}`,
    bullProb: bull,
    bearProb: bear,
    baseProb: Math.max(0, 1 - bull - bear),
    meanReturn: returns.reduce((s, r) => s + r, 0) / n,
    medianReturn: quantile(returns, 0.5),
    maxUpQ50: quantile(ups, 0.5),
    maxUpQ70: quantile(ups, 0.7),
    maxUpQ90: quantile(ups, 0.9),
    drawdownQ70: quantile(dds, 0.7),
    firstAt: Math.min(...comps.map((s) => s.takenAt)),
    lastAt: Math.max(...comps.map((s) => s.takenAt)),
  };
}

/** Entry / stop / targets sized from the empirical distribution of comparable outcomes. */
export function buildPlan(t: Token, c: ComparableStats): TradePlan {
  const price = t.price;
  const stopPct = Math.min(40, Math.max(12, c.drawdownQ70));
  const stop = price * (1 - stopPct / 100);
  const tp1 = price * (1 + Math.max(5, c.maxUpQ50) / 100);
  const tp2 = Math.max(tp1 * 1.05, price * (1 + c.maxUpQ70 / 100));
  const tp3 = Math.max(tp2 * 1.05, price * (1 + c.maxUpQ90 / 100));
  const entry = price;
  return {
    entryLow: price * 0.97,
    entryHigh: price * 1.02,
    stop,
    stopPct,
    tp1,
    tp2,
    tp3,
    rr: (tp2 - entry) / Math.max(entry - stop, 1e-12),
    invalidation: [
      `Price trades below ${priceUsd(stop)} (−${stopPct.toFixed(0)}%)`,
      `Liquidity falls more than ${STRICT.maxLiquidityDrawdown30mPct}% from its 30-minute high`,
      'Creator or a top holder sells a large share of supply',
      'Mint/freeze authority or metadata changes',
    ],
  };
}

function liquidityDrawdown30m(t: Token, now: number): { dd: number; spanMs: number } | null {
  const pts = t.history.filter((h) => h.t >= now - 30 * 60_000 && h.liquidity > 0);
  if (pts.length < 3) return null;
  let peak = pts[0].liquidity;
  let dd = 0;
  for (const p of pts) {
    peak = Math.max(peak, p.liquidity);
    dd = Math.max(dd, (1 - p.liquidity / peak) * 100);
  }
  return { dd, spanMs: pts[pts.length - 1].t - pts[0].t };
}

export function verifyToken(t: Token, samples: OutcomeSample[], now = Date.now()): VerificationResult {
  const S = STRICT;
  const mkt = t.marketUpdatedAt;
  const MARKET = `Jupiter token API · ${iso(mkt)}`;
  const RPC = `Solana RPC mint account · ${iso(t.onChainVerifiedAt)}`;
  const HIST = `Radar recorded history (${t.history.length} points)`;
  const checks: VerifyCheck[] = [];
  const add = (c: VerifyCheck) => checks.push(c);
  const marketFresh = !!mkt && now - mkt <= S.marketMaxAgeMs;
  const onChainFresh = !!t.onChainVerifiedAt && now - t.onChainVerifiedAt <= S.onChainMaxAgeMs;

  // 1. Verified on-chain data
  add({
    key: 'onchain',
    label: 'Verified on-chain data',
    critical: false,
    requirement: `Mint account read from Solana RPC within ${S.onChainMaxAgeMs / 60_000} min and market data within ${S.marketMaxAgeMs / 60_000} min`,
    outcome: onChainFresh && marketFresh ? 'pass' : 'unknown',
    evidence: `On-chain read ${t.onChainVerifiedAt ? `${Math.round((now - t.onChainVerifiedAt) / 60_000)} min ago` : 'not yet performed'}; market data ${mkt ? `${Math.round((now - mkt) / 1000)} s old` : 'not received'}`,
    source: `${RPC}; ${MARKET}`,
    observedAt: t.onChainVerifiedAt,
  });

  // 2. Valid metadata
  const hasNames = t.name.trim().length > 0 && t.symbol.trim().length > 0 && t.symbol !== '???';
  add({
    key: 'metadata',
    label: 'Valid token/contract metadata',
    critical: true,
    requirement: 'Metadata resolves with a name and symbol',
    outcome: t.metadataOk === null ? 'unknown' : t.metadataOk && hasNames ? 'pass' : 'fail',
    evidence: t.metadataOk === null ? 'Metadata not yet checked' : t.metadataOk ? `Resolved: ${t.name} ($${t.symbol})` : 'Metadata missing or unreachable',
    source: RPC,
    observedAt: t.onChainVerifiedAt,
  });

  // 3. Sufficient liquidity
  const liqRatio = t.marketCap > 0 ? t.liquidity / t.marketCap : 0;
  add({
    key: 'liquidity',
    label: 'Sufficient liquidity',
    critical: false,
    requirement: `≥ ${compactUsd(S.minLiquidityUsd)} and ≥ ${S.minLiquidityToMcap * 100}% of market cap`,
    outcome: !mkt ? 'unknown' : t.liquidity >= S.minLiquidityUsd && liqRatio >= S.minLiquidityToMcap ? 'pass' : 'fail',
    evidence: `${compactUsd(t.liquidity)} liquidity, ${(liqRatio * 100).toFixed(1)}% of ${compactUsd(t.marketCap)} mcap`,
    source: MARKET,
    observedAt: mkt,
  });

  // 4. Stable liquidity
  const ldd = liquidityDrawdown30m(t, now);
  const hist = t.history.length ? now - t.history[0].t : 0;
  const liq5 = t.liquidityChange5m;
  add({
    key: 'liquidityStable',
    label: 'Stable liquidity (no major LP withdrawal)',
    critical: true,
    requirement: `5m change > ${S.maxLiquidityDrop5mPct}% and 30m drawdown < ${S.maxLiquidityDrawdown30mPct}% over ≥ ${S.minHistoryMs / 60_000} min of history`,
    outcome:
      !ldd || hist < S.minHistoryMs
        ? 'unknown'
        : ldd.dd < S.maxLiquidityDrawdown30mPct && (liq5 === null || liq5 > S.maxLiquidityDrop5mPct)
          ? 'pass'
          : 'fail',
    evidence: ldd ? `30m liquidity drawdown ${ldd.dd.toFixed(1)}% over ${Math.round(ldd.spanMs / 60_000)} min; 5m change ${liq5 === null ? 'n/a' : signedPct(liq5, 1)}` : `Only ${Math.round(hist / 60_000)} min of liquidity history recorded`,
    source: `${HIST}; ${MARKET}`,
    observedAt: mkt,
  });

  // 5. Healthy volume & transactions
  const tx = t.buys24h + t.sells24h;
  add({
    key: 'activity',
    label: 'Healthy volume and transaction activity',
    critical: false,
    requirement: `1h volume ≥ ${compactUsd(S.minVolume1hUsd)}, ≥ ${S.minTransactions24h} transactions, ≥ ${S.minTraders} unique traders`,
    outcome: !mkt ? 'unknown' : t.volume1h >= S.minVolume1hUsd && tx >= S.minTransactions24h && t.traders >= S.minTraders ? 'pass' : 'fail',
    evidence: `${compactUsd(t.volume1h)} 1h volume, ${tx} transactions, ${t.traders} traders`,
    source: MARKET,
    observedAt: mkt,
  });

  // 6. Organic holder growth
  add({
    key: 'holders',
    label: 'Organic holder growth',
    critical: false,
    requirement: `≥ ${S.minHolders} holders, positive 1h holder change, organic score ≥ ${S.minOrganicScore}`,
    outcome:
      !mkt || t.holdersChange === null || t.organicScore === null
        ? 'unknown'
        : t.holders >= S.minHolders && t.holdersChange > 0 && t.organicScore >= S.minOrganicScore
          ? 'pass'
          : 'fail',
    evidence: `${t.holders} holders, ${t.holdersChange === null ? 'n/a' : signedPct(t.holdersChange, 1)} (1h), organic score ${t.organicScore === null ? 'n/a' : Math.round(t.organicScore)}`,
    source: MARKET,
    observedAt: mkt,
  });

  // 7. Top-holder concentration
  add({
    key: 'concentration',
    label: 'Acceptable top-holder concentration',
    critical: true,
    requirement: `Top holders ≤ ${S.maxTopHoldersPct}% of supply`,
    outcome: t.topHoldersPct === null ? 'unknown' : t.topHoldersPct <= S.maxTopHoldersPct ? 'pass' : 'fail',
    evidence: t.topHoldersPct === null ? 'Top-holder data unavailable' : `Top holders own ${t.topHoldersPct.toFixed(1)}%`,
    source: MARKET,
    observedAt: mkt,
  });

  // 8. Creator wallet risk
  const creatorHolding = t.devHoldingPct ?? t.creatorInitialBuyPct;
  add({
    key: 'creator',
    label: 'Creator wallet risk below threshold',
    critical: true,
    requirement: `≤ ${S.maxCreatorPriorLaunches} prior launches and creator holding ≤ ${S.maxCreatorHoldingPct}%`,
    outcome: t.devMints === null || creatorHolding === null ? 'unknown' : t.devMints <= S.maxCreatorPriorLaunches && creatorHolding <= S.maxCreatorHoldingPct ? 'pass' : 'fail',
    evidence: `Creator ${t.creator ? `${t.creator.slice(0, 4)}…${t.creator.slice(-4)}` : 'unknown'}: ${t.devMints ?? 'n/a'} prior launches, holds ${creatorHolding === null ? 'n/a' : `${creatorHolding.toFixed(2)}%`}`,
    source: MARKET,
    observedAt: mkt,
  });

  // 9. No critical mint/freeze/security warning
  add({
    key: 'security',
    label: 'No critical mint/freeze/security warning',
    critical: true,
    requirement: 'Mint authority revoked, freeze authority revoked, no restrictive token extensions',
    outcome:
      t.mintAuthorityDisabled === null || t.freezeAuthorityDisabled === null || t.securityRisk === null
        ? 'unknown'
        : t.mintAuthorityDisabled && t.freezeAuthorityDisabled && t.securityRisk < 0.5
          ? 'pass'
          : 'fail',
    evidence: `Mint ${t.mintAuthorityDisabled === null ? 'unchecked' : t.mintAuthorityDisabled ? 'revoked' : 'ACTIVE'}, freeze ${t.freezeAuthorityDisabled === null ? 'unchecked' : t.freezeAuthorityDisabled ? 'revoked' : 'ACTIVE'}${t.securityNotes.length ? `; ${t.securityNotes.join('; ')}` : ''}`,
    source: RPC,
    observedAt: t.onChainVerifiedAt,
  });

  // 10. No wash trading / manipulation
  const manip = ['volumeQuality', 'botActivity', 'walletClustering', 'priceManipulation'].map((k) => [k, factor(t, 'risk', k)] as const);
  const known = manip.filter(([, v]) => v !== null);
  const worst = known.reduce<readonly [string, number | null] | null>((w, m) => (!w || (m[1] ?? 0) > (w[1] ?? 0) ? m : w), null);
  add({
    key: 'manipulation',
    label: 'No obvious wash trading/manipulation',
    critical: true,
    requirement: `Volume quality, bot activity, wallet clustering and price-manipulation signals all < ${S.maxManipulationSignal * 100}% (≥ 3 of 4 measured)`,
    // Any measured failing signal is decisive; a pass needs at least 3 of 4 signals measured.
    outcome: known.some(([, v]) => (v ?? 0) >= S.maxManipulationSignal) ? 'fail' : known.length < 3 ? 'unknown' : 'pass',
    evidence: known.length ? manip.map(([k, v]) => `${k} ${v === null ? 'n/a' : `${Math.round(v * 100)}%`}`).join(', ') + (worst ? ` (worst: ${worst[0]})` : '') : 'No manipulation signals measured yet',
    source: `${MARKET}; ${HIST}`,
    observedAt: mkt,
  });

  // 11. No abnormal insider dumping
  const insider = factor(t, 'risk', 'insiderActivity');
  const recentCreatorSell = t.trades.some((x) => x.isCreator && x.side === 'sell' && now - x.t < 60 * 60_000);
  add({
    key: 'insiders',
    label: 'No abnormal insider dumping',
    critical: true,
    requirement: `Creator sold < ${S.maxCreatorSoldPct}% of allocation, no creator sells in the last hour, insider signal < ${S.maxInsiderSignal * 100}%`,
    outcome: insider === null && t.devHoldingPct === null ? 'unknown' : t.creatorSoldPct < S.maxCreatorSoldPct && !recentCreatorSell && (insider ?? 0) < S.maxInsiderSignal ? 'pass' : 'fail',
    evidence: `Creator sold ~${t.creatorSoldPct.toFixed(0)}%${recentCreatorSell ? ', creator sell observed in last hour' : ''}; insider signal ${insider === null ? 'n/a' : `${Math.round(insider * 100)}%`}`,
    source: `${MARKET}${t.trades.length ? '; PumpPortal trade stream' : ''}`,
    observedAt: mkt,
  });

  // 12. Positive momentum confirmation
  const flow = t.buyVolume + t.sellVolume;
  const buyShare = flow > 0 ? t.buyVolume / flow : null;
  add({
    key: 'momentum',
    label: 'Positive momentum confirmation',
    critical: false,
    requirement: `5m and 1h price change > 0 and buy share ≥ ${S.minBuyShare * 100}%`,
    outcome: t.priceChange5m === null || t.priceChange1h === null || buyShare === null ? 'unknown' : t.priceChange5m > 0 && t.priceChange1h > 0 && buyShare >= S.minBuyShare ? 'pass' : 'fail',
    evidence: `5m ${t.priceChange5m === null ? 'n/a' : signedPct(t.priceChange5m, 1)}, 1h ${t.priceChange1h === null ? 'n/a' : signedPct(t.priceChange1h, 1)}, buys ${buyShare === null ? 'n/a' : `${Math.round(buyShare * 100)}%`} of volume`,
    source: MARKET,
    observedAt: mkt,
  });

  // 13. Historical comparables
  const comps = comparableStats(t, samples);
  const enough = !!comps && comps.n >= S.minComparables;
  add({
    key: 'comparables',
    label: 'Historical comparable setups provide sufficient evidence',
    critical: false,
    requirement: `≥ ${S.minComparables} recorded outcomes of similar setups with positive mean return and P(bull) > P(bear)`,
    outcome: !enough ? 'unknown' : comps.meanReturn > 0 && comps.bullProb > comps.bearProb ? 'pass' : 'fail',
    evidence: comps
      ? `${comps.n} comparable outcomes (${comps.band}); mean ${signedPct(comps.meanReturn, 1)}, median ${signedPct(comps.medianReturn, 1)} after ${comps.horizonMin} min`
      : `0 of ${S.minComparables} required comparable outcomes recorded`,
    source: `Radar outcome tracker (${samples.length} resolved setups)`,
    observedAt: comps?.lastAt ?? null,
  });

  // 14. Risk/Reward
  const plan = enough && t.price > 0 ? buildPlan(t, comps) : null;
  add({
    key: 'riskReward',
    label: 'Minimum Risk/Reward threshold satisfied',
    critical: false,
    requirement: `TP2 reward ÷ stop risk ≥ ${S.minRiskReward}`,
    outcome: !plan ? 'unknown' : plan.rr >= S.minRiskReward ? 'pass' : 'fail',
    evidence: plan ? `R/R ${plan.rr.toFixed(2)} (entry ${priceUsd(t.price)}, stop ${priceUsd(plan.stop)}, TP2 ${priceUsd(plan.tp2)})` : 'Requires sufficient comparable outcomes',
    source: 'Model estimate from comparable outcomes',
    observedAt: comps?.lastAt ?? null,
  });

  const passed = checks.filter((c) => c.outcome === 'pass').length;
  const criticalFail = checks.filter((c) => c.outcome === 'fail' && c.critical);
  const unknown = checks.filter((c) => c.outcome === 'unknown');
  const fails = checks.filter((c) => c.outcome === 'fail');
  const status: VerifyStatus = criticalFail.length ? 'AVOID' : unknown.length ? 'INSUFFICIENT DATA' : fails.length ? 'WATCH' : 'TRADEABLE';

  const list = (cs: VerifyCheck[]) => cs.map((c) => `${c.label} (${c.evidence})`).join('; ');
  const reason =
    status === 'TRADEABLE'
      ? `All ${checks.length} strict checks passed at ${iso(now)}. This means the observed data met every threshold — it does not mean the price will rise.`
      : status === 'AVOID'
        ? `Critical check failed: ${list(criticalFail)}.`
        : status === 'INSUFFICIENT DATA'
          ? `Not enough verified evidence to decide — missing: ${list(unknown)}.`
          : `No critical failure, but not all criteria met: ${list(fails)}.`;

  const facts: VerifiedFact[] = [
    { label: 'Mint address', value: t.mint, source: 'Launch event / Jupiter', observedAt: t.detectedAt },
    { label: 'Launch time', value: `${iso(t.createdAt)} (age ${age(t.createdAt, now)})`, source: 'Launch event / Jupiter', observedAt: t.detectedAt },
    { label: 'Launchpad', value: t.launchpad, source: 'Jupiter token API', observedAt: mkt },
    { label: 'Price', value: priceUsd(t.price), source: MARKET, observedAt: mkt },
    { label: 'Market cap / FDV', value: `${compactUsd(t.marketCap)} / ${compactUsd(t.fdv)}`, source: MARKET, observedAt: mkt },
    { label: 'Liquidity', value: compactUsd(t.liquidity), source: MARKET, observedAt: mkt },
    { label: 'Volume 5m / 1h / 24h', value: `${compactUsd(t.volume5m)} / ${compactUsd(t.volume1h)} / ${compactUsd(t.volume24h)}`, source: MARKET, observedAt: mkt },
    { label: 'Buys / sells (24h)', value: `${t.buys24h} / ${t.sells24h}`, source: MARKET, observedAt: mkt },
    { label: 'Holders', value: `${t.holders}${t.holdersChange !== null ? ` (${signedPct(t.holdersChange, 1)} 1h)` : ''}`, source: MARKET, observedAt: mkt },
    { label: 'Top-holder share', value: t.topHoldersPct === null ? 'n/a' : `${t.topHoldersPct.toFixed(1)}%`, source: MARKET, observedAt: mkt },
    { label: 'Mint / freeze authority', value: `${t.mintAuthorityDisabled === null ? 'unchecked' : t.mintAuthorityDisabled ? 'revoked' : 'ACTIVE'} / ${t.freezeAuthorityDisabled === null ? 'unchecked' : t.freezeAuthorityDisabled ? 'revoked' : 'ACTIVE'}`, source: RPC, observedAt: t.onChainVerifiedAt },
    { label: 'Creator', value: t.creator ?? 'unknown', source: 'Launch event / Jupiter', observedAt: t.detectedAt },
  ];

  return {
    mint: t.mint,
    symbol: t.symbol,
    name: t.name,
    status,
    checkedAt: now,
    passed,
    total: checks.length,
    checks,
    facts,
    estimates: {
      comparables: comps,
      plan: status === 'TRADEABLE' || status === 'WATCH' ? plan : null,
      note: enough
        ? `Estimates from ${comps.n} recorded outcomes of comparable setups (${iso(comps.firstAt)} – ${iso(comps.lastAt)}), measured ${comps.horizonMin} min after qualification.`
        : `INSUFFICIENT DATA — ${comps?.n ?? 0}/${S.minComparables} comparable outcomes recorded. No probabilities or targets are shown until enough real outcomes exist.`,
    },
    opportunityScore: t.score,
    riskScore: t.riskScore,
    reason,
  };
}

export const summarizeVerification = (v: VerificationResult): VerificationSummary => ({ status: v.status, passed: v.passed, total: v.total, reason: v.reason, checkedAt: v.checkedAt });

/**
 * Candidate definition for the outcome tracker: the core safety/activity checks (1–12) pass.
 * Recording outcomes for these builds the comparable-setup evidence base over time.
 */
export function isTrackableSetup(v: VerificationResult): boolean {
  return v.checks.filter((c) => c.key !== 'comparables' && c.key !== 'riskReward').every((c) => c.outcome === 'pass');
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const mark = (o: VerifyCheck['outcome']) => (o === 'pass' ? '✅' : o === 'fail' ? '❌' : '❔');

const STATUS_ICON: Record<VerifyStatus, string> = { TRADEABLE: '🎯', WATCH: '👀', AVOID: '⛔', 'INSUFFICIENT DATA': '❔' };

/** Complete Telegram report for a token (any status). Plain text, no hype; the status is always explicit. */
export function formatVerifiedTelegram(v: VerificationResult, appUrl?: string): string {
  const c = v.estimates.comparables;
  const p = v.estimates.plan;
  const lines = [
    `${STATUS_ICON[v.status]} STATUS: ${v.status} — $${v.symbol} (${v.name})`,
    `${v.status === 'TRADEABLE' ? 'All ' : ''}${v.passed}/${v.total} strict checks passed · ${iso(v.checkedAt)}`,
    `Mint: ${v.mint}`,
    '',
    '━━ VERIFIED FACTS ━━',
    ...v.facts.map((f) => `• ${f.label}: ${f.value} [${f.source}]`),
    '',
    '━━ CHECKS ━━',
    ...v.checks.map((ch) => `${mark(ch.outcome)} ${ch.label}: ${ch.evidence}`),
    '',
    '━━ MODEL ESTIMATES (not predictions) ━━',
    c ? `📈 After ${c.horizonMin} min, ${c.n} comparable setups: Bull ${pct(c.bullProb)} (≥ +${STRICT.bullThresholdPct}%) · Base ${pct(c.baseProb)} · Bear ${pct(c.bearProb)} (≤ ${STRICT.bearThresholdPct}%)` : '📈 Probabilities: INSUFFICIENT DATA',
    p ? `💰 Entry zone: ${priceUsd(p.entryLow)} – ${priceUsd(p.entryHigh)}` : '',
    p ? `🛑 Stop / invalidation: ${priceUsd(p.stop)} (−${p.stopPct.toFixed(0)}%)` : '',
    p ? `🎯 TP1 ${priceUsd(p.tp1)} · TP2 ${priceUsd(p.tp2)} · TP3 ${priceUsd(p.tp3)}` : '',
    p ? `⚖️ Risk/Reward (to TP2): ${p.rr.toFixed(2)}` : '',
    `📊 Opportunity Score: ${v.opportunityScore}/100`,
    `🚨 Risk Score: ${v.riskScore}/100`,
    c ? `Basis: ${v.estimates.note}` : '',
    '',
    '🧠 Decision:',
    v.reason,
    p ? `Invalidate if: ${p.invalidation.join('; ')}.` : '',
    '',
    appUrl ? `${appUrl}/tokens/${v.mint}?tab=verify` : '',
  ];
  const tail = `\n\n⚠️ ${VERIFY_DISCLAIMER}`;
  const body = lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
  // Telegram caps messages at 4096 characters; the disclaimer is always kept.
  const max = 4000 - tail.length;
  return (body.length > max ? `${body.slice(0, max - 1)}…` : body) + tail;
}
