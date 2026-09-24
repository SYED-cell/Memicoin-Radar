export const DEFAULT_IPFS_GATEWAY = 'https://4everland.io/ipfs/';

/** Rewrites any IPFS URL to a CORS-friendly gateway (the public ipfs.io gateway no longer serves JSON). */
export function ipfsUrl(uri?: string, gateway = DEFAULT_IPFS_GATEWAY): string | undefined {
  if (!uri) return undefined;
  const m = uri.match(/\/ipfs\/([^/?#]+)(.*)$/) ?? uri.match(/^ipfs:\/\/([^/?#]+)(.*)$/);
  return m ? `${gateway}${m[1]}${m[2] ?? ''}` : uri;
}
