/* Password hashing and token generation.
   scrypt comes with Node, so the whole backend stays dependency-free.
   Tokens are random, not signed: nothing here needs a secret key to verify. */

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

// ~16 MB of memory per hash, deliberately slow for whoever tries a dictionary.
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;
const SALT_LEN = 16;

/** scrypt$N$r$p$salt$hash, base64url. Never the password itself. */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(String(password), salt, KEY_LEN, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url')
  ].join('$');
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = String(stored || '').split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const key = await scrypt(String(password), salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return expected.length === key.length && timingSafeEqual(expected, key);
  } catch {
    return false;
  }
}

/** 32 bytes from the CSPRNG, url-safe: the only thing the reset mail carries. */
export function newToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/** What we store for a token. A leaked database does not hand out resets. */
export function tokenHash(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Stable key for an account, so the raw address is not used as an index. */
export function emailKey(email) {
  return createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex');
}
