import { ipfsUrl } from '../../../shared/ipfs.ts';
import { config } from '../../env.ts';
import { HttpError, registerSource, requestJson } from '../httpClient.ts';
import type { ChainProvider, LargestAccount, MintAccountInfo } from './types.ts';

const IPFS = 'ipfs';
registerSource(IPFS, 250);
config.rpcUrls.forEach((_, i) => registerSource(`rpc${i}`, i === 0 && config.dedicatedRpc ? 60 : 350));

interface RpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

let rpcId = 0;
/** Endpoint index to try first; advanced when an endpoint fails so healthy ones take the load. */
let preferred = 0;

/**
 * JSON-RPC with ordered failover across SOLANA_RPC_URL → SOLANA_RPC_FALLBACK_URLS → public RPC.
 * Rate-limit (429) and network errors move on to the next endpoint.
 */
async function rpc<T>(method: string, params: unknown[], ttl = 15_000): Promise<T> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params });
  let lastErr: unknown;
  for (let n = 0; n < config.rpcUrls.length; n++) {
    const i = (preferred + n) % config.rpcUrls.length;
    try {
      const res = await requestJson<RpcResponse<T>>(config.rpcUrls[i], {
        source: `rpc${i}`,
        ttl,
        cacheKey: `rpc ${method} ${JSON.stringify(params)}`,
        init: { method: 'POST', headers: { 'content-type': 'application/json' }, body },
        retries: 0,
        timeoutMs: 8000,
      });
      if (res.error) {
        if (res.error.code === 429 || res.error.code === -32005) throw new HttpError(429, 'RPC rate limited');
        throw new Error(res.error.message);
      }
      preferred = i;
      return res.result as T;
    } catch (err) {
      lastErr = err;
      const transient = err instanceof HttpError ? err.status === 429 || err.status >= 500 : true;
      if (!transient) break;
    }
  }
  if (lastErr instanceof HttpError && lastErr.status === 429) {
    throw new Error(config.dedicatedRpc ? 'All RPC endpoints are rate limited' : 'Public RPC rate limited — configure SOLANA_RPC_URL for holder data');
  }
  throw lastErr instanceof Error ? lastErr : new Error('RPC unavailable');
}

interface ParsedMint {
  value: {
    owner: string;
    data: {
      parsed?: {
        info: {
          decimals: number;
          supply: string;
          mintAuthority: string | null;
          freezeAuthority: string | null;
          extensions?: { extension: string; state?: Record<string, unknown> }[];
        };
      };
    };
  } | null;
}

export const solanaRpc: ChainProvider = {
  name: 'Solana RPC',

  async getMintInfo(mint) {
    const res = await rpc<ParsedMint>('getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }], 60_000);
    const info = res?.value?.data.parsed?.info;
    if (!res?.value || !info) return null;
    const ext = info.extensions ?? [];
    const metaExt = ext.find((e) => e.extension === 'tokenMetadata')?.state;
    const out: MintAccountInfo = {
      decimals: info.decimals,
      supply: Number(info.supply) / 10 ** info.decimals,
      mintAuthority: info.mintAuthority,
      freezeAuthority: info.freezeAuthority,
      tokenProgram: res.value.owner,
      extensions: ext.map((e) => e.extension),
      metadata: metaExt
        ? {
            name: metaExt.name as string | undefined,
            symbol: metaExt.symbol as string | undefined,
            uri: metaExt.uri as string | undefined,
            updateAuthority: (metaExt.updateAuthority as string | null | undefined) ?? null,
          }
        : null,
    };
    return out;
  },

  async getLargestAccounts(mint) {
    const res = await rpc<{ value: { address: string; amount: string; decimals: number; uiAmount: number | null }[] }>(
      'getTokenLargestAccounts',
      [mint, { commitment: 'confirmed' }],
      30_000,
    );
    const accounts = res.value.slice(0, 20);
    if (accounts.length === 0) return [];
    const owners = await rpc<{ value: ({ data: { parsed?: { info?: { owner?: string } } } } | null)[] }>(
      'getMultipleAccounts',
      [accounts.map((a) => a.address), { encoding: 'jsonParsed' }],
      30_000,
    );
    return accounts.map<LargestAccount>((a, i) => ({
      tokenAccount: a.address,
      owner: owners.value[i]?.data.parsed?.info?.owner ?? null,
      amount: a.uiAmount ?? Number(a.amount) / 10 ** a.decimals,
    }));
  },

  async getBalanceSol(wallet) {
    const res = await rpc<{ value: number }>('getBalance', [wallet], 30_000);
    return res.value / 1e9;
  },

  async getSignatures(wallet, limit) {
    return rpc<{ signature: string; blockTime: number | null; err: unknown }[]>('getSignaturesForAddress', [wallet, { limit }], 30_000);
  },

  async getMetadataJson(uri) {
    const url = ipfsUrl(uri, config.ipfsGateway);
    if (!url || !/^https:\/\//.test(url)) return null;
    return requestJson<Record<string, unknown>>(url, { source: IPFS, ttl: 3_600_000, timeoutMs: 8000, retries: 1 });
  },
};

export function rpcHealthSources(): string[] {
  return config.rpcUrls.map((_, i) => `rpc${i}`);
}
