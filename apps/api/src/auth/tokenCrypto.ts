/**
 * At-rest encryption for OAuth access/refresh tokens.
 *
 * Threat model: someone with read access to the SQLite file (a leaked backup,
 * a stolen VPS snapshot, a curious sysadmin) must not be able to recover the
 * user's GitHub token. The DEK is derived from SESSION_SECRET, which lives in
 * env — so the file alone is not enough; an attacker also needs the env.
 *
 * Format: "v1:" + base64(nonce(12) || ciphertext || authTag(16)). Versioned
 * prefix lets us rotate later; values without the prefix are treated as
 * legacy plaintext and returned as-is (and re-encrypted on next write).
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../env";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const NONCE_LEN = 12;
const TAG_LEN = 16;
const KEY_INFO = "notekit:oauth-token:v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  // SESSION_SECRET is the single server-held secret; HKDF gives us a
  // domain-separated key so reuse of SESSION_SECRET elsewhere stays safe.
  const ikm = Buffer.from(env.sessionSecret, "utf8");
  const derived = hkdfSync("sha256", ikm, Buffer.alloc(0), Buffer.from(KEY_INFO), 32);
  cachedKey = Buffer.from(derived);
  return cachedKey;
}

export function encryptToken(plain: string): string {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGO, key(), nonce);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([nonce, enc, tag]).toString("base64");
  return `${VERSION}:${payload}`;
}

/**
 * Decrypts a token. Legacy plaintext (no version prefix) is returned as-is so
 * existing rows keep working. Tampered or corrupted v1 values throw.
 */
export function decryptToken(stored: string): string {
  if (!stored.startsWith(`${VERSION}:`)) return stored;
  const payload = Buffer.from(stored.slice(VERSION.length + 1), "base64");
  if (payload.length < NONCE_LEN + TAG_LEN) {
    throw new Error("decryptToken: payload too short");
  }
  const nonce = payload.subarray(0, NONCE_LEN);
  const tag = payload.subarray(payload.length - TAG_LEN);
  const enc = payload.subarray(NONCE_LEN, payload.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key(), nonce);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
