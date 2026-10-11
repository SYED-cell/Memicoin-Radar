import { config } from '../../env.ts';
import { registerSource, requestJson } from '../httpClient.ts';

/**
 * ave.ai token data, used only for tokens that cannot be read on-chain (no pump.fun curve) and
 * that the main provider does not cover. Inactive unless AVE_API_KEY is set; the key stays on the
 * server and is never sent to the browser.
 */

const SOURCE = 'ave';
registerSource(SOURCE, 120);

export const aveConfigured = () => Boolean(config.aveApiKey);

interface AveToken {
  market_cap?: string | number;
  current_price_usd?: string | number;
  tvl?: string | number;
  holders?: string | number;
}

const num = (v: string | number | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? (n as number) : 0;
};

/** Market cap, price and liquidity for a Solana mint, or null when unavailable. */
export async function aveToken(mint: string): Promise<{ mcap: number; price: number; liquidity: number; holders: number } | null> {
  if (!aveConfigured()) return null;
  try {
    const res = await requestJson<{ data?: { token?: AveToken } }>(`${config.aveApi}/tokens/${mint}-solana`, {
      source: SOURCE,
      ttl: 30_000,
      timeoutMs: 8000,
      retries: 0,
      init: { headers: { 'X-API-KEY': config.aveApiKey, accept: 'application/json' } },
    });
    const t = res.data?.token;
    if (!t) return null;
    const mcap = num(t.market_cap);
    if (mcap <= 0) return null;
    return { mcap, price: num(t.current_price_usd), liquidity: num(t.tvl), holders: num(t.holders) };
  } catch {
    return null; // a cross-check that fails just leaves the existing figures in place
  }
}
