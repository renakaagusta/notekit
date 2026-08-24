/**
 * Outbound port for storage-quota enforcement. The quota use case depends on
 * this instead of Drizzle/Forgejo, so the Postgres queries and Forgejo transport
 * live in a driven adapter.
 */
export interface QuotaRepository {
  /**
   * The user's Forgejo account quota fields, or null when the user has no
   * Forgejo account at all.
   */
  getForgejoAccount(userId: string): Promise<{
    quotaBytes: number | null;
    usedBytes: number;
    usageUpdatedAt: number | null;
  } | null>;

  /** The user's plus fields (to decide the Plus quota bump), or null. */
  getUserForPlus(userId: string): Promise<{
    plusUntil?: number | null;
    plusSource?: string | null;
  } | null>;

  /** Persist a freshly-computed usage total and its timestamp. */
  setUsage(userId: string, usedBytes: number, usageUpdatedAt: number): Promise<void>;

  /** The user's Forgejo access token, or null when they have none. */
  getForgejoToken(userId: string): Promise<string | null>;

  /**
   * Forgejo repo `size` values (in KiB) for the token. Throws on transport
   * failure (the use case treats a throw as "keep the cached usage").
   */
  listRepoSizesKib(token: string): Promise<number[]>;
}
