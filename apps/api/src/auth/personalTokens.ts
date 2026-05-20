/**
 * Personal access tokens — long-lived bearer credentials for CLI and MCP
 * clients. The plaintext is shown to the user exactly once at creation and
 * never stored. Lookups go by sha256 hash.
 *
 * Sister of `agentAuth.ts`, but distinct: agent tokens are scoped to an
 * agent persona in a vault, PATs are scoped to a human user. They live in
 * separate tables and have separate plaintext prefixes so a misrouted token
 * is rejected loudly instead of silently authorising the wrong principal.
 */
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { nanoid } from "nanoid";
import { db, schema } from "../db";

const TOKEN_PREFIX = "nkp_"; // "notekit personal"

export type PersonalAccessTokenScope = "cli" | "mcp";

export function generatePersonalAccessToken(): { plain: string; hash: string } {
  const random = randomBytes(32).toString("hex");
  const plain = `${TOKEN_PREFIX}${random}`;
  const hash = hashToken(plain);
  return { plain, hash };
}

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function newPatId(): string {
  return `pat_${nanoid(16)}`;
}

export interface PatPrincipal {
  userId: string;
  patId: string;
  scope: PersonalAccessTokenScope;
}

/**
 * Pull a `Bearer nkp_...` token out of the request and resolve it to a user.
 * Returns null when the header is absent, malformed, unknown, or revoked.
 * Side effect: bumps last_used_at on success (best-effort; failures are
 * swallowed because they would block otherwise-valid auth).
 */
export async function getPatPrincipal(c: Context): Promise<PatPrincipal | null> {
  const header = c.req.header("Authorization") ?? c.req.header("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const plain = match[1]?.trim();
  if (!plain || !plain.startsWith(TOKEN_PREFIX)) return null;

  const hash = hashToken(plain);
  const row = await db.query.personalAccessTokens.findFirst({
    where: and(
      eq(schema.personalAccessTokens.tokenHash, hash),
      isNull(schema.personalAccessTokens.revokedAt),
    ),
  });
  if (!row) return null;

  // Best-effort last-used update. The leading `void` is the explicit
  // "intentional fire-and-forget" marker — without it this reads like a
  // missing await and trips up both linters and reviewers.
  void db.update(schema.personalAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.personalAccessTokens.id, row.id))
    .catch((err) => {
      console.warn("[pat] failed to bump last_used_at:", err);
    });

  return { userId: row.userId, patId: row.id, scope: row.scope };
}
