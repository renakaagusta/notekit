/**
 * Auth token primitives — pure crypto/id helpers and the data shapes that
 * describe an authenticated principal. Two distinct credential families live
 * here:
 *
 *   - Personal access tokens (PATs): long-lived bearer credentials for CLI and
 *     MCP clients, scoped to a human user. Plaintext prefix `nkp_`.
 *   - Agent tokens: bearer credentials scoped to an agent persona in a vault.
 *     Plaintext prefix `nka_`.
 *
 * They live in separate tables and use separate plaintext prefixes so a
 * misrouted token is rejected loudly instead of silently authorising the wrong
 * principal. The plaintext of either is shown to the user exactly once at
 * creation and never stored; lookups go by sha256 hash.
 *
 * `node:crypto` is a stdlib primitive and is permitted in the domain layer.
 */
import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";

const PERSONAL_TOKEN_PREFIX = "nkp_"; // "notekit personal"
const AGENT_TOKEN_PREFIX = "nka_"; // "notekit agent"

export type PersonalAccessTokenScope = "cli" | "mcp";

/** Resolved principal for a personal access token (human user). */
export interface PatPrincipal {
  userId: string;
  patId: string;
  scope: PersonalAccessTokenScope;
}

/** Resolved principal for an agent token (agent persona in a vault). */
export interface AgentAuthContext {
  userId: string;
  agentSlug: string;
}

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function generatePersonalAccessToken(): { plain: string; hash: string } {
  const random = randomBytes(32).toString("hex");
  const plain = `${PERSONAL_TOKEN_PREFIX}${random}`;
  const hash = hashToken(plain);
  return { plain, hash };
}

export function newPatId(): string {
  return `pat_${nanoid(16)}`;
}

export function generateAgentToken(): { plain: string; hash: string } {
  const random = randomBytes(32).toString("hex");
  const plain = `${AGENT_TOKEN_PREFIX}${random}`;
  const hash = hashToken(plain);
  return { plain, hash };
}

export function newAgentTokenId(): string {
  return nanoid(16);
}

/**
 * Extract a plaintext bearer token with the expected prefix from an
 * `Authorization` header value. Returns null when the header is absent,
 * malformed, or the token does not carry the expected prefix. Mirrors the
 * original per-module parse exactly (case-insensitive `Bearer`, trimmed token,
 * prefix check).
 */
function parseBearerToken(header: string | undefined, prefix: string): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const plain = match[1]?.trim();
  if (!plain || !plain.startsWith(prefix)) return null;
  return plain;
}

export function parsePersonalAccessToken(header: string | undefined): string | null {
  return parseBearerToken(header, PERSONAL_TOKEN_PREFIX);
}

export function parseAgentToken(header: string | undefined): string | null {
  return parseBearerToken(header, AGENT_TOKEN_PREFIX);
}
