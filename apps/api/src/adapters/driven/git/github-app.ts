/**
 * GitHub App integration for NoteKit vaults — the create-centric, least-
 * privilege path.
 *
 * Unlike an OAuth App (which would grant NoteKit `repo` access to ALL of the
 * user's repositories with a long-lived token), the GitHub App only ever
 * touches the repos it is explicitly installed on. NoteKit's flow keeps that set
 * to exactly the vaults it creates:
 *
 *   1. user installs the App           → we store their installation_id
 *   2. create a vault  → user-to-server token does POST /user/repos, then we add
 *      that new repo to the installation (PUT …/installations/{id}/repositories)
 *   3. list vaults     → GET /installation/repositories (only the App's repos)
 *   4. sync read/write → short-lived (1 h) installation tokens, scoped to those
 *
 * So NoteKit never sees any repo it didn't create for a vault, and every sync
 * token is minted on demand and expires in an hour.
 *
 * App JWTs are signed with the App's RSA private key. GitHub issues PKCS#1 keys
 * (`BEGIN RSA PRIVATE KEY`), which node:crypto signs directly — no conversion.
 */
import crypto from "node:crypto";
import { env } from "../../../env";
import { GhError, type GhRepo } from "./github";

const GH = "https://api.github.com";

export function githubAppConfigured(): boolean {
  return !!(env.githubApp.appId && env.githubApp.privateKey && env.githubApp.clientId && env.githubApp.clientSecret);
}

function requireConfigured(): void {
  if (!githubAppConfigured()) throw new GhError(500, "github_app_not_configured");
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** A short-lived (10 min) App JWT — authenticates AS the App to mint tokens. */
function appJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // iat back-dated 60s for clock skew; exp well under GitHub's 10-min ceiling.
  const payload = b64url(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: env.githubApp.appId }),
  );
  const data = `${header}.${payload}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(data), env.githubApp.privateKey as string);
  return `${data}.${b64url(sig)}`;
}

function appHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${appJwt()}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "NoteKit",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function instHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "NoteKit",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ─── Installation tokens (short-lived, cached) ───────────────────────────────
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Mint (or reuse a cached) installation access token for an installation. Tokens
 * live ~1 h; we refresh when under 5 min remain so a sync never fails mid-flight.
 */
export async function installationToken(installationId: number): Promise<string> {
  requireConfigured();
  const key = String(installationId);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;

  const res = await fetch(`${GH}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: appHeaders(),
  });
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as { token: string; expires_at: string };
  tokenCache.set(key, { token: json.token, expiresAt: Date.parse(json.expires_at) });
  return json.token;
}

/** List the repos this installation can access — i.e. NoteKit's vault repos. */
export async function listInstallationRepos(installationId: number): Promise<GhRepo[]> {
  const token = await installationToken(installationId);
  const repos: GhRepo[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${GH}/installation/repositories?per_page=100&page=${page}`, {
      headers: instHeaders(token),
    });
    if (!res.ok) throw new GhError(res.status, await res.text());
    const json = (await res.json()) as { total_count: number; repositories: GhRepo[] };
    repos.push(...json.repositories);
    if (repos.length >= json.total_count || json.repositories.length === 0) break;
  }
  return repos;
}

// ─── User-to-server (OAuth) — for actions that act AS the user ───────────────

/** Exchange an OAuth `code` (from the install/authorize redirect) for a user token. */
export async function exchangeUserCode(
  code: string,
): Promise<{ token: string; refreshToken: string | null }> {
  requireConfigured();
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "NoteKit" },
    body: JSON.stringify({
      client_id: env.githubApp.clientId,
      client_secret: env.githubApp.clientSecret,
      code,
    }),
  });
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!json.access_token) throw new GhError(400, json.error_description ?? json.error ?? "oauth_exchange_failed");
  return { token: json.access_token, refreshToken: json.refresh_token ?? null };
}

interface Installation {
  id: number;
  account: { login: string } | null;
  app_id: number;
}

/** Find THIS app's installation for the user (from a user-to-server token). */
export async function findUserInstallation(userToken: string): Promise<Installation | null> {
  const res = await fetch(`${GH}/user/installations`, { headers: instHeaders(userToken) });
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as { installations: Installation[] };
  const appId = Number(env.githubApp.appId);
  return json.installations.find((i) => i.app_id === appId) ?? null;
}

/** Create a new repo in the user's account (acts as the user). */
export async function createUserRepo(
  userToken: string,
  name: string,
  isPrivate: boolean,
): Promise<GhRepo> {
  const res = await fetch(`${GH}/user/repos`, {
    method: "POST",
    headers: instHeaders(userToken, true),
    body: JSON.stringify({
      name,
      description: "NoteKit vault — notes and tickets",
      private: isPrivate,
      auto_init: true,
    }),
  });
  if (!res.ok) throw new GhError(res.status, await res.text());
  return (await res.json()) as GhRepo;
}

/** Add a repo to the App's installation, so it — and only it — becomes syncable. */
export async function addRepoToInstallation(
  userToken: string,
  installationId: number,
  repoId: number,
): Promise<void> {
  const res = await fetch(
    `${GH}/user/installations/${installationId}/repositories/${repoId}`,
    { method: "PUT", headers: instHeaders(userToken) },
  );
  // 204 = added, 304 = already present. Both are success.
  if (!res.ok && res.status !== 304) throw new GhError(res.status, await res.text());
}
