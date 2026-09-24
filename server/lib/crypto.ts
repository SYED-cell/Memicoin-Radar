import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { config } from '../env.ts';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** scrypt password hash: `scrypt$N$r$p$salt$hash` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, , , , saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64url'));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Dummy hash used to keep login timing constant for unknown emails. */
export const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86);

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/* ─────────── JWT (HS256) ─────────── */

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function signJwt(payload: Record<string, unknown>, ttlSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSec };
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(body)}`;
  const sig = createHmac('sha256', config.jwtSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyJwt<T extends Record<string, unknown>>(token: string): (T & { exp: number; iat: number }) | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = createHmac('sha256', config.jwtSecret).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { alg?: string };
    if (header.alg !== 'HS256') return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as T & { exp: number; iat: number };
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ─────────── AES-256-GCM field encryption ─────────── */

const encKey = createHash('sha256').update(config.encryptionKey).digest();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

export function decrypt(enc: string): string {
  const [ver, iv, tag, data] = enc.split('.');
  if (ver !== 'v1') throw new Error('Unknown ciphertext version');
  const decipher = createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
