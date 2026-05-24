/**
 * Storage quota enforcement for NoteKit-hosted Forgejo vaults.
 *
 * GitHub vaults don't pass through here — GitHub bills users directly.
 * For NoteKit-hosted vaults we pay for the disk, so writes are gated by
 * `quota_bytes`. Reads, deletes, and metadata calls are never blocked.
 *
 * `used_bytes` is a periodically-refreshed cache, not a real-time number;
 * a burst of writes can briefly exceed the limit, which is acceptable.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { isPlus } from "../iap/entitlement";
import * as fj from "./forgejo";
import { getForgejoToken } from "./forgejoAccounts";

const FREE_QUOTA_BYTES = 100 * 1024 * 1024; // 100 MB
const PLUS_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB

export interface QuotaState {
  quotaBytes: number;
  usedBytes: number;
  remainingBytes: number;
  overLimit: boolean;
  staleAfterMs: number;
}

/**
 * Resolve the effective quota for a user. The DB column is the floor —
 * Plus subscribers get bumped at read time so an upgrade takes effect
 * without a column update.
 */
export async function getEffectiveQuotaBytes(userId: string): Promise<number> {
  const [account, user] = await Promise.all([
    db.query.forgejoAccounts.findFirst({
      where: eq(schema.forgejoAccounts.userId, userId),
    }),
    db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    }),
  ]);
  const stored = account?.quotaBytes ?? FREE_QUOTA_BYTES;
  if (user && isPlus(user)) {
    return Math.max(stored, PLUS_QUOTA_BYTES);
  }
  return stored;
}

export async function getQuotaState(userId: string): Promise<QuotaState | null> {
  const row = await db.query.forgejoAccounts.findFirst({
    where: eq(schema.forgejoAccounts.userId, userId),
  });
  if (!row) return null;
  const quotaBytes = await getEffectiveQuotaBytes(userId);
  const usedBytes = row.usedBytes;
  const usageAge =
    row.usageUpdatedAt instanceof Date
      ? Date.now() - row.usageUpdatedAt.getTime()
      : Number.POSITIVE_INFINITY;
  return {
    quotaBytes,
    usedBytes,
    remainingBytes: Math.max(0, quotaBytes - usedBytes),
    overLimit: usedBytes >= quotaBytes,
    staleAfterMs: usageAge,
  };
}

/**
 * Guard for write endpoints on NoteKit-hosted vaults. Returns the quota
 * state for surfacing in a 413/507 response; `null` means the user has
 * no Forgejo account at all (caller should reject earlier).
 *
 * BYO providers (GitHub, GitLab) bypass this entirely — those repos are on
 * the user's own storage, so the function is a no-op for them.
 */
export async function checkWriteAllowed(
  userId: string,
  provider: "github" | "gitlab" | "notekit",
): Promise<{ ok: true } | { ok: false; reason: "quota_exceeded"; state: QuotaState }> {
  if (provider !== "notekit") return { ok: true };
  const state = await getQuotaState(userId);
  if (!state) return { ok: true };
  if (state.overLimit) return { ok: false, reason: "quota_exceeded", state };
  return { ok: true };
}

const USAGE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Refresh `used_bytes` from Forgejo if the cache is older than the refresh
 * interval. Safe to call inline before a write — bounded by one HTTP round
 * trip to Forgejo's repo list. Returns the freshly-computed total in bytes,
 * or null when the user has no Forgejo account or refresh failed.
 *
 * Forgejo's repo `size` field is in KiB, matching GitHub's convention.
 */
export async function refreshUsedBytesIfStale(userId: string): Promise<number | null> {
  const row = await db.query.forgejoAccounts.findFirst({
    where: eq(schema.forgejoAccounts.userId, userId),
  });
  if (!row) return null;
  const ageMs =
    row.usageUpdatedAt instanceof Date
      ? Date.now() - row.usageUpdatedAt.getTime()
      : Number.POSITIVE_INFINITY;
  if (ageMs < USAGE_REFRESH_INTERVAL_MS) return row.usedBytes;

  const token = await getForgejoToken(userId);
  if (!token) return null;
  try {
    const repos = await fj.listRepos(token);
    const totalKib = repos.reduce((sum, r) => sum + (r.size ?? 0), 0);
    const totalBytes = totalKib * 1024;
    await db
      .update(schema.forgejoAccounts)
      .set({ usedBytes: totalBytes, usageUpdatedAt: new Date() })
      .where(eq(schema.forgejoAccounts.userId, userId));
    return totalBytes;
  } catch (err) {
    console.error("[quota] failed to refresh used_bytes for", userId, err);
    return row.usedBytes;
  }
}
