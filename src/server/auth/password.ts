import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Password hashing with scrypt (node:crypto, no dependency).
//
// Stored format:  scrypt$<N>$<r>$<p>$<salt base64url>$<key base64url>
// The parameters travel with each hash, so they can be raised later:
// needsRehash() tells the login flow to re-hash with the current ones.
//
// Current parameters follow the OWASP Password Storage Cheat Sheet minimum for
// scrypt (N = 2^17, r = 8, p = 1): about 128 MiB and a few hundred ms per hash.

export const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
/** Node's default maxmem (32 MiB) is below what N = 2^17, r = 8 needs (128 MiB). */
const MAXMEM = 256 * 1024 * 1024;

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function derive(password: string, salt: Buffer, keyLength: number, params: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // NFKC: the same password typed on different keyboards/OSes hashes the same.
    scrypt(password.normalize("NFKC"), salt, keyLength, { ...params, maxmem: MAXMEM }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  // Sane bounds: a corrupted row must not make us allocate gigabytes.
  const powerOfTwo = Number.isInteger(N) && N >= 2 ** 14 && N <= 2 ** 20 && (N & (N - 1)) === 0;
  if (!powerOfTwo || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) return null;
  const salt = Buffer.from(parts[4], "base64url");
  const key = Buffer.from(parts[5], "base64url");
  if (salt.length < 16 || key.length < 32) return null;
  return { N, r, p, salt, key };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, KEY_BYTES, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Constant-time comparison. Malformed hashes simply fail. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const key = await derive(password, parsed.salt, parsed.key.length, { N: parsed.N, r: parsed.r, p: parsed.p });
  return timingSafeEqual(key, parsed.key);
}

/** true when the hash was made with other parameters than SCRYPT_PARAMS. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  if (!parsed) return true;
  return parsed.N !== SCRYPT_PARAMS.N || parsed.r !== SCRYPT_PARAMS.r || parsed.p !== SCRYPT_PARAMS.p;
}

/** Random password for `--generate`: 24 base64url characters (144 bits). */
export function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}
