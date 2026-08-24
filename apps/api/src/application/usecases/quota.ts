import { isPlus } from "../../domain/entitlement";
import {
  computeQuotaState,
  effectiveQuotaBytes,
  USAGE_REFRESH_INTERVAL_MS,
  type QuotaState,
} from "../../domain/quota";
import type { QuotaRepository } from "../ports/out/QuotaRepository";

/**
 * Storage quota enforcement for NoteKit-hosted Forgejo vaults.
 *
 * GitHub/GitLab (BYO) vaults don't pass through here — those repos are on the
 * user's own storage. For NoteKit-hosted vaults we pay for the disk, so writes
 * are gated by `quota_bytes`. Reads, deletes, and metadata calls are never
 * blocked. `used_bytes` is a periodically-refreshed cache, not a real-time
 * number; a burst of writes can briefly exceed the limit, which is acceptable.
 *
 * Behaviour is identical to the previous vault/quota implementation; it now
 * reads/writes through the injected {@link QuotaRepository} instead of Drizzle.
 */
export function createQuota(repo: QuotaRepository) {
  async function getEffectiveQuotaBytes(userId: string): Promise<number> {
    const [account, user] = await Promise.all([
      repo.getForgejoAccount(userId),
      repo.getUserForPlus(userId),
    ]);
    return effectiveQuotaBytes(account?.quotaBytes ?? null, user ? isPlus(user) : false);
  }

  async function getQuotaState(userId: string): Promise<QuotaState | null> {
    const row = await repo.getForgejoAccount(userId);
    if (!row) return null;
    const quotaBytes = await getEffectiveQuotaBytes(userId);
    return computeQuotaState({
      quotaBytes,
      usedBytes: row.usedBytes,
      usageUpdatedAt: row.usageUpdatedAt,
      now: Date.now(),
    });
  }

  /**
   * Guard for write endpoints on NoteKit-hosted vaults. Returns the quota state
   * for surfacing in a 413/507 response; `null` means the user has no Forgejo
   * account at all (caller should reject earlier). BYO providers bypass this.
   */
  async function checkWriteAllowed(
    userId: string,
    provider: "github" | "gitlab" | "notekit",
  ): Promise<{ ok: true } | { ok: false; reason: "quota_exceeded"; state: QuotaState }> {
    if (provider !== "notekit") return { ok: true };
    const state = await getQuotaState(userId);
    if (!state) return { ok: true };
    if (state.overLimit) return { ok: false, reason: "quota_exceeded", state };
    return { ok: true };
  }

  /**
   * Refresh `used_bytes` from Forgejo if the cache is older than the refresh
   * interval. Safe to call inline before a write — bounded by one HTTP round
   * trip to Forgejo's repo list. Returns the freshly-computed total in bytes, or
   * null when the user has no Forgejo account or refresh failed. Forgejo's repo
   * `size` field is in KiB, matching GitHub's convention.
   */
  async function refreshUsedBytesIfStale(userId: string): Promise<number | null> {
    const row = await repo.getForgejoAccount(userId);
    if (!row) return null;
    const ageMs =
      row.usageUpdatedAt !== null
        ? Date.now() - row.usageUpdatedAt
        : Number.POSITIVE_INFINITY;
    if (ageMs < USAGE_REFRESH_INTERVAL_MS) return row.usedBytes;

    // Token fetch stays OUTSIDE the try so a store error fails fast (matching the
    // original); only a Forgejo transport failure falls back to cached bytes.
    const token = await repo.getForgejoToken(userId);
    if (!token) return null;
    try {
      const sizesKib = await repo.listRepoSizesKib(token);
      const totalKib = sizesKib.reduce((sum, size) => sum + (size ?? 0), 0);
      const totalBytes = totalKib * 1024;
      await repo.setUsage(userId, totalBytes, Date.now());
      return totalBytes;
    } catch {
      return row.usedBytes;
    }
  }

  return { getEffectiveQuotaBytes, getQuotaState, checkWriteAllowed, refreshUsedBytesIfStale };
}
