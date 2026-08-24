/**
 * Storage quota domain rules for NoteKit-hosted Forgejo vaults. Pure: no DB,
 * no Forgejo, no I/O. The use case supplies already-fetched inputs (stored
 * quota, used bytes, timestamps, and whether the user is Plus) and this module
 * computes the resulting quota numbers.
 */

const FREE_QUOTA_BYTES = 100 * 1024 * 1024; // 100 MB
const PLUS_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB
export const USAGE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface QuotaState {
  quotaBytes: number;
  usedBytes: number;
  remainingBytes: number;
  overLimit: boolean;
  staleAfterMs: number;
}

/**
 * Resolve the effective quota. The stored value is the floor — Plus subscribers
 * get bumped so an upgrade takes effect without a stored-column update.
 */
export function effectiveQuotaBytes(storedQuotaBytes: number | null, isPlusUser: boolean): number {
  const stored = storedQuotaBytes ?? FREE_QUOTA_BYTES;
  if (isPlusUser) return Math.max(stored, PLUS_QUOTA_BYTES);
  return stored;
}

/**
 * Build the quota state from resolved inputs. `usageUpdatedAt` of null means the
 * usage cache has never been written, so it is treated as infinitely stale.
 */
export function computeQuotaState(input: {
  quotaBytes: number;
  usedBytes: number;
  usageUpdatedAt: number | null;
  now: number;
}): QuotaState {
  const { quotaBytes, usedBytes, usageUpdatedAt, now } = input;
  const staleAfterMs = usageUpdatedAt !== null ? now - usageUpdatedAt : Number.POSITIVE_INFINITY;
  return {
    quotaBytes,
    usedBytes,
    remainingBytes: Math.max(0, quotaBytes - usedBytes),
    overLimit: usedBytes >= quotaBytes,
    staleAfterMs,
  };
}
