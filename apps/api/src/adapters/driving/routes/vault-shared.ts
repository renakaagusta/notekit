/**
 * Shared helpers and rate-limit instances for vault routes.
 * Imported by vault.ts and all vault-*.ts siblings.
 */
import type { Context } from "hono";
import { getActingAgent } from "../../../composition/agentAuth";
import { rateLimit } from "../../../composition/rate-limit";
import { getCurrentUser } from "../../../composition/sessions";
import { gitOps, resolveVault } from "../../../composition/vault-shared";
import { GhError } from "../../../domain/errors";
import type { GitProvider } from "../../../domain/git-provider";
import { env } from "../../../env";

export { gitOps, resolveVault };

export function isDevToken(token: string): boolean {
  return token === "dev_github_token" || token === "dev_forgejo_token";
}

export const vaultMutationLimit = rateLimit({
  bucket: "vault-mutation",
  windowMs: 60_000,
  max: 30,
});

export const writeLimit = rateLimit({
  bucket: "vault-write",
  windowMs: 60_000,
  max: 120,
});

export const importLimit = rateLimit({
  bucket: "vault-import",
  windowMs: 60 * 60_000,
  max: 5,
});

export function ghErr(c: Context, err: unknown) {
  if (err instanceof GhError) {
    let message = `GitHub error ${err.status}`;
    try {
      const parsed = JSON.parse(err.body) as {
        message?: string;
        errors?: { message?: string }[];
      };
      const inner = parsed.errors?.[0]?.message;
      message = inner ?? parsed.message ?? message;
    } catch { /* ignore parse errors for error body */ }
    if (err.status === 429 || (err.status === 403 && /rate limit/i.test(err.body))) {
      return c.json({ error: "rate_limited", status: err.status, message }, 429);
    }
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    return c.json(
      { error: "github_error", status: err.status, message },
      status as 400 | 422 | 404 | 403 | 401 | 502,
    );
  }
  return c.json({ error: "server_error" }, 500);
}

export async function requirePrincipal(c: Context): Promise<{
  userId: string | null;
  actingAs: string | null;
}> {
  const agent = await getActingAgent(c);
  if (agent) return { userId: agent.userId, actingAs: agent.agentSlug };
  const user = await getCurrentUser(c);
  if (!user) return { userId: null, actingAs: null };
  return { userId: user.id, actingAs: null };
}

export function providerFromQuery(c: Context): GitProvider {
  const q = c.req.query("provider");
  if (q === "notekit") return "notekit";
  if (q === "gitlab") return "gitlab";
  return "github";
}

export const MOBILE_FREE_NOTE_CAP = 50;

export const DEV_GH_REPOS = [
  {
    id: 1, name: "vault-primary", fullName: "dev/vault-primary", owner: "dev",
    private: true, defaultBranch: "main", description: "Dev primary vault",
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 2, name: "vault-archive", fullName: "dev/vault-archive", owner: "dev",
    private: true, defaultBranch: "main", description: "Dev archive vault",
    updatedAt: new Date(0).toISOString(),
  },
];

export const DEV_FJ_REPOS = [
  {
    id: 101, name: "notekit", fullName: "dev-notekit/notekit", owner: "dev-notekit",
    private: true, defaultBranch: "main", description: "Dev NoteKit-hosted vault",
    updatedAt: new Date(0).toISOString(),
  },
];

export { env };
