/**
 * Device pairing rendezvous. New device posts a short-lived (5 min) pairing
 * code + its public age recipient + a human name; an already-paired device
 * fetches that announcement by code and grants access (re-encrypts the vault
 * secrets to include the new pubkey, commits the device record).
 *
 * The server never sees plaintext — only the new device's *public* age key.
 * Storage is intentionally in-memory: pairing is a one-shot handshake.
 */
import { Hono, type Context } from "hono";
import { getCurrentUser } from "../auth/sessions";

interface Announcement {
  userId: string;
  code: string;
  pubkey: string;
  deviceName: string;
  deviceId: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const announcements = new Map<string, Announcement>();

// Per-user sliding-window rate limit on /vault/pair/:code lookups. Even
// though the lookup is already (userId, code)-scoped — so an attacker needs
// a valid session to guess — the 6-digit keyspace is small enough that
// unrestricted access lets a compromised session enumerate it in seconds.
const LOOKUP_WINDOW_MS = 60_000;
const LOOKUP_LIMIT = 60;
const lookupHits = new Map<string, number[]>();

function recordLookup(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - LOOKUP_WINDOW_MS;
  const arr = lookupHits.get(userId) ?? [];
  // Drop expired hits, then record this one.
  const fresh = arr.filter((t) => t > cutoff);
  if (fresh.length >= LOOKUP_LIMIT) {
    lookupHits.set(userId, fresh);
    return false;
  }
  fresh.push(now);
  lookupHits.set(userId, fresh);
  return true;
}

function purgeExpired() {
  const now = Date.now();
  for (const [code, a] of announcements) {
    if (a.expiresAt < now) announcements.delete(code);
  }
}

function keyFor(userId: string, code: string): string {
  return `${userId}:${code}`;
}

async function requireUser(c: Context) {
  const user = await getCurrentUser(c);
  if (!user) {
    c.status(401);
    return null;
  }
  return user;
}

export const pairRoutes = new Hono();

/**
 * POST /vault/pair/announce
 * body: { code, pubkey, deviceName, deviceId }
 * Stores an offer keyed on (userId, code). A different device authenticated
 * to the SAME GitHub account can later retrieve it.
 */
pairRoutes.post("/announce", async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => null)) as {
    code?: string;
    pubkey?: string;
    deviceName?: string;
    deviceId?: string;
  } | null;
  if (!body?.code || !body?.pubkey || !body?.deviceName || !body?.deviceId) {
    return c.json({ error: "missing_fields" }, 400);
  }
  if (!/^\d{6}$/.test(body.code)) {
    return c.json({ error: "invalid_code" }, 400);
  }
  if (!/^age1[0-9a-z]{20,}$/i.test(body.pubkey)) {
    return c.json({ error: "invalid_pubkey" }, 400);
  }
  purgeExpired();
  const expiresAt = Date.now() + TTL_MS;
  announcements.set(keyFor(user.id, body.code), {
    userId: user.id,
    code: body.code,
    pubkey: body.pubkey,
    deviceName: body.deviceName.slice(0, 64),
    deviceId: body.deviceId.slice(0, 32),
    expiresAt,
  });
  return c.json({ ok: true, expiresAt: new Date(expiresAt).toISOString() });
});

/**
 * GET /vault/pair/:code
 * Returns the announcement if it exists and is scoped to the same user.
 */
pairRoutes.get("/:code", async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!recordLookup(user.id)) {
    return c.json({ error: "rate_limited" }, 429);
  }
  const code = c.req.param("code");
  if (!/^\d{6}$/.test(code)) {
    return c.json({ error: "invalid_code" }, 400);
  }
  purgeExpired();
  const announcement = announcements.get(keyFor(user.id, code));
  if (!announcement) return c.json({ error: "not_found" }, 404);
  return c.json({
    code: announcement.code,
    pubkey: announcement.pubkey,
    deviceName: announcement.deviceName,
    deviceId: announcement.deviceId,
    expiresAt: new Date(announcement.expiresAt).toISOString(),
  });
});

/**
 * DELETE /vault/pair/:code
 * Used by either side to clear the announcement once handshake completes
 * (or is abandoned).
 */
pairRoutes.delete("/:code", async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const code = c.req.param("code");
  announcements.delete(keyFor(user.id, code));
  return c.json({ ok: true });
});
