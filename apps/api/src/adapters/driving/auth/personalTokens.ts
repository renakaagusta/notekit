/**
 * Personal access tokens — long-lived bearer credentials for CLI and MCP
 * clients. The plaintext is shown to the user exactly once at creation and
 * never stored. Lookups go by sha256 hash.
 *
 * Sister of `agentAuth.ts`, but distinct: agent tokens are scoped to an
 * agent persona in a vault, PATs are scoped to a human user. They live in
 * separate tables and have separate plaintext prefixes so a misrouted token
 * is rejected loudly instead of silently authorising the wrong principal.
 *
 * The crypto/id primitives and principal shapes live in `domain/auth-tokens`;
 * the DB lookup is behind {@link PersonalTokenRepository}, bound from the
 * composition root before first use.
 */
import type { Context } from "hono";
import type { PersonalTokenRepository } from "../../../application/ports/out/PersonalTokenRepository";
import { hashToken, parsePersonalAccessToken } from "../../../domain/auth-tokens";
import type { PatPrincipal } from "../../../domain/auth-tokens";
import { logger } from "../../../lib/logger";

export {
  generatePersonalAccessToken,
  hashToken,
  newPatId,
} from "../../../domain/auth-tokens";
export type { PatPrincipal, PersonalAccessTokenScope } from "../../../domain/auth-tokens";

let repo: PersonalTokenRepository;

/**
 * Bind the personal-token persistence port. Called once from the composition
 * root before any route handler runs; importers pull `getPatPrincipal` from
 * that root so the wiring is guaranteed to have happened first.
 */
export function configurePersonalTokens(r: PersonalTokenRepository): void {
  repo = r;
}

/**
 * Pull a `Bearer nkp_...` token out of the request and resolve it to a user.
 * Returns null when the header is absent, malformed, unknown, or revoked.
 * Side effect: bumps last_used_at on success (best-effort; failures are
 * swallowed because they would block otherwise-valid auth).
 */
export async function getPatPrincipal(c: Context): Promise<PatPrincipal | null> {
  const header = c.req.header("Authorization") ?? c.req.header("authorization");
  const plain = parsePersonalAccessToken(header);
  if (!plain) return null;

  const hash = hashToken(plain);
  const row = await repo.findByHash(hash);
  if (!row) return null;

  // Best-effort last-used update. The leading `void` is the explicit
  // "intentional fire-and-forget" marker — without it this reads like a
  // missing await and trips up both linters and reviewers.
  void repo
    .touchLastUsed(row.id, Date.now())
    .catch((err) => logger.warn("[auth] personal token persist failed", err));

  return { userId: row.userId, patId: row.id, scope: row.scope };
}
