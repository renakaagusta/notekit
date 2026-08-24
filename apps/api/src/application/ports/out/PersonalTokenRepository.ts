import type { PersonalAccessTokenScope } from "../../../domain/auth-tokens";

/**
 * Outbound port for personal-access-token lookups. Auth depends on this
 * instead of Drizzle so the PAT query lives in a driven adapter and the auth
 * logic can be exercised with an in-memory fake.
 */
export interface PersonalTokenRepository {
  /**
   * The non-revoked PAT matching the given sha256 hash, or null when no such
   * active token exists. Revoked tokens (revoked_at IS NOT NULL) never match.
   */
  findByHash(
    hash: string,
  ): Promise<{ id: string; userId: string; scope: PersonalAccessTokenScope } | null>;

  /**
   * Best-effort bump of last_used_at for the given PAT id. Failures are
   * swallowed by the caller because they must not block otherwise-valid auth.
   */
  touchLastUsed(id: string, usedAtMs: number): Promise<void>;
}
