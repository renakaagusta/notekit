// `inbox_append` — append a chunk of raw text to a project-scoped (or
// global) inbox. The inbox is just `<scope-prefix>inbox/<file>.md`; later
// triage tools or the LLM Wiki compiler pick it up. This is the
// fastest-path capture affordance for agents: no slug picking, no
// frontmatter ceremony — just a timestamped append.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import { errorContent, textContent } from "../lib/notekit.js";
import { resolveProjectContext } from "../lib/project.js";
import { resolveScope } from "../lib/scope.js";

const SCOPE_VALUES = ["project", "global", "all"] as const;

export function registerInboxTools(server: McpServer, nk: NoteKitApi): void {
  server.registerTool(
    "inbox_append",
    {
      title: "Append to inbox",
      description:
        "Drop a chunk of raw text into the inbox for later triage. Creates `inbox/<YYYY-MM-DD>.md` in the active scope (project's `projects/<slug>/inbox/` by default) and appends; one file per day. Use this when the user wants to 'remember this' or 'capture this' without committing to a structured note yet.",
      inputSchema: {
        text: z.string().min(1).describe("The raw content to capture."),
        source: z
          .string()
          .optional()
          .describe("Optional source label prepended as a markdown header (e.g. 'Slack' or 'meeting')."),
        scope: z
          .enum(SCOPE_VALUES)
          .optional()
          .describe(
            "Where to write. Default `project` (uses `projects/<slug>/inbox/`). `global` writes to top-level `inbox/`.",
          ),
        project: z.string().optional().describe("Override the active project slug for this call."),
        commitMessage: z.string().optional().describe("Git commit message."),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ text, source, scope, project, commitMessage }) => {
      try {
        const ctx = resolveProjectContext();
        const resolved = resolveScope("inbox", { scope, project, ctx });
        const today = new Date().toISOString().slice(0, 10);
        const targetPath = `${resolved.writePrefix}${today}.md`;
        const stamp = new Date().toISOString().slice(11, 19);
        const heading = source ? `## ${stamp} — ${source}` : `## ${stamp}`;
        const block = `${heading}\n\n${text.trim()}\n`;

        // Read existing if any, then append. We tolerate a 404 because
        // the daily file is created on first capture of that day.
        let prior = "";
        let priorSha: string | undefined;
        try {
          const existing = await nk.vault.readFile(targetPath);
          prior = existing.content ?? "";
          priorSha = existing.sha ?? undefined;
        } catch {
          // missing — that's fine, first capture of the day.
        }

        const nextContent = prior
          ? `${prior.replace(/\s+$/, "")}\n\n${block}`
          : `# Inbox — ${today}\n\n${block}`;

        await nk.vault.writeFile(
          targetPath,
          nextContent,
          commitMessage ?? `notekit: inbox capture ${stamp}`,
          priorSha,
        );
        return textContent(`Captured to ${targetPath}`);
      } catch (err) {
        return errorContent(`inbox_append failed: ${(err as Error).message}`);
      }
    },
  );
}
