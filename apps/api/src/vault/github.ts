/**
 * Minimal GitHub REST wrapper for NoteKit's vault sync.
 * Uses the Contents API (one file at a time) — simple, no Git plumbing required.
 * Future: switch to blob/tree/commit if we need batched commits.
 */

const GH = "https://api.github.com";

function headers(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "NoteKit",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  description: string | null;
  updated_at: string;
}

export async function listRepos(token: string): Promise<GhRepo[]> {
  // affiliation=owner so we don't include orgs/collaborator repos by default.
  const res = await fetch(
    `${GH}/user/repos?affiliation=owner&per_page=100&sort=updated`,
    { headers: headers(token) },
  );
  if (!res.ok) throw new GhError(res.status, await res.text());
  return (await res.json()) as GhRepo[];
}

export async function getUserLogin(token: string): Promise<string> {
  const res = await fetch(`${GH}/user`, { headers: headers(token) });
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as { login: string };
  return json.login;
}

export async function createRepo(
  token: string,
  name: string,
  isPrivate: boolean,
): Promise<GhRepo> {
  const res = await fetch(`${GH}/user/repos`, {
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

export interface GhFile {
  path: string;
  sha: string;
  content: string; // decoded utf-8
}

/**
 * Read a single file. Returns null on 404.
 */
export async function readFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<GhFile | null> {
  const url = `${GH}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new GhError(res.status, await res.text());
  const json = (await res.json()) as {
    path: string;
    sha: string;
    content: string;
    encoding: string;
  };
  if (json.encoding !== "base64") {
    throw new Error(`unexpected encoding ${json.encoding}`);
  }
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
  const url = `${GH}/repos/${owner}/${repo}/contents/${encodePath(path)}`;
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

export interface GitAuthor {
  name: string;
  email: string;
}

/**
 * Write a file via the Git Data API so author/committer can be set explicitly.
 * Used when an agent is acting on the user's behalf — author = agent,
 * committer = the token holder (user).
 *
 * Costs ~5 round trips vs Contents API's 1. Only use when attribution matters.
 */
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
  // 1. Get the current branch ref → latest commit sha.
  const refRes = await fetch(
    `${GH}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { headers: headers(token) },
  );
  if (!refRes.ok) throw new GhError(refRes.status, await refRes.text());
  const ref = (await refRes.json()) as { object: { sha: string } };
  const parentSha = ref.object.sha;

  // 2. Get the parent commit's tree sha.
  const commitRes = await fetch(
    `${GH}/repos/${owner}/${repo}/git/commits/${parentSha}`,
    { headers: headers(token) },
  );
  if (!commitRes.ok) throw new GhError(commitRes.status, await commitRes.text());
  const parentCommit = (await commitRes.json()) as { tree: { sha: string } };
  const baseTreeSha = parentCommit.tree.sha;

  // 3. Create a blob with the new file content.
  const blobRes = await fetch(`${GH}/repos/${owner}/${repo}/git/blobs`, {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify({
      content: Buffer.from(contents, "utf-8").toString("base64"),
      encoding: "base64",
    }),
  });
  if (!blobRes.ok) throw new GhError(blobRes.status, await blobRes.text());
  const blob = (await blobRes.json()) as { sha: string };

  // 4. Create a new tree off the base tree with our blob at `path`.
  const treeRes = await fetch(`${GH}/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [{ path, mode: "100644", type: "blob", sha: blob.sha }],
    }),
  });
  if (!treeRes.ok) throw new GhError(treeRes.status, await treeRes.text());
  const tree = (await treeRes.json()) as { sha: string };

  // 5. Create a commit pointing at that tree, with explicit author + committer.
  const nowIso = new Date().toISOString();
  const newCommitRes = await fetch(`${GH}/repos/${owner}/${repo}/git/commits`, {
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

  // 6. Fast-forward the branch ref to the new commit.
  const updateRes = await fetch(
    `${GH}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
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
  const url = `${GH}/repos/${owner}/${repo}/contents/${encodePath(path)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: headers(token, true),
    body: JSON.stringify({ message, branch, sha: prevSha }),
  });
  if (!res.ok && res.status !== 404) {
    throw new GhError(res.status, await res.text());
  }
}

export interface GhTreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

/**
 * List all files under a directory prefix using the trees API (recursive).
 * Cheaper than walking the contents API path-by-path.
 */
export async function listTree(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  prefix: string,
): Promise<GhTreeEntry[]> {
  // Resolve the branch's head commit -> tree.
  const refRes = await fetch(
    `${GH}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { headers: headers(token) },
  );
  if (refRes.status === 404) return [];
  if (!refRes.ok) throw new GhError(refRes.status, await refRes.text());
  const ref = (await refRes.json()) as { object: { sha: string } };

  const treeRes = await fetch(
    `${GH}/repos/${owner}/${repo}/git/trees/${ref.object.sha}?recursive=1`,
    { headers: headers(token) },
  );
  if (!treeRes.ok) throw new GhError(treeRes.status, await treeRes.text());
  const tree = (await treeRes.json()) as {
    tree: GhTreeEntry[];
    truncated: boolean;
  };

  const normPrefix = prefix.endsWith("/") ? prefix : prefix + "/";
  return tree.tree.filter(
    (e) => e.type === "blob" && e.path.startsWith(normPrefix),
  );
}

export interface GhCommit {
  sha: string;
  message: string;
  authorName: string | null;
  authorLogin: string | null;
  authorAvatar: string | null;
  authoredAt: string;
  url: string;
}

const COMMITS_HARD_CAP = 300;
const COMMITS_PAGE_SIZE = 100;

type RawCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name?: string; date: string } | null;
  };
  author: { login: string; avatar_url: string } | null;
};

export async function listCommits(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string | undefined,
  limit: number,
): Promise<GhCommit[]> {
  const want = Math.min(Math.max(limit, 1), COMMITS_HARD_CAP);
  const out: GhCommit[] = [];
  for (let page = 1; out.length < want; page++) {
    const params = new URLSearchParams({
      sha: branch,
      per_page: String(Math.min(COMMITS_PAGE_SIZE, want - out.length)),
      page: String(page),
    });
    if (path) params.set("path", path);
    const url = `${GH}/repos/${owner}/${repo}/commits?${params}`;
    const res = await fetch(url, { headers: headers(token) });
    if (res.status === 404 || res.status === 409) return out;
    if (!res.ok) throw new GhError(res.status, await res.text());
    const arr = (await res.json()) as RawCommit[];
    for (const c of arr) {
      out.push({
        sha: c.sha,
        message: c.commit.message,
        authorName: c.commit.author?.name ?? null,
        authorLogin: c.author?.login ?? null,
        authorAvatar: c.author?.avatar_url ?? null,
        authoredAt: c.commit.author?.date ?? "",
        url: c.html_url,
      });
    }
    if (arr.length < COMMITS_PAGE_SIZE) break;
  }
  return out.slice(0, want);
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export class GhError extends Error {
  constructor(public status: number, public body: string) {
    super(`GitHub API ${status}: ${body.slice(0, 200)}`);
    this.name = "GhError";
  }
}
