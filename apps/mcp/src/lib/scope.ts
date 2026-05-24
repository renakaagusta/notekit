// Scope resolution for project-aware tools.
//
// Given a tool's optional `scope` + `project` args and the active project
// context, this returns the vault prefixes a tool should read from and
// the single prefix it should write to. Encodes the design decisions
// from docs/MCP_DISTRIBUTION.md §2 (read-everywhere, write-locally):
//
//   - scope "project": reads from `projects/<slug>/<kind>/` then the
//     top-level `<kind>/`. Writes to `projects/<slug>/<kind>/`.
//   - scope "global":  reads + writes only top-level `<kind>/`.
//   - scope "all":     reads under `<kind>/` and every `projects/*/<kind>/`
//     by listing the broader `<kind>/` and `projects/` prefixes; writes
//     default to the top-level `<kind>/` because there's no project to
//     anchor to.
//
// When the requested scope is "project" but no project context could be
// resolved (no marker, no env), we silently degrade to "all" so an agent
// invoking the default scope from outside a known project still works —
// the `effective` field tells callers what we actually used.

import type { ProjectMarker, ProjectScope } from "./project.js";

export type ItemKind = "notes" | "tickets" | "inbox" | "links";

export interface ResolveScopeOptions {
  /** Explicit scope override from the tool call. */
  scope?: ProjectScope;
  /** Explicit project override from the tool call (wins over ctx). */
  project?: string;
  /** Active project context (from env or `.notekit` marker). */
  ctx: ProjectMarker | null;
}

export interface ResolvedScope {
  /** Vault prefixes to list across, ordered by precedence. */
  readPrefixes: string[];
  /** The single prefix new files should be written under. */
  writePrefix: string;
  /** Effective scope after any fallbacks. */
  effective: ProjectScope;
  /** The project slug used, if any. */
  project: string | null;
}

export function resolveScope(
  kind: ItemKind,
  options: ResolveScopeOptions,
): ResolvedScope {
  const explicit = options.project?.trim();
  const ctxProject = options.ctx?.project ?? null;
  const project = explicit || ctxProject;

  // Default scope: marker-declared, else "project" (which degrades to
  // "all" below if no project is known).
  const requested = options.scope ?? options.ctx?.scope ?? "project";
  const top = `${kind}/`;

  if (requested === "global") {
    return {
      readPrefixes: [top],
      writePrefix: top,
      effective: "global",
      project,
    };
  }

  if (requested === "all") {
    return {
      readPrefixes: [top, "projects/"],
      writePrefix: top,
      effective: "all",
      project,
    };
  }

  // requested === "project"
  if (!project) {
    return {
      readPrefixes: [top, "projects/"],
      writePrefix: top,
      effective: "all",
      project: null,
    };
  }
  const proj = `projects/${project}/${kind}/`;
  return {
    readPrefixes: [proj, top],
    writePrefix: proj,
    effective: "project",
    project,
  };
}

/**
 * True when a path is owned by a specific project under
 * `projects/<slug>/`. Returns the slug, or `null` when the path is
 * top-level / global.
 */
export function projectOfPath(filePath: string): string | null {
  const m = /^projects\/([^/]+)\//.exec(filePath);
  return m && m[1] ? m[1] : null;
}

/** Convenience: filter file entries to those under any of the prefixes. */
export function isUnderAnyPrefix(filePath: string, prefixes: string[]): boolean {
  for (const p of prefixes) {
    if (filePath.startsWith(p)) return true;
  }
  return false;
}
