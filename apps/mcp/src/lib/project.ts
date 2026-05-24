// Project scoping for the NoteKit MCP. The hypothesis (see
// docs/MCP_DISTRIBUTION.md): one vault holds every project a user works
// on, and inside that vault each project lives under
// `projects/<slug>/`. A code repo opts in by committing a `.notekit`
// marker at the repo root.
//
// This module resolves the active project context from (in order):
//   1. NOTEKIT_PROJECT env var (explicit override)
//   2. The closest `.notekit` (or `notekit.json`) walking up from cwd
//   3. `null` — caller falls back to a global / all scope.
//
// We also expose helpers to derive a slug from `git remote get-url
// origin` so an agent landing in a fresh repo can self-onboard.
//
// Everything here is sync filesystem + spawn — we run once per MCP boot
// and the data is tiny, so async would just add ceremony.

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export type ProjectScope = "project" | "global" | "all";

export interface ProjectMarker {
  /** Resolved slug used as `projects/<slug>/` inside the active vault. */
  project: string;
  /** Optional vault override declared in the marker file. */
  vault?: string;
  /** Optional default scope declared in the marker file. */
  scope?: ProjectScope;
  /** Absolute path to the marker that produced this context, if any. */
  source: string | null;
}

const MARKER_FILENAMES = [".notekit", "notekit.json", ".notekit.json"];

/**
 * Resolve the active project context. `null` means no project could be
 * derived — every tool should then default to a global / all scope.
 *
 * Lookup order:
 *   1. NOTEKIT_PROJECT env var (with optional NOTEKIT_VAULT companion).
 *   2. Closest marker file walking up from cwd.
 */
export function resolveProjectContext(
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): ProjectMarker | null {
  const env = opts.env ?? process.env;
  const explicit = env["NOTEKIT_PROJECT"]?.trim();
  if (explicit) {
    return {
      project: explicit,
      vault: env["NOTEKIT_VAULT"]?.trim() || undefined,
      source: null,
    };
  }
  const cwd = opts.cwd ?? process.cwd();
  return findMarker(cwd);
}

function findMarker(startDir: string): ProjectMarker | null {
  let dir = path.resolve(startDir);
  // Bound the climb so a pathological symlink loop can't hang us.
  for (let i = 0; i < 64; i++) {
    for (const name of MARKER_FILENAMES) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) {
        const parsed = parseMarkerFile(candidate);
        if (parsed) return parsed;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Parse a marker file. We accept two shapes — a JSON object or a tiny
 * `key: value` text file — so users who want config can have it and users
 * who just want a one-liner can have that too.
 *
 *   project: notekit              # text form, single line
 *   { "project": "notekit" }      # JSON form, room to grow
 */
export function parseMarkerFile(file: string): ProjectMarker | null {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
  if (!raw) return null;
  return parseMarkerContent(raw, file);
}

export function parseMarkerContent(
  raw: string,
  source: string | null,
): ProjectMarker | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const project =
        typeof obj["project"] === "string" ? obj["project"].trim() : "";
      if (!project) return null;
      const vault =
        typeof obj["vault"] === "string" ? obj["vault"].trim() : "";
      const scope = isScope(obj["scope"]) ? obj["scope"] : undefined;
      return {
        project,
        vault: vault || undefined,
        scope,
        source,
      };
    } catch {
      return null;
    }
  }

  const fields: Record<string, string> = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const ln = line.trim();
    if (!ln || ln.startsWith("#")) continue;
    const colon = ln.indexOf(":");
    if (colon === -1) continue;
    fields[ln.slice(0, colon).trim()] = ln.slice(colon + 1).trim();
  }
  const project = fields["project"];
  if (!project) return null;
  const scope = isScope(fields["scope"]) ? fields["scope"] : undefined;
  return {
    project,
    vault: fields["vault"] || undefined,
    scope,
    source,
  };
}

function isScope(value: unknown): value is ProjectScope {
  return value === "project" || value === "global" || value === "all";
}

/**
 * Run `git remote get-url origin` in `cwd` and extract a project slug
 * from the URL. Handles both SSH and HTTPS remotes. Returns null when
 * cwd isn't a git repo or no `origin` remote is configured.
 */
export function deriveSlugFromGit(cwd: string = process.cwd()): string | null {
  const result = spawnSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const url = result.stdout.trim();
  if (!url) return null;
  return slugFromRemoteUrl(url);
}

/**
 * Extract the repo name from a Git remote URL.
 *
 *   git@github.com:owner/repo.git           → repo
 *   https://github.com/owner/repo.git       → repo
 *   https://gitlab.example.com/g/sub/repo   → repo
 */
export function slugFromRemoteUrl(url: string): string | null {
  const cleaned = url.replace(/\.git$/, "").trim();
  if (!cleaned) return null;
  // SSH form `git@host:path`
  const ssh = /^[^@\s]+@[^:]+:(.+)$/.exec(cleaned);
  const tail = ssh && ssh[1] ? ssh[1] : cleaned.replace(/^[a-z]+:\/\/[^/]+\//, "");
  if (!tail) return null;
  const parts = tail.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return null;
  return slugify(last);
}

/**
 * Extract `owner/repo` from a Git remote URL. Used by `project_create`
 * to populate `project.json#repos` with full provenance.
 */
export function ownerRepoFromRemoteUrl(url: string): string | null {
  const cleaned = url.replace(/\.git$/, "").trim();
  if (!cleaned) return null;
  const ssh = /^[^@\s]+@[^:]+:(.+)$/.exec(cleaned);
  const tail = ssh && ssh[1] ? ssh[1] : cleaned.replace(/^[a-z]+:\/\/[^/]+\//, "");
  if (!tail) return null;
  const parts = tail.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const repo = parts[parts.length - 1]!;
  const owner = parts[parts.length - 2]!;
  return `${owner}/${repo}`;
}

export function ownerRepoFromGit(cwd: string = process.cwd()): string | null {
  const result = spawnSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const url = result.stdout.trim();
  if (!url) return null;
  return ownerRepoFromRemoteUrl(url);
}

/** Slugify in the same shape `notes_create` / `tickets_create` already use. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/**
 * Find the closest git repo root walking up from cwd. `project_create`
 * uses this to decide where to drop the `.notekit` marker.
 */
export function findGitRoot(cwd: string = process.cwd()): string | null {
  const result = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}
