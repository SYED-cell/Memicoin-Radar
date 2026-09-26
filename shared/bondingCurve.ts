/**
 * Pump.fun bonding-curve maths.
 *
 * Every pump.fun token holds its live reserves in a bonding-curve account. Reading it gives the
 * real current price, market cap and pool liquidity straight from the chain — no indexer needed,
 * which matters because brand-new launches are not covered by market-data providers for a while.
 */

/** Owner of every genuine pump.fun bonding-curve account. */
export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

/** Token supply and decimals are fixed by the pump.fun program. */
export const PUMP_DECIMALS = 6;
export const LAMPORTS_PER_SOL = 1e9;
/** Tokens held by the curve at launch; the curve completes when they are all sold. */
export const CURVE_INITIAL_TOKENS = 793_100_000;

export interface CurveState {
  virtualTokenReserves: number;
  virtualSolReserves: number;
  realTokenReserves: number;
  realSolReserves: number;
  totalSupply: number;
  complete: boolean;
}

export interface CurveMarket {
  /** USD price of one token. */
  price: number;
  marketCapUsd: number;
  /** SOL actually held by the curve — what a holder could sell into. */
  liquidityUsd: number;
  /** 0–100; 100 means the curve filled and the token migrates to a pool. */
  bondingProgress: number;
  complete: boolean;
}

/**
 * Decodes a bonding-curve account (Anchor layout, little-endian):
 * 8-byte discriminator, then 5 × u64, then a 1-byte `complete` flag.
 */
export function decodeCurve(data: Uint8Array): CurveState | null {
  if (data.length < 49) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u64 = (offset: number) => Number(view.getBigUint64(offset, true));
  const state: CurveState = {
    virtualTokenReserves: u64(8),
    virtualSolReserves: u64(16),
    realTokenReserves: u64(24),
    realSolReserves: u64(32),
    totalSupply: u64(40),
    complete: data[48] === 1,
  };
  // A curve with no virtual reserves cannot price anything.
  if (state.virtualTokenReserves <= 0 || state.virtualSolReserves <= 0) return null;
  return state;
}

/** Converts raw curve reserves into USD figures. Returns null when the SOL price is unknown. */
export function curveMarket(state: CurveState, solPriceUsd: number): CurveMarket | null {
  if (!solPriceUsd) return null;
  const sol = state.virtualSolReserves / LAMPORTS_PER_SOL;
  const tokens = state.virtualTokenReserves / 10 ** PUMP_DECIMALS;
  const priceSol = sol / tokens;
  const supply = state.totalSupply / 10 ** PUMP_DECIMALS;
  const realSol = state.realSolReserves / LAMPORTS_PER_SOL;
  const remaining = state.realTokenReserves / 10 ** PUMP_DECIMALS;
  return {
    price: priceSol * solPriceUsd,
    marketCapUsd: priceSol * supply * solPriceUsd,
    // Both sides of the pool: the SOL in the curve plus the tokens it would buy back.
    liquidityUsd: realSol * solPriceUsd * 2,
    bondingProgress: state.complete ? 100 : Math.max(0, Math.min(100, (1 - remaining / CURVE_INITIAL_TOKENS) * 100)),
    complete: state.complete,
  };
}
