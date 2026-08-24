// Project tools — discover, inspect, and bootstrap the per-project
// folders that live under `projects/<slug>/` inside a NoteKit vault.
//
// The hypothesis (docs/MCP_DISTRIBUTION.md §2): a user has one vault, but
// inside it each code repo / project gets its own folder. The MCP server
// resolves the active project from a `.notekit` marker committed in the
// repo, so dropping into a different repo in Cursor/Claude Code/Codex
// auto-scopes every other tool.
//
// These three tools give the agent the affordances it needs to manage
// that mapping itself: discover what projects already exist, ask which
// one applies to the current cwd, and create a new project + marker on
// the fly when the agent lands in a fresh repo.

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import { z } from "zod";
import {
  errorContent,
  jsonContent,
  listVaultFiles,
  deriveSlugFromGit,
  findGitRoot,
  ownerRepoFromGit,
  resolveProjectContext,
  slugify
} from "../../../composition/index.js";

const PROJECTS_PREFIX = "projects/";

interface ProjectJson {
  name?: string;
  repos?: string[];
  aliases?: string[];
  createdAt?: string;
}

// eslint-disable-next-line max-lines-per-function -- registers three related tools inline; splitting into separate files would fragment the project-tool cohesion
export function registerProjectTools(server: McpServer, nk: NoteKitApi): void {
  server.registerTool(
    "project_list",
    {
      title: "List projects",
      description:
        "List every project defined under `projects/<slug>/` in the active vault. Each project is a folder; an optional `project.json` inside surfaces display name, linked repos, and aliases. Use this to discover what scopes exist before searching or filing.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      try {
        const entries = await listVaultFiles(nk, PROJECTS_PREFIX);
        const slugs = new Set<string>();
        const metaPaths: { slug: string; path: string }[] = [];
        for (const entry of entries) {
          const slugMatch = /^projects\/([^/]+)\//.exec(entry.path);
          if (!slugMatch || !slugMatch[1]) continue;
          slugs.add(slugMatch[1]);
          if (entry.path === `${PROJECTS_PREFIX}${slugMatch[1]}/project.json`) {
            metaPaths.push({ slug: slugMatch[1], path: entry.path });
          }
        }
        const meta: Record<string, ProjectJson> = {};
        await Promise.all(
          metaPaths.map(async ({ slug, path: p }) => {
            try {
              const file = await nk.vault.readFile(p);
              if (file.content) meta[slug] = JSON.parse(file.content) as ProjectJson;
            } catch {
              // project.json is optional — skip on parse / 404.
            }
          }),
        );
        const projects = [...slugs].sort().map((slug) => {
          const m = meta[slug];
          return {
            slug,
            name: m?.name ?? slug,
            repos: m?.repos ?? [],
            aliases: m?.aliases ?? [],
            ...(m?.createdAt ? { createdAt: m.createdAt } : {}),
          };
        });
        return jsonContent({ count: projects.length, projects });
      } catch (err) {
        return errorContent(`project_list failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "project_current",
    {
      title: "Current project",
      description:
        "Return the project the MCP server resolved from the current working directory (the IDE's project root) and the `.notekit` marker, if any. When no project is resolved, `project` is null and `suggestedSlug` (derived from `git remote get-url origin`) tells you what slug would be used if you call `project_create`.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      const ctx = resolveProjectContext();
      const gitRoot = findGitRoot();
      const remoteSlug = deriveSlugFromGit();
      const ownerRepo = ownerRepoFromGit();
      return jsonContent({
        project: ctx?.project ?? null,
        scope: ctx?.scope ?? null,
        vault: ctx?.vault ?? null,
        markerFile: ctx?.source ?? null,
        cwd: process.cwd(),
        gitRoot: gitRoot ?? null,
        suggestedSlug: ctx ? null : remoteSlug,
        suggestedRepo: ownerRepo,
      });
    },
  );

  server.registerTool(
    "project_create",
    {
      title: "Create project",
      description:
        "Bootstrap a project: write `projects/<slug>/project.json` inside the active vault (if missing) and, when invoked from a Git working tree, drop a `.notekit` marker at the repo root so future MCP calls auto-scope. Idempotent — won't overwrite an existing `project.json` or marker. Defaults `slug` to the slug derived from `git remote get-url origin`, then to the cwd basename.",
      inputSchema: {
        slug: z
          .string()
          .optional()
          .describe(
            "Project slug. Defaults to the slug derived from `git remote get-url origin`, then the cwd basename.",
          ),
        name: z.string().optional().describe("Display name (defaults to slug)."),
        repos: z
          .array(z.string())
          .optional()
          .describe(
            "Repo identifiers like `renakaagusta/notekit`. Defaults to the cwd's `origin` remote if available.",
          ),
        writeMarker: z
          .boolean()
          .optional()
          .describe("Write `.notekit` in the current Git repo. Defaults true."),
        commitMessage: z
          .string()
          .optional()
          .describe("Git commit message for the new `project.json`."),
      },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ slug, name, repos, writeMarker, commitMessage }) => {
      try {
        const ctx = resolveProjectContext();
        const ownerRepo = ownerRepoFromGit();
        const resolvedSlug = resolveProjectSlug(slug);
        if (!resolvedSlug) {
          return errorContent(
            "project_create: could not derive a slug. Pass `slug` explicitly.",
          );
        }
        const projectJsonPath = `${PROJECTS_PREFIX}${resolvedSlug}/project.json`;
        const alreadyExisted = await projectJsonExists(nk, projectJsonPath);
        if (!alreadyExisted) {
          const body: ProjectJson = {
            name: name ?? resolvedSlug,
            repos: repos ?? (ownerRepo ? [ownerRepo] : []),
            createdAt: new Date().toISOString(),
          };
          await nk.vault.writeFile(
            projectJsonPath,
            JSON.stringify(body, null, 2) + "\n",
            commitMessage ?? `notekit: bootstrap project ${resolvedSlug}`,
          );
        }
        const markerWritten = maybeWriteMarker(writeMarker, ctx?.source ?? null, resolvedSlug);
        return jsonContent({
          slug: resolvedSlug,
          projectJson: projectJsonPath,
          created: !alreadyExisted,
          markerWritten,
        });
      } catch (err) {
        return errorContent(`project_create failed: ${(err as Error).message}`);
      }
    },
  );
}

/** Derive the project slug from the explicit arg, git remote, or cwd basename. */
function resolveProjectSlug(slug: string | undefined): string | null {
  const remoteSlug = deriveSlugFromGit();
  const cwdSlug = slugify(path.basename(process.cwd()));
  return (slug && slugify(slug)) || remoteSlug || cwdSlug || null;
}

/** Return true when a non-empty project.json already exists in the vault. */
async function projectJsonExists(nk: NoteKitApi, projectJsonPath: string): Promise<boolean> {
  try {
    const existing = await nk.vault.readFile(projectJsonPath);
    return !!(existing && (existing.content ?? "") !== "");
  } catch {
    return false;
  }
}

/**
 * Write a `.notekit` marker at the git root when requested and not yet present.
 * Returns the marker path if written, or null otherwise.
 */
function maybeWriteMarker(
  writeMarker: boolean | undefined,
  existingSource: string | null,
  resolvedSlug: string,
): string | null {
  if (writeMarker === false || existingSource) return null;
  const root = findGitRoot();
  if (!root) return null;
  const markerPath = path.join(root, ".notekit");
  if (existsSync(markerPath)) return null;
  writeFileSync(markerPath, `project: ${resolvedSlug}\n`, "utf8");
  return markerPath;
}
