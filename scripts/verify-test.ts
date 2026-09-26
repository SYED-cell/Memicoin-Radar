/**
 * Unit checks for the strict verified-coin filter. Usage: node scripts/verify-test.ts
 */
import { curveMarket, decodeCurve } from '../shared/bondingCurve.ts';
import { createToken, evaluate } from '../shared/tokenService.ts';
import type { HistoryPoint, Token } from '../shared/types.ts';
import { formatVerifiedTelegram, STRICT, verifyToken, type OutcomeSample } from '../shared/verification.ts';

let failures = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ''}`);
  if (!cond) failures++;
};

const now = Date.now();
const MIN = 60_000;

/** A token whose every observable metric satisfies the strict thresholds. */
function healthyToken(): Token {
  const history: HistoryPoint[] = Array.from({ length: 40 }, (_, i) => ({
    t: now - (40 - i) * 30_000,
    price: 0.0001 * (1 + i * 0.01),
    mcap: 100_000 * (1 + i * 0.01),
    liquidity: 30_000 * (1 + i * 0.002),
    volume: 500,
    buyVolume: 350,
    sellVolume: 150,
    holders: 300 + i,
  }));
  const base = createToken({ mint: 'Hea1thyMint1111111111111111111111111111111', name: 'Healthy', symbol: 'HLTH', createdAt: now - 90 * MIN, creator: 'Creator111111111111111111111111111111111111' }, 'live', 150, now);
  const t: Token = {
    ...base,
    history,
    price: 0.000139,
    marketCap: 139_000,
    fdv: 139_000,
    liquidity: 32_000,
    liquidityChange5m: 1,
    marketUpdatedAt: now - 20_000,
    onChainVerifiedAt: now - 5 * MIN,
    metadataOk: true,
    mintAuthorityDisabled: true,
    freezeAuthorityDisabled: true,
    securityRisk: 0,
    securityNotes: [],
    volume5m: 2_500,
    volume1h: 25_000,
    volume24h: 60_000,
    buyVolume: 16_000,
    sellVolume: 9_000,
    buys24h: 300,
    sells24h: 200,
    traders: 180,
    netBuyers: 40,
    holders: 420,
    holdersChange: 12,
    organicScore: 55,
    organicVolumeRatio: 0.6,
    topHoldersPct: 18,
    devHoldingPct: 1.5,
    devMints: 2,
    devMigrations: 1,
    creatorSoldPct: 0,
    priceChange5m: 4,
    priceChange1h: 22,
    priceChange24h: 40,
    socials: { twitter: 'https://x.com/example', website: 'https://example.org' },
    description: 'Community token with a described narrative.',
  };
  return evaluate(t, undefined, now);
}

const goodSamples = (n: number, t: Token): OutcomeSample[] =>
  Array.from({ length: n }, (_, i) => ({
    score: t.score + ((i % 5) - 2),
    risk: t.riskScore + ((i % 7) - 3),
    returnPct: i % 3 === 0 ? -20 : i % 3 === 1 ? 45 : 80,
    maxUpPct: 60 + (i % 10) * 20,
    maxDrawdownPct: -(10 + (i % 4) * 3),
    takenAt: now - (i + 2) * 3_600_000,
  }));

const t = healthyToken();
console.log(`      healthy token: opportunity ${t.score}, risk ${t.riskScore}`);

// 1. No comparable evidence → INSUFFICIENT DATA, no plan.
const v0 = verifyToken(t, [], now);
check('no comparables → INSUFFICIENT DATA', v0.status === 'INSUFFICIENT DATA', { s: v0.status, reason: v0.reason });
check('no comparables → no trading plan', v0.estimates.plan === null);
check('12 core checks pass on healthy data', v0.checks.filter((c) => c.outcome === 'pass').length === 12, v0.checks.filter((c) => c.outcome !== 'pass').map((c) => `${c.key}:${c.outcome}:${c.evidence}`));

// 2. Enough good comparables → TRADEABLE with full plan.
const v1 = verifyToken(t, goodSamples(30, t), now);
check('all checks pass → TRADEABLE', v1.status === 'TRADEABLE', { s: v1.status, fails: v1.checks.filter((c) => c.outcome !== 'pass').map((c) => `${c.key}:${c.evidence}`) });
check('plan has entry < TP1 < TP2 < TP3 and stop < entry', !!v1.estimates.plan && v1.estimates.plan.stop < v1.estimates.plan.entryLow && v1.estimates.plan.tp1 < v1.estimates.plan.tp2 && v1.estimates.plan.tp2 < v1.estimates.plan.tp3);
check(`R/R ≥ ${STRICT.minRiskReward}`, (v1.estimates.plan?.rr ?? 0) >= STRICT.minRiskReward, v1.estimates.plan?.rr);
const probs = v1.estimates.comparables!;
check('probabilities sum to 100%', Math.abs(probs.bullProb + probs.baseProb + probs.bearProb - 1) < 1e-9);
check('every check cites a source', v1.checks.every((c) => c.source.length > 3));

// 3. Critical failure → AVOID even with good comparables.
const v2 = verifyToken({ ...t, mintAuthorityDisabled: false }, goodSamples(30, t), now);
check('active mint authority → AVOID', v2.status === 'AVOID', v2.status);
const v3 = verifyToken({ ...t, topHoldersPct: 65 }, goodSamples(30, t), now);
check('65% top-holder concentration → AVOID', v3.status === 'AVOID', v3.status);
const v4 = verifyToken({ ...t, creatorSoldPct: 70 }, goodSamples(30, t), now);
check('creator dumped 70% → AVOID', v4.status === 'AVOID', v4.status);

// 4. Non-critical failure → WATCH.
const v5 = verifyToken({ ...t, priceChange5m: -3 }, goodSamples(30, t), now);
check('negative momentum → WATCH', v5.status === 'WATCH', v5.status);
const v6 = verifyToken({ ...t, liquidity: 5_000 }, goodSamples(30, t), now);
check('thin liquidity → WATCH', v6.status === 'WATCH', v6.status);

// 5. Stale / missing data → INSUFFICIENT DATA.
const v7 = verifyToken({ ...t, marketUpdatedAt: now - 10 * MIN }, goodSamples(30, t), now);
check('stale market data → INSUFFICIENT DATA', v7.status === 'INSUFFICIENT DATA', v7.status);
const v8 = verifyToken({ ...t, organicScore: null }, goodSamples(30, t), now);
check('missing organic score → INSUFFICIENT DATA', v8.status === 'INSUFFICIENT DATA', v8.status);

// 5b. A single measured manipulation signal is decisive even if others are missing.
const botty = { ...t, organicScore: 0, organicVolumeRatio: null };
const v8b = verifyToken(evaluate(botty, undefined, now), goodSamples(30, t), now);
check('measured 100% bot activity → AVOID (not unknown)', v8b.checks.find((c) => c.key === 'manipulation')?.outcome === 'fail' && v8b.status === 'AVOID', v8b.checks.find((c) => c.key === 'manipulation'));

// 6. Comparables with negative expectancy → WATCH (not TRADEABLE).
const bad = goodSamples(30, t).map((s) => ({ ...s, returnPct: -40, maxUpPct: 10 }));
const v9 = verifyToken(t, bad, now);
check('negative comparable expectancy → not TRADEABLE', v9.status !== 'TRADEABLE', v9.status);

// 7. Telegram message content.
const msg = formatVerifiedTelegram(v1, 'https://radar.example');
check('telegram ≤ 4096 chars', msg.length <= 4096, msg.length);
check('telegram separates VERIFIED FACTS and MODEL ESTIMATES', msg.includes('VERIFIED FACTS') && msg.includes('MODEL ESTIMATES'));
check('telegram includes status, plan, R/R, scores, reason', ['STATUS: TRADEABLE', 'Entry zone', 'Stop / invalidation', 'TP1', 'Risk/Reward', 'Opportunity Score', 'Risk Score', 'Decision'].every((k) => msg.includes(k)));
check('telegram ends with disclaimer', msg.trimEnd().endsWith('Meme coins can lose all value quickly.'));
const banned = /guaranteed profit|guaranteed to|\bsafe\b|certain to rise|will moon|100x/i;
check('telegram contains no hype / guarantee wording', !banned.test(msg.replace('not guarantees', '')), msg.match(banned)?.[0]);

const msgWatch = formatVerifiedTelegram(v5, 'https://radar.example');
check('non-tradeable report states its status and does not claim all checks passed', msgWatch.includes('STATUS: WATCH') && !msgWatch.includes('All '), msgWatch.slice(0, 200));
const msgAvoid = formatVerifiedTelegram(v2);
check('AVOID report keeps disclaimer and failed checks', msgAvoid.includes('STATUS: AVOID') && msgAvoid.includes('❌') && msgAvoid.trimEnd().endsWith('Meme coins can lose all value quickly.'));

// 8. Bonding-curve decoding and USD pricing (the source of live market caps).
{
  const buf = Buffer.alloc(49);
  // A freshly created pump.fun curve: 1,073,000,000 virtual tokens against 30 virtual SOL.
  buf.writeBigUInt64LE(1_073_000_000_000_000n, 8); // virtual token reserves (6 decimals)
  buf.writeBigUInt64LE(30_000_000_000n, 16); // virtual SOL reserves (lamports)
  buf.writeBigUInt64LE(793_100_000_000_000n, 24); // real token reserves
  buf.writeBigUInt64LE(0n, 32); // real SOL reserves
  buf.writeBigUInt64LE(1_000_000_000_000_000n, 40); // total supply
  buf[48] = 0; // not complete
  const state = decodeCurve(buf);
  check('curve decodes reserves and supply', state?.totalSupply === 1_000_000_000_000_000 && state?.virtualSolReserves === 30_000_000_000, state);
  const m = curveMarket(state!, 120);
  // 30 SOL of virtual reserves against the full supply ≈ 30 × SOL price.
  check('fresh curve prices the supply at ~30 SOL', Math.abs(m!.marketCapUsd - 30 * 120 * (1e9 / 1_073_000_000)) < 1, m?.marketCapUsd);
  check('untouched curve reports 0% bonding progress', m!.bondingProgress === 0, m?.bondingProgress);

  const half = Buffer.from(buf);
  half.writeBigUInt64LE(396_550_000_000_000n, 24); // half the curve tokens sold
  half.writeBigUInt64LE(15_000_000_000n, 32); // 15 SOL raised
  const mh = curveMarket(decodeCurve(half)!, 120)!;
  check('half-sold curve reports ~50% progress', Math.abs(mh.bondingProgress - 50) < 0.1, mh.bondingProgress);
  check('liquidity counts both sides of the pool', Math.abs(mh.liquidityUsd - 15 * 120 * 2) < 1, mh.liquidityUsd);

  check('garbage account is rejected', decodeCurve(Buffer.alloc(20)) === null && decodeCurve(Buffer.alloc(49)) === null);
  check('curve pricing needs a SOL price', curveMarket(state!, 0) === null);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll verification checks passed');
process.exit(failures ? 1 : 0);
