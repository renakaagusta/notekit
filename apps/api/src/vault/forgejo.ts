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
      headers: adminHeaders(true),
      body: JSON.stringify({ name: tokenName }),
    },
  );
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as { sha1: string };
  return json.sha1;
}

// ── Repo operations ───────────────────────────────────────────────────────────

export async function listRepos(token: string): Promise<GhRepo[]> {
  const res = await fetch(
    `${baseUrl()}/api/v1/repos/search?limit=50&sort=newest&token=${encodeURIComponent(token)}`,
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
    method: "PUT",
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
      author: { name?: string; date: string } | null;
    };
    author: { login: string; avatar_url: string } | null;
  }>;
  return (arr ?? []).slice(0, want).map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    authorName: c.commit.author?.name ?? null,
    authorLogin: c.author?.login ?? null,
    authorAvatar: c.author?.avatar_url ?? null,
    authoredAt: c.commit.author?.date ?? "",
    url: c.html_url,
  }));
}
