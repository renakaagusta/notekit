/**
 * GitLab REST wrapper for NoteKit's vault sync.
 * Mirrors the function surface of github.ts and forgejo.ts so the route layer
 * can dispatch on provider without branching past `gitOps(provider)`.
 *
 * v1 targets gitlab.com only. Self-hosted GitLab is a follow-up: the host
 * would need to live alongside the token (a column on oauth_accounts) so a
 * user can point each connection at a different instance.
 *
 * Shape differences worth knowing:
 *   - "projects" instead of "repos"; project ID is URL-encoded `owner/repo`
 *   - file path is URL-encoded as a single segment, not slash-split
 *   - access is permissioned by numeric access_level (10..50), not roles
 *   - the blob sha (`blob_id`) is returned by reads but not by writes, so
 *     writeFile re-reads after write to surface a consistent `sha` field
 */

import {
  GhError,
  type GhRepo,
  type GhFile,
  type GhTreeEntry,
  type GhCommit,
  type GitAuthor,
  type GhCollaborator,
  type GhInvitation,
  type CollaboratorPermission,
} from "./github";

const GL = "https://gitlab.com/api/v4";

function headers(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = {
    "PRIVATE-TOKEN": token,
    Accept: "application/json",
    "User-Agent": "NoteKit",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// GitLab takes the *entire* file path as a single URL-encoded segment, e.g.
// `notes%2F2026%2Fjan.md` — slashes included. Different from GitHub/Forgejo
// where each segment is encoded separately.
function encodeFilePath(path: string): string {
  return encodeURIComponent(path);
}

function projectId(owner: string, repo: string): string {
  return encodeURIComponent(`${owner}/${repo}`);
}

interface GlProject {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  namespace: { full_path: string; name: string };
  visibility: "private" | "internal" | "public";
  default_branch: string | null;
  description: string | null;
  last_activity_at: string;
  statistics?: { repository_size: number };
}

function toGhRepo(p: GlProject): GhRepo {
  return {
    id: p.id,
    name: p.path,
    full_name: p.path_with_namespace,
    owner: { login: p.namespace.full_path },
    private: p.visibility === "private",
    default_branch: p.default_branch ?? "main",
    description: p.description,
    updated_at: p.last_activity_at,
    // GitLab reports bytes; GhRepo.size is KiB to match GitHub/Forgejo.
    size: p.statistics ? Math.round(p.statistics.repository_size / 1024) : undefined,
  };
}

export async function listRepos(token: string): Promise<GhRepo[]> {
  const res = await fetch(
    `${GL}/projects?membership=true&owned=true&per_page=100&order_by=updated_at`,
    { headers: headers(token) },
  );
  if (!res.ok) throw new GhError(res.status, await res.text());
  const arr = (await res.json()) as GlProject[];
  return arr.map(toGhRepo);
}

export async function getUserLogin(token: string): Promise<string> {
  const res = await fetch(`${GL}/user`, { headers: headers(token) });
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as { username: string };
  return json.username;
}

/**
 * Fetch the calling user's id + username in one round trip. Used by the
 * connect flow, which needs the numeric id as `provider_account_id` in the
 * oauth_accounts row.
 */
export async function getCurrentUserInfo(
  token: string,
): Promise<{ id: number; username: string }> {
  const res = await fetch(`${GL}/user`, { headers: headers(token) });
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as { id: number; username: string };
  return { id: json.id, username: json.username };
}

export async function createRepo(
  token: string,
  name: string,
  isPrivate: boolean,
): Promise<GhRepo> {
  const res = await fetch(`${GL}/projects`, {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify({
      name,
      path: name,
      description: "NoteKit vault — notes and tickets",
      visibility: isPrivate ? "private" : "public",
      initialize_with_readme: true,
      default_branch: "main",
    }),
  });
  if (!res.ok) throw new GhError(res.status, await res.text());
  return toGhRepo((await res.json()) as GlProject);
}

export async function readFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<GhFile | null> {
  const url = `${GL}/projects/${projectId(owner, repo)}/repository/files/${encodeFilePath(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as {
    file_path: string;
    blob_id: string;
    content: string;
    encoding: string;
  };
  if (json.encoding !== "base64") {
    throw new Error(`unexpected encoding ${json.encoding}`);
  }
  return {
    path: json.file_path,
    sha: json.blob_id,
    content: Buffer.from(json.content, "base64").toString("utf-8"),
  };
}

// Errors GitLab returns when create/update is called on the wrong precondition
// (file exists but POSTed, or file missing but PUT). We detect by substring
// so we can flip method without surfacing a stale 400 to the caller.
function indicatesExists(text: string): boolean {
  return text.includes("already exists");
}
function indicatesMissing(text: string): boolean {
  return text.includes("does not exist") || text.includes("doesn't exist");
}

export async function writeFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  contents: string,
  message: string,
  branch: string,
  prevSha?: string,
): Promise<{ sha: string }> {
  const baseUrl = `${GL}/projects/${projectId(owner, repo)}/repository/files/${encodeFilePath(path)}`;
  const body: Record<string, unknown> = {
    branch,
    content: Buffer.from(contents, "utf-8").toString("base64"),
    encoding: "base64",
    commit_message: message,
  };
  // `last_commit_id` is GitLab's optimistic-concurrency token (commit sha,
  // not blob sha). We only have a prev blob sha here, so we omit it — the
  // route layer doesn't pass a commit sha through. Conflicts surface as
  // 400 with a clear message; clients retry on conflict.
  const firstMethod = prevSha ? "PUT" : "POST";
  const fallbackMethod = prevSha ? "POST" : "PUT";

  let res = await fetch(baseUrl, {
    method: firstMethod,
    headers: headers(token, true),
    body: JSON.stringify(body),
  });
  if (res.status === 400) {
    const text = await res.text();
    if (indicatesExists(text) || indicatesMissing(text)) {
      res = await fetch(baseUrl, {
        method: fallbackMethod,
        headers: headers(token, true),
        body: JSON.stringify(body),
      });
    } else {
      throw new GhError(400, text);
    }
  }
  if (!res.ok) throw new GhError(res.status, await res.text());
  // GitLab's file-write response doesn't include the new blob sha. One extra
  // read brings the response shape in line with GitHub/Forgejo so callers
  // (sync engine, publishVaultEvent) get a real sha to dedupe against.
  const fetched = await readFile(token, owner, repo, path, branch);
  return { sha: fetched?.sha ?? "" };
}

export async function writeFileAs(
  token: string,
  owner: string,
  repo: string,
  path: string,
  contents: string,
  message: string,
  branch: string,
  author: GitAuthor,
  _committer: GitAuthor,
): Promise<{ sha: string }> {
  // GitLab's "multi-action commit" lets us set author_name + author_email on
  // the resulting commit. There's no separate committer field — GitLab uses
  // the token holder. Symmetric with GitHub's writeFileAs in the way the
  // caller cares about: agent attribution survives on the commit.
  const url = `${GL}/projects/${projectId(owner, repo)}/repository/commits`;
  const makeBody = (action: "create" | "update") =>
    JSON.stringify({
      branch,
      commit_message: message,
      author_name: author.name,
      author_email: author.email,
      actions: [
        {
          action,
          file_path: path,
          content: Buffer.from(contents, "utf-8").toString("base64"),
          encoding: "base64",
        },
      ],
    });

  let res = await fetch(url, {
    method: "POST",
    headers: headers(token, true),
    body: makeBody("update"),
  });
  if (res.status === 400) {
    const text = await res.text();
    if (indicatesMissing(text)) {
      res = await fetch(url, {
        method: "POST",
        headers: headers(token, true),
        body: makeBody("create"),
      });
    } else if (indicatesExists(text)) {
      // Shouldn't happen on update, but symmetric with the writeFile path.
      res = await fetch(url, {
        method: "POST",
        headers: headers(token, true),
        body: makeBody("update"),
      });
    } else {
      throw new GhError(400, text);
    }
  }
  if (!res.ok) throw new GhError(res.status, await res.text());

  const fetched = await readFile(token, owner, repo, path, branch);
  return { sha: fetched?.sha ?? "" };
}

/**
 * Commit MANY files in one commit (issue #13) via GitLab's native multi-file
 * commits API — a single request with one `actions` array, vs N commits for
 * N × {@link writeFile}. All files are `update` actions (the re-encrypt use
 * case re-seals existing files). `committer` is informational on GitLab and
 * isn't separately settable, so it's ignored.
 */
export async function commitFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: { path: string; content: string }[],
  message: string,
  author?: GitAuthor,
  _committer?: GitAuthor,
): Promise<{ commitSha: string }> {
  if (files.length === 0) return { commitSha: "" };
  const url = `${GL}/projects/${projectId(owner, repo)}/repository/commits`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify({
      branch,
      commit_message: message,
      actions: files.map((f) => ({
        action: "update",
        file_path: f.path,
        content: Buffer.from(f.content, "utf-8").toString("base64"),
        encoding: "base64",
      })),
      ...(author ? { author_name: author.name, author_email: author.email } : {}),
    }),
  });
  if (!res.ok) throw new GhError(res.status, await res.text());
  const commit = (await res.json()) as { id: string };
  return { commitSha: commit.id };
}

export async function deleteFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  message: string,
  branch: string,
  // GitLab accepts last_commit_id for optimistic concurrency but we don't
  // have one here; the prev blob sha isn't equivalent. Treat as advisory.
  _prevSha: string,
): Promise<void> {
  const url = `${GL}/projects/${projectId(owner, repo)}/repository/files/${encodeFilePath(path)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: headers(token, true),
    body: JSON.stringify({ branch, commit_message: message }),
  });
  if (!res.ok && res.status !== 404) {
    throw new GhError(res.status, await res.text());
  }
}

export async function listTree(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  prefix: string,
): Promise<GhTreeEntry[]> {
  // GitLab's tree endpoint pages with `X-Next-Page`; keyset pagination is
  // available but standard offset is simpler and matches the volumes we'd
  // ever see in a personal vault. Filtering by `path=` is server-side.
  const out: GhTreeEntry[] = [];
  const normPrefix = prefix.replace(/\/$/, "");

  for (let page = 1; page < 100; page++) {
    const params = new URLSearchParams({
      ref: branch,
      recursive: "true",
      per_page: "100",
      page: String(page),
    });
    if (normPrefix) params.set("path", normPrefix);
    const url = `${GL}/projects/${projectId(owner, repo)}/repository/tree?${params}`;
    const res = await fetch(url, { headers: headers(token) });
    if (res.status === 404) return out;
    if (!res.ok) throw new GhError(res.status, await res.text());
    const arr = (await res.json()) as Array<{
      id: string;
      path: string;
      type: "blob" | "tree";
    }>;
    for (const e of arr) {
      if (e.type !== "blob") continue;
      out.push({ path: e.path, type: "blob", sha: e.id });
    }
    const nextPage = res.headers.get("x-next-page");
    if (!nextPage) break;
  }
  return out;
}

export async function listCommits(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string | undefined,
  limit: number,
): Promise<GhCommit[]> {
  const want = Math.min(Math.max(limit, 1), 300);
  const params = new URLSearchParams({
    ref_name: branch,
    per_page: String(Math.min(100, want)),
  });
  if (path) params.set("path", path);
  const url = `${GL}/projects/${projectId(owner, repo)}/repository/commits?${params}`;
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 404) return [];
  if (!res.ok) throw new GhError(res.status, await res.text());
  const arr = (await res.json()) as Array<{
    id: string;
    title: string;
    message: string;
    author_name: string;
    author_email: string;
    authored_date: string;
    web_url: string;
  }>;
  return arr.slice(0, want).map((c) => ({
    sha: c.id,
    message: c.message,
    authorName: c.author_name,
    authorEmail: c.author_email,
    // GitLab commits surface name/email but not the in-platform user login
    // the way GitHub does. Leave login + avatar null; agent-avatar enrichment
    // in routes/vault.ts already matches by email so attribution still works.
    authorLogin: null,
    authorAvatar: null,
    authoredAt: c.authored_date,
    url: c.web_url,
  }));
}

// ── Collaborators ─────────────────────────────────────────────────────────
//
// GitLab uses numeric access_level (10 guest, 20 reporter, 30 developer,
// 40 maintainer, 50 owner). We translate to GitHub's named permissions so
// the rest of the system can stay provider-agnostic.

const GL_ACCESS_LEVEL: Record<CollaboratorPermission, number> = {
  pull: 20, // Reporter — read-only equivalent
  triage: 20,
  push: 30, // Developer — write access
  maintain: 40, // Maintainer
  admin: 50, // Owner
};

function accessLevelToPermission(level: number): CollaboratorPermission {
  if (level >= 50) return "admin";
  if (level >= 40) return "maintain";
  if (level >= 30) return "push";
  return "pull";
}

export async function listCollaborators(
  token: string,
  owner: string,
  repo: string,
): Promise<GhCollaborator[]> {
  const url = `${GL}/projects/${projectId(owner, repo)}/members/all?per_page=100`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new GhError(res.status, await res.text());
  const arr = (await res.json()) as Array<{
    username: string;
    avatar_url: string | null;
    web_url: string;
    access_level: number;
  }>;
  return arr.map((m) => ({
    login: m.username,
    avatarUrl: m.avatar_url,
    htmlUrl: m.web_url,
    permission: accessLevelToPermission(m.access_level),
  }));
}

async function lookupUserIdByUsername(token: string, username: string): Promise<number | null> {
  const res = await fetch(
    `${GL}/users?username=${encodeURIComponent(username)}`,
    { headers: headers(token) },
  );
  if (!res.ok) throw new GhError(res.status, await res.text());
  const arr = (await res.json()) as Array<{ id: number; username: string }>;
  const match = arr.find((u) => u.username.toLowerCase() === username.toLowerCase());
  return match?.id ?? null;
}

export async function addCollaborator(
  token: string,
  owner: string,
  repo: string,
  username: string,
  permission: CollaboratorPermission,
): Promise<{ status: 201 | 204; invitation: GhInvitation | null }> {
  const userId = await lookupUserIdByUsername(token, username);
  if (userId == null) throw new GhError(404, `user ${username} not found`);

  const accessLevel = GL_ACCESS_LEVEL[permission] ?? 30;
  const addRes = await fetch(
    `${GL}/projects/${projectId(owner, repo)}/members`,
    {
      method: "POST",
      headers: headers(token, true),
      body: JSON.stringify({ user_id: userId, access_level: accessLevel }),
    },
  );
  if (addRes.status === 409) {
    // Already a member — promote/demote instead.
    const updateRes = await fetch(
      `${GL}/projects/${projectId(owner, repo)}/members/${userId}`,
      {
        method: "PUT",
        headers: headers(token, true),
        body: JSON.stringify({ access_level: accessLevel }),
      },
    );
    if (!updateRes.ok) throw new GhError(updateRes.status, await updateRes.text());
    return { status: 204, invitation: null };
  }
  if (!addRes.ok) throw new GhError(addRes.status, await addRes.text());
  return { status: 204, invitation: null };
}

export async function removeCollaborator(
  token: string,
  owner: string,
  repo: string,
  username: string,
): Promise<void> {
  const userId = await lookupUserIdByUsername(token, username);
  if (userId == null) return; // already gone or never existed
  const res = await fetch(
    `${GL}/projects/${projectId(owner, repo)}/members/${userId}`,
    { method: "DELETE", headers: headers(token) },
  );
  if (!res.ok && res.status !== 404) throw new GhError(res.status, await res.text());
}

/** GitLab adds members immediately — no pending-invitation flow surfaced. */
export async function listInvitations(
  _token: string,
  _owner: string,
  _repo: string,
): Promise<GhInvitation[]> {
  return [];
}

/** No-op for symmetry. */
export async function cancelInvitation(
  _token: string,
  _owner: string,
  _repo: string,
  _invitationId: number,
): Promise<void> {
  // intentionally empty
}
