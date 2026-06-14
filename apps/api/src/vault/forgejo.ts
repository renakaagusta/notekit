/**
 * Forgejo REST wrapper for NoteKit's self-hosted Git backend.
 * The Forgejo Contents API is compatible with GitHub's, so most functions
 * are structural clones with a different base URL and header format.
 *
 * Types re-use GhRepo, GhFile, etc. from github.ts — they describe shapes,
 * not providers. GhError is also shared so vault.ts's ghErr handler works.
 */

import { env } from "../env";
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

function baseUrl(): string {
  return (env.forgejo.url ?? "http://notekit-git:3000").replace(/\/$/, "");
}

function headers(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `token ${token}`,
    Accept: "application/json",
    "User-Agent": "NoteKit",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function adminHeaders(json = false): Record<string, string> {
  return headers(env.forgejo.adminToken ?? "", json);
}

/**
 * HTTP Basic auth as the Forgejo admin, optionally impersonating `sudo`.
 * Required for the token-creation endpoint, which Forgejo refuses to serve
 * over token auth. With a `Sudo` header an admin mints a token *for* the
 * target user (verified: admin token alone → 401, Basic + Sudo → 201).
 */
function adminBasicHeaders(sudo?: string, json = false): Record<string, string> {
  const user = env.forgejo.adminUser ?? "";
  const pass = env.forgejo.adminPassword ?? "";
  const h: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
    Accept: "application/json",
    "User-Agent": "NoteKit",
  };
  if (sudo) h["Sudo"] = sudo;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

// ── User provisioning (admin operations) ─────────────────────────────────────

export async function createUser(
  username: string,
  email: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(true),
    body: JSON.stringify({
      login_name: username,
      username,
      email,
      password,
      send_notify: false,
      must_change_password: false,
      source_id: 0,
    }),
  });
  if (res.status === 422) {
    // User already exists — check if it's really a duplicate login conflict.
    const body = await res.text();
    if (body.includes("user already exists") || body.includes("name already exists")) return;
  }
  if (!res.ok) throw new GhError(res.status, await res.text());
}

export async function createAccessToken(username: string, tokenName: string): Promise<string> {
  const res = await fetch(
    `${baseUrl()}/api/v1/users/${encodeURIComponent(username)}/tokens`,
    {
      method: "POST",
      // Basic auth + Sudo: token creation is the one endpoint Forgejo won't
      // serve over token auth. `scopes` is required for the token to be usable.
      headers: adminBasicHeaders(username, true),
      body: JSON.stringify({ name: tokenName, scopes: ["all"] }),
    },
  );
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as { sha1: string };
  return json.sha1;
}

// ── Repo operations ───────────────────────────────────────────────────────────

export async function listRepos(token: string): Promise<GhRepo[]> {
  const res = await fetch(
    `${baseUrl()}/api/v1/repos/search?limit=50&sort=updated&order=desc&token=${encodeURIComponent(token)}`,
    { headers: headers(token) },
  );
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as { data: GhRepo[] };
  return json.data ?? [];
}

export async function getUserLogin(token: string): Promise<string> {
  const res = await fetch(`${baseUrl()}/api/v1/user`, { headers: headers(token) });
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as { login: string };
  return json.login;
}

export async function createRepo(
  token: string,
  name: string,
  isPrivate: boolean,
): Promise<GhRepo> {
  const res = await fetch(`${baseUrl()}/api/v1/user/repos`, {
    method: "POST",
    headers: headers(token, true),
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

// ── File operations ───────────────────────────────────────────────────────────

export async function readFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<GhFile | null> {
  const url = `${baseUrl()}/api/v1/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as {
    path: string;
    sha: string;
    content: string;
    encoding: string;
  };
  if (json.encoding !== "base64") throw new Error(`unexpected encoding ${json.encoding}`);
  return {
    path: json.path,
    sha: json.sha,
    content: Buffer.from(json.content, "base64").toString("utf-8"),
  };
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
  const url = `${baseUrl()}/api/v1/repos/${owner}/${repo}/contents/${encodePath(path)}`;
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(contents, "utf-8").toString("base64"),
    branch,
  };
  if (prevSha) body.sha = prevSha;
  const res = await fetch(url, {
    // Forgejo (unlike GitHub) splits create/update: POST creates a new file,
    // PUT updates an existing one and *requires* `sha`. Using PUT for a new
    // file 422s with "[SHA]: Required".
    method: prevSha ? "PUT" : "POST",
    headers: headers(token, true),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as { content: { sha: string } };
  return { sha: json.content.sha };
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
  committer: GitAuthor,
): Promise<{ sha: string }> {
  const api = `${baseUrl()}/api/v1/repos/${owner}/${repo}`;

  const refRes = await fetch(`${api}/git/refs/heads/${encodeURIComponent(branch)}`, {
    headers: headers(token),
  });
  if (!refRes.ok) throw new GhError(refRes.status, await refRes.text());
  const ref = (await refRes.json()) as { object: { sha: string } };
  const parentSha = ref.object.sha;

  const commitRes = await fetch(`${api}/git/commits/${parentSha}`, { headers: headers(token) });
  if (!commitRes.ok) throw new GhError(commitRes.status, await commitRes.text());
  const parentCommit = (await commitRes.json()) as { tree: { sha: string } };

  const blobRes = await fetch(`${api}/git/blobs`, {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify({
      content: Buffer.from(contents, "utf-8").toString("base64"),
      encoding: "base64",
    }),
  });
  if (!blobRes.ok) throw new GhError(blobRes.status, await blobRes.text());
  const blob = (await blobRes.json()) as { sha: string };

  const treeRes = await fetch(`${api}/git/trees`, {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify({
      base_tree: parentCommit.tree.sha,
      tree: [{ path, mode: "100644", type: "blob", sha: blob.sha }],
    }),
  });
  if (!treeRes.ok) throw new GhError(treeRes.status, await treeRes.text());
  const tree = (await treeRes.json()) as { sha: string };

  const nowIso = new Date().toISOString();
  const newCommitRes = await fetch(`${api}/git/commits`, {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [parentSha],
      author: { ...author, date: nowIso },
      committer: { ...committer, date: nowIso },
    }),
  });
  if (!newCommitRes.ok) throw new GhError(newCommitRes.status, await newCommitRes.text());
  const newCommit = (await newCommitRes.json()) as { sha: string };

  const updateRes = await fetch(
    `${api}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: "PATCH",
      headers: headers(token, true),
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    },
  );
  if (!updateRes.ok) throw new GhError(updateRes.status, await updateRes.text());

  return { sha: blob.sha };
}

/**
 * Commit MANY files in one commit (issue #13). Forgejo/Gitea's tree API takes
 * blob SHAs (not inline content like GitHub), so we POST one blob per file,
 * then build a single tree + single commit + ref update: N+3 calls with ONE
 * commit, vs N commits for N × {@link writeFile}. Author/committer optional.
 */
export async function commitFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: { path: string; content: string }[],
  message: string,
  author?: GitAuthor,
  committer?: GitAuthor,
): Promise<{ commitSha: string }> {
  if (files.length === 0) return { commitSha: "" };
  const api = `${baseUrl()}/api/v1/repos/${owner}/${repo}`;

  const refRes = await fetch(`${api}/git/refs/heads/${encodeURIComponent(branch)}`, {
    headers: headers(token),
  });
  if (!refRes.ok) throw new GhError(refRes.status, await refRes.text());
  const parentSha = ((await refRes.json()) as { object: { sha: string } }).object.sha;

  const commitRes = await fetch(`${api}/git/commits/${parentSha}`, { headers: headers(token) });
  if (!commitRes.ok) throw new GhError(commitRes.status, await commitRes.text());
  const baseTreeSha = ((await commitRes.json()) as { tree: { sha: string } }).tree.sha;

  const tree: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const f of files) {
    const blobRes = await fetch(`${api}/git/blobs`, {
      method: "POST",
      headers: headers(token, true),
      body: JSON.stringify({ content: Buffer.from(f.content, "utf-8").toString("base64"), encoding: "base64" }),
    });
    if (!blobRes.ok) throw new GhError(blobRes.status, await blobRes.text());
    const blobSha = ((await blobRes.json()) as { sha: string }).sha;
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blobSha });
  }

  const treeRes = await fetch(`${api}/git/trees`, {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify({ base_tree: baseTreeSha, tree }),
  });
  if (!treeRes.ok) throw new GhError(treeRes.status, await treeRes.text());
  const treeSha = ((await treeRes.json()) as { sha: string }).sha;

  const nowIso = new Date().toISOString();
  const newCommitRes = await fetch(`${api}/git/commits`, {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
      ...(author ? { author: { ...author, date: nowIso } } : {}),
      ...(committer ? { committer: { ...committer, date: nowIso } } : {}),
    }),
  });
  if (!newCommitRes.ok) throw new GhError(newCommitRes.status, await newCommitRes.text());
  const newCommitSha = ((await newCommitRes.json()) as { sha: string }).sha;

  const updateRes = await fetch(`${api}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    headers: headers(token, true),
    body: JSON.stringify({ sha: newCommitSha, force: false }),
  });
  if (!updateRes.ok) throw new GhError(updateRes.status, await updateRes.text());

  return { commitSha: newCommitSha };
}

export async function deleteFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  message: string,
  branch: string,
  prevSha: string,
): Promise<void> {
  const url = `${baseUrl()}/api/v1/repos/${owner}/${repo}/contents/${encodePath(path)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: headers(token, true),
    body: JSON.stringify({ message, branch, sha: prevSha }),
  });
  if (!res.ok && res.status !== 404) throw new GhError(res.status, await res.text());
}

export async function listTree(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  prefix: string,
): Promise<GhTreeEntry[]> {
  const refRes = await fetch(
    `${baseUrl()}/api/v1/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { headers: headers(token) },
  );
  if (refRes.status === 404) return [];
  if (!refRes.ok) throw new GhError(refRes.status, await refRes.text());
  const ref = (await refRes.json()) as { object: { sha: string } };

  const treeRes = await fetch(
    `${baseUrl()}/api/v1/repos/${owner}/${repo}/git/trees/${ref.object.sha}?recursive=true`,
    { headers: headers(token) },
  );
  if (!treeRes.ok) throw new GhError(treeRes.status, await treeRes.text());
  const tree = (await treeRes.json()) as { tree: GhTreeEntry[] };

  const normPrefix = prefix.endsWith("/") ? prefix : prefix + "/";
  return (tree.tree ?? []).filter(
    (e) => e.type === "blob" && e.path.startsWith(normPrefix),
  );
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
  const params = new URLSearchParams({ sha: branch, limit: String(want), page: "1" });
  if (path) params.set("path", path);
  const url = `${baseUrl()}/api/v1/repos/${owner}/${repo}/commits?${params}`;
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 404 || res.status === 409) return [];
  if (!res.ok) throw new GhError(res.status, await res.text());
  const arr = (await res.json()) as Array<{
    sha: string;
    html_url: string;
    commit: {
      message: string;
      author: { name?: string; email?: string; date: string } | null;
    };
    author: { login: string; avatar_url: string } | null;
  }>;
  return (arr ?? []).slice(0, want).map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    authorName: c.commit.author?.name ?? null,
    authorEmail: c.commit.author?.email ?? null,
    authorLogin: c.author?.login ?? null,
    authorAvatar: c.author?.avatar_url ?? null,
    authoredAt: c.commit.author?.date ?? "",
    url: c.html_url,
  }));
}

// ── Collaborators ─────────────────────────────────────────────────────────────
//
// Forgejo's collaborator API mirrors GitHub's for the basic shape, with one
// product difference: Forgejo has no "pending invitation" concept — adding a
// collaborator grants access immediately. We surface `listInvitations` and
// `cancelInvitation` as no-ops so callers don't need to branch on provider.

const FJ_PERMISSION_MAP: Record<CollaboratorPermission, "read" | "write" | "admin"> = {
  pull: "read",
  triage: "read",
  push: "write",
  maintain: "write",
  admin: "admin",
};

export async function listCollaborators(
  token: string,
  owner: string,
  repo: string,
): Promise<GhCollaborator[]> {
  const res = await fetch(
    `${baseUrl()}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators`,
    { headers: headers(token) },
  );
  if (!res.ok) throw new GhError(res.status, await res.text());
  const arr = (await res.json()) as Array<{
    login: string;
    avatar_url: string | null;
    html_url?: string;
  }>;
  // Forgejo's list endpoint doesn't return permission per row; we fetch it
  // separately. Keep this bounded — vaults with hundreds of collaborators are
  // out of scope for the hosted free tier.
  const out: GhCollaborator[] = [];
  for (const u of arr) {
    let permission: CollaboratorPermission = "push";
    try {
      const permRes = await fetch(
        `${baseUrl()}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(u.login)}/permission`,
        { headers: headers(token) },
      );
      if (permRes.ok) {
        const perm = (await permRes.json()) as { permission: "read" | "write" | "admin" | "none" };
        if (perm.permission === "read") permission = "pull";
        else if (perm.permission === "admin") permission = "admin";
        else permission = "push";
      }
    } catch {
      // fall through with the default
    }
    out.push({
      login: u.login,
      avatarUrl: u.avatar_url,
      htmlUrl: u.html_url ?? `${baseUrl()}/${u.login}`,
      permission,
    });
  }
  return out;
}

export async function addCollaborator(
  token: string,
  owner: string,
  repo: string,
  username: string,
  permission: CollaboratorPermission,
): Promise<{ status: 201 | 204; invitation: GhInvitation | null }> {
  const fjPerm = FJ_PERMISSION_MAP[permission] ?? "write";
  const res = await fetch(
    `${baseUrl()}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`,
    {
      method: "PUT",
      headers: headers(token, true),
      body: JSON.stringify({ permission: fjPerm }),
    },
  );
  // Forgejo returns 204 on both create and update — there are no pending invites.
  if (res.status === 204 || res.status === 201) {
    return { status: 204, invitation: null };
  }
  throw new GhError(res.status, await res.text());
}

export async function removeCollaborator(
  token: string,
  owner: string,
  repo: string,
  username: string,
): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`,
    { method: "DELETE", headers: headers(token) },
  );
  if (!res.ok && res.status !== 404) throw new GhError(res.status, await res.text());
}

/**
 * Forgejo has no pending-invitation flow — collaborator access is immediate.
 * Returns [] so callers can treat both backends uniformly.
 */
export async function listInvitations(
  _token: string,
  _owner: string,
  _repo: string,
): Promise<GhInvitation[]> {
  return [];
}

/**
 * No-op for symmetry with GitHub. Forgejo has no pending invitations to cancel.
 */
export async function cancelInvitation(
  _token: string,
  _owner: string,
  _repo: string,
  _invitationId: number,
): Promise<void> {
  // intentionally empty
}

