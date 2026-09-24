import type { SecurityCheck, SecurityIntel, Socials, Token } from '../../shared/types.ts';
import type { ChainProvider } from './providers/types.ts';

export interface SecurityResult {
  intel: SecurityIntel;
  /** 0..1 contract risk feeding the risk engine (authorities are scored separately). */
  risk: number;
  notes: string[];
  mintDisabled: boolean | null;
  freezeDisabled: boolean | null;
  description?: string;
  image?: string;
  socials: Socials;
}

const cache = new Map<string, { at: number; result: SecurityResult }>();
const TTL = 5 * 60_000;

const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
/** Token-2022 extensions that can restrict or tax holders. */
const DANGEROUS_EXT: Record<string, string> = {
  transferFeeConfig: 'Transfer fee (tax on every transfer)',
  permanentDelegate: 'Permanent delegate (can move anyone’s tokens)',
  transferHook: 'Transfer hook (custom code runs on transfers)',
  defaultAccountState: 'Default account state (accounts may start frozen)',
  nonTransferable: 'Non-transferable token',
  confidentialTransferMint: 'Confidential transfers (hidden amounts)',
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function socialsFromMeta(meta: Record<string, unknown> | null): Socials {
  if (!meta) return {};
  const ext = (meta.extensions as Record<string, unknown> | undefined) ?? {};
  return {
    twitter: str(meta.twitter) ?? str(ext.twitter),
    telegram: str(meta.telegram) ?? str(ext.telegram),
    website: str(meta.website) ?? str(ext.website),
  };
}

export function cachedSecurity(mint: string): SecurityResult | null {
  const hit = cache.get(mint);
  return hit && Date.now() - hit.at < TTL ? hit.result : null;
}

export async function scanSecurity(chain: ChainProvider, t: Token): Promise<SecurityResult> {
  const hit = cachedSecurity(t.id);
  if (hit) return hit;
  const errors: string[] = [];
  const mint = await chain.getMintInfo(t.mint).catch((e: unknown) => {
    errors.push(`Mint account: ${e instanceof Error ? e.message : 'unavailable'}`);
    return null;
  });
  const uri = mint?.metadata?.uri ?? t.metadataUri;
  const metaJson = uri
    ? await chain.getMetadataJson(uri).catch((e: unknown) => {
        errors.push(`Metadata: ${e instanceof Error ? e.message : 'unavailable'}`);
        return null;
      })
    : null;

  const checks: SecurityCheck[] = [];
  const add = (key: string, label: string, status: SecurityCheck['status'], detail: string) => checks.push({ key, label, status, detail });

  const mintDisabled = mint ? mint.mintAuthority === null : t.mintAuthorityDisabled;
  const freezeDisabled = mint ? mint.freezeAuthority === null : t.freezeAuthorityDisabled;
  add('mint', 'Mint authority', mintDisabled === null ? 'unknown' : mintDisabled ? 'pass' : 'fail',
    mintDisabled === null ? 'Could not verify' : mintDisabled ? 'Revoked — supply is fixed' : `Active (${mint?.mintAuthority ?? 'unknown'}) — more tokens can be minted`);
  add('freeze', 'Freeze authority', freezeDisabled === null ? 'unknown' : freezeDisabled ? 'pass' : 'fail',
    freezeDisabled === null ? 'Could not verify' : freezeDisabled ? 'Revoked — holders cannot be frozen' : `Active (${mint?.freezeAuthority ?? 'unknown'}) — wallets can be frozen`);

  const program = mint?.tokenProgram ?? t.tokenProgram ?? null;
  const dangerous = (mint?.extensions ?? []).filter((e) => DANGEROUS_EXT[e]);
  add('program', 'Token program', program ? (dangerous.length ? 'fail' : 'pass') : 'unknown',
    program ? `${program === TOKEN_2022 ? 'Token-2022' : 'SPL Token'}${dangerous.length ? ` with ${dangerous.map((d) => DANGEROUS_EXT[d]).join(', ')}` : ', no restrictive extensions'}` : 'Unknown');

  const updateAuthority = mint?.metadata ? mint.metadata.updateAuthority : null;
  add('update', 'Metadata mutability', mint?.metadata ? (updateAuthority ? 'warn' : 'pass') : 'unknown',
    mint?.metadata ? (updateAuthority ? `Mutable by ${updateAuthority}` : 'Immutable (no update authority)') : 'On-mint metadata not present (Metaplex metadata not inspected)');

  const metaSocials = socialsFromMeta(metaJson);
  const links = [t.socials.twitter ?? metaSocials.twitter, t.socials.telegram ?? metaSocials.telegram, t.socials.website ?? metaSocials.website].filter(Boolean).length;
  add('metadata', 'Token metadata', metaJson || t.image ? 'pass' : uri ? 'warn' : 'unknown',
    metaJson ? `Resolved (${links} social link${links === 1 ? '' : 's'})` : uri ? 'Metadata URI did not resolve' : 'No metadata URI');

  const lp = /pump|bonk/i.test(t.launchpad);
  add('lp', 'Liquidity', lp ? 'pass' : 'unknown', lp ? (t.graduated ? 'Migrated by launchpad to AMM pool' : 'Held by bonding-curve program') : 'LP lock status not verified');
  if (t.devHoldingPct !== null || t.creatorInitialBuyPct !== null) {
    const val = t.devHoldingPct ?? t.creatorInitialBuyPct ?? 0;
    add('creator', 'Creator allocation', val > 10 ? 'fail' : val > 5 ? 'warn' : 'pass', `${val.toFixed(2)}% of supply`);
  }
  if (t.topHoldersPct !== null) {
    add('holders', 'Top-holder concentration', t.topHoldersPct > 50 ? 'fail' : t.topHoldersPct > 30 ? 'warn' : 'pass', `${t.topHoldersPct.toFixed(1)}% held by top wallets`);
  }

  const notes: string[] = [];
  let risk = 0;
  if (dangerous.length) {
    risk = Math.max(risk, 0.9);
    notes.push(dangerous.map((d) => DANGEROUS_EXT[d]).join(', '));
  }
  if (updateAuthority) {
    risk = Math.max(risk, 0.4);
    notes.push('metadata is mutable');
  }
  if (!metaJson && uri) {
    risk = Math.max(risk, 0.3);
    notes.push('metadata unreachable');
  }

  const intel: SecurityIntel = {
    fetchedAt: Date.now(),
    checks,
    tokenProgram: program,
    decimals: mint?.decimals ?? null,
    supply: mint?.supply ?? null,
    mintAuthority: mint?.mintAuthority ?? null,
    freezeAuthority: mint?.freezeAuthority ?? null,
    updateAuthority,
    metadata: metaJson
      ? { name: str(metaJson.name), symbol: str(metaJson.symbol), description: str(metaJson.description), image: str(metaJson.image), uri, socials: metaSocials }
      : mint?.metadata
        ? { name: mint.metadata.name, symbol: mint.metadata.symbol, uri, socials: {} }
        : null,
    errors,
  };
  const result: SecurityResult = {
    intel,
    risk,
    notes,
    mintDisabled,
    freezeDisabled,
    description: str(metaJson?.description),
    image: str(metaJson?.image),
    socials: metaSocials,
  };
  if (mint) cache.set(t.id, { at: Date.now(), result });
  return result;
}
