/**
 * Checks the trading rules. Usage: node scripts/strategy-test.ts
 * No network, no database — just the arithmetic that decides size, refusal and exits.
 */
import { buildExits, DEFAULT_STRATEGY, disqualify, evaluateStrategy, inPriceTerms, nextAction, sizePosition } from '../shared/strategy.ts';
import type { Token, TradePlan } from '../shared/types.ts';

let failures = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
};

const plan = (over: Partial<TradePlan> = {}): TradePlan => ({
  entryLow: 90,
  entryHigh: 100,
  entries: [
    { label: 'Entry 1 — at market', price: 100, allocationPct: 55, reason: '' },
    { label: 'Entry 2 — on a pullback', price: 92, allocationPct: 45, reason: '' },
  ],
  stop: 80,
  stopPct: 20,
  tp1: 120,
  tp2: 150,
  tp3: 200,
  rr: 2.5,
  invalidation: ['Liquidity is pulled'],
  ...over,
});

const token = (over: Partial<Token> = {}): Token =>
  ({ symbol: 'TEST', score: 72, riskScore: 40, signal: 'WATCH', liquidity: 60_000, marketCap: 400_000, price: 100, ...over }) as Token;

/* ── Sizing ────────────────────────────────────────────────────────────────── */
// The stop decides the size. $10,000 account, 2% risk = $200; a 20% stop means $200 buys $1,000.
{
  const s = sizePosition(10_000, 100, 80, 1_000_000);
  check('risk and stop distance decide the size', s.positionUsd === 1000, s);
  check('the dollars at risk are the configured slice of the account', s.riskUsd === 200, s);
  check('size is reported as a share of the account', s.positionPctOfAccount === 10, s);
  check('and it says risk decided it', s.cappedBy === 'risk', s);
}

// A tight stop would buy an absurd position, so the account cap takes over.
{
  const s = sizePosition(10_000, 100, 99, 1_000_000); // 1% stop → $20,000 by risk alone
  check('a tight stop is capped by the account, not multiplied', s.positionUsd === 2000, s);
  check('the account cap is named', s.cappedBy === 'account', s);
  check('the cap is the configured share of the account', s.positionPctOfAccount === DEFAULT_STRATEGY.maxPositionPctOfAccount, s);
}

// A thin pool caps it below both: you have to be able to sell it again.
{
  const s = sizePosition(10_000, 100, 80, 20_000); // 1% of 20k = $200
  check('a thin pool caps the position below the risk size', s.positionUsd === 200, s);
  check('the liquidity cap is named', s.cappedBy === 'liquidity', s);
}

// Degenerate inputs must not produce a position.
check('a stop at the entry risks nothing and buys nothing', sizePosition(10_000, 100, 100, 1_000_000).positionUsd === 0);
check('a stop above the entry buys nothing', sizePosition(10_000, 100, 120, 1_000_000).positionUsd === 0);
check('an empty account buys nothing', sizePosition(0, 100, 80, 1_000_000).positionUsd === 0);
check('a dry pool buys nothing', sizePosition(10_000, 100, 80, 0).positionUsd === 0);

/* ── Refusals ──────────────────────────────────────────────────────────────── */
check('a clean setup has nothing against it', disqualify(token(), plan()).length === 0, disqualify(token(), plan()));
check('AVOID is refused', disqualify(token({ signal: 'AVOID' }), plan()).some((r) => /AVOID/.test(r)));
check('an unrated coin is refused', disqualify(token({ signal: 'INSUFFICIENT DATA' }), plan()).some((r) => /not enough data/i.test(r)));
check('a low score is refused', disqualify(token({ score: 40 }), plan()).some((r) => /Opportunity/.test(r)));
check('high risk is refused', disqualify(token({ riskScore: 85 }), plan()).some((r) => /Risk/.test(r)));
check('a thin pool is refused outright', disqualify(token({ liquidity: 500 }), plan()).some((r) => /Liquidity 500/.test(r)));
check('liquidity that is a sliver of market cap is refused', disqualify(token({ liquidity: 6_000, marketCap: 10_000_000 }), plan()).some((r) => /% of market cap/.test(r)));
check('poor reward-for-risk is refused', disqualify(token(), plan({ rr: 1.1 })).some((r) => /Reward-for-risk/.test(r)));
check('a stop above the entry is refused', disqualify(token(), plan({ stop: 150 })).some((r) => /Stop is not below/.test(r)));
check('every reason is collected, not just the first', disqualify(token({ signal: 'AVOID', score: 10, riskScore: 99 }), plan()).length >= 3);

/* ── Exits ─────────────────────────────────────────────────────────────────── */
{
  const exits = buildExits(plan());
  check('the whole position is planned out', exits.reduce((s, e) => s + e.sharePct, 0) === 100, exits);
  check('targets are in ascending order', exits[0].price < exits[1].price && exits[1].price < exits[2].price);
  check('most of it comes off at the first target', exits[0].sharePct >= 40, exits[0]);
  check('the stop goes to break-even after the first target', exits[0].thenStop === 'break-even');
  check('no rung sells a negative or zero share', exits.every((e) => e.sharePct > 0));
}

/* ── The whole decision ────────────────────────────────────────────────────── */
{
  const v = evaluateStrategy(token(), plan(), 10_000);
  check('a clean setup is taken', v.take === true);
  if (v.take) {
    check('it carries a size', v.setup.sizing.positionUsd > 0, v.setup.sizing);
    check('it carries the exit ladder', v.setup.exits.length === 3);
    check('it carries both entries', v.setup.entries.length === 2);
    check('entry allocations sum to 100', v.setup.entries.reduce((s, e) => s + e.allocationPct, 0) === 100);
    check('the time stop is part of the plan, not an afterthought', v.setup.timeStopMin === DEFAULT_STRATEGY.timeStopMin);
    check('doing nothing is listed as an invalidation', v.setup.invalidation.some((i) => /Nothing happens/.test(i)));
  }

  const bad = evaluateStrategy(token({ signal: 'AVOID' }), plan(), 10_000);
  check('a refused setup returns reasons and no plan', bad.take === false && bad.reasons.length > 0);

  // An account too small to take the trade must refuse it rather than open a dust position.
  const dust = evaluateStrategy(token({ liquidity: 1 }), plan(), 10_000);
  check('an untradeable pool is refused rather than sized to dust', dust.take === false);
}


/* ── Managing an open position ─────────────────────────────────────────────── */
{
  const exits = buildExits(plan());           // 120 / 150 / 200, shares 40 / 35 / 25
  const open = (over = {}) => ({ entry: 100, originalQty: 1000, remainingQty: 1000, stop: 80, filled: [], openedAt: 0, ...over });

  check('below every target it holds', nextAction(open(), exits, 110, 0, 60).type === 'hold');

  const t1 = nextAction(open(), exits, 125, 0, 60);
  check('the first target sells its share', t1.type === 'take' && t1.quantity === 400, t1);
  check('and moves the stop to break-even', t1.type === 'take' && t1.newStop === 100, t1);

  // A thin coin gaps. Crossing two rungs in one tick must take both, not one per update.
  const gap = nextAction(open(), exits, 160, 0, 60);
  check('a gap through two rungs takes both at once', gap.type === 'take' && gap.rungs.length === 2 && gap.quantity === 750, gap);

  // Once the stop has trailed up it can sit above the current price while targets are still
  // above that — the stop takes precedence and the position closes.
  const trailed = nextAction(open({ stop: 115, filled: [0], remainingQty: 600 }), exits, 114, 0, 60);
  check('a trailed stop above the price closes the position', trailed.type === 'close' && trailed.cause === 'stop', trailed);

  const be = nextAction(open({ stop: 100, filled: [0], remainingQty: 600 }), exits, 99, 0, 60);
  check('a break-even stop closes flat and says so', be.type === 'close' && /break-even/.test(be.reason), be);

  const late = nextAction(open(), exits, 110, 61 * 60_000, 60);
  check('a position that does nothing is closed on time', late.type === 'close' && late.cause === 'time-stop', late);
  check('the time stop does not fire early', nextAction(open(), exits, 110, 59 * 60_000, 60).type === 'hold');

  // The last rung must never try to sell more than is actually left.
  const last = nextAction(open({ filled: [0, 1], remainingQty: 250 }), exits, 210, 0, 60);
  check('the final rung sells only what remains', last.type === 'take' && last.quantity === 250, last);

  check('a closed position does nothing', nextAction(open({ remainingQty: 0 }), exits, 10, 0, 60).type === 'hold');
  check('a filled rung is not taken twice', nextAction(open({ filled: [0], remainingQty: 600 }), exits, 125, 0, 60).type === 'hold');
}


/* ── Units ─────────────────────────────────────────────────────────────────── */
// The levels plan is in market caps and the bot sees per-token prices. Mixing them stops every
// trade out on its first tick, silently, because the arithmetic is valid and only the units are
// wrong. This happened in a live run before the conversion existed.
{
  const mcapPlan = plan({ entryLow: 18_000, entryHigh: 20_000, stop: 16_000, tp1: 24_000, tp2: 30_000, tp3: 40_000,
    entries: [{ label: 'Entry 1', price: 20_000, allocationPct: 55, reason: '' }, { label: 'Entry 2', price: 18_400, allocationPct: 45, reason: '' }] });
  const priced = inPriceTerms(mcapPlan, 20_000, 0.00002);

  check('a market-cap plan converts to price terms', priced !== null);
  if (priced) {
    check('the stop lands below the live price, not astronomically above it', priced.stop < 0.00002, priced.stop);
    check('the entry converts to the live price', Math.abs(priced.entries[0].price - 0.00002) < 1e-12, priced.entries[0].price);
    check('targets stay above the entry', priced.tp1 > priced.entries[0].price && priced.tp3 > priced.tp1);
    check('ratios are unit-free and unchanged', priced.stopPct === mcapPlan.stopPct && priced.rr === mcapPlan.rr);
    check('the ordering survives conversion', priced.stop < priced.entryLow && priced.entryLow < priced.entryHigh);
    // The bug in one line: unconverted, the stop is "above" the price and the position dies at once.
    check('unconverted, that same stop would fire immediately', 0.00002 <= mcapPlan.stop);
    check('converted, it does not', !(0.00002 <= priced.stop));
  }

  check('a coin with no market cap cannot be converted', inPriceTerms(mcapPlan, 0, 0.00002) === null);
  check('a coin with no price cannot be converted', inPriceTerms(mcapPlan, 20_000, 0) === null);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll strategy checks passed');
process.exit(failures ? 1 : 0);
