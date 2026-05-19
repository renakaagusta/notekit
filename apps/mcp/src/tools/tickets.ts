// Ticket tools — list, create, update tickets. Tickets live at
// `tickets/<id>.md` with YAML frontmatter that maps 1:1 to the
// `Ticket` shape from @notekit/core.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import { errorContent, jsonContent, listVaultFiles, textContent } from "../lib/notekit.js";
import { parseMarkdown, serializeMarkdown } from "../lib/markdown.js";

const TICKETS_PREFIX = "tickets/";

const STATUSES = ["todo", "in_progress", "blocked", "done", "archived"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export function registerTicketTools(server: McpServer, nk: NoteKitApi): void {
  server.registerTool(
    "tickets_list",
    {
      title: "List tickets",
      description:
        "List tickets in the selected vault, optionally filtered by status, priority, or assignee. Returns a compact summary. Use this when the user asks 'what am I working on', 'show me open tickets', or before tickets_create to check for duplicates.",
      inputSchema: {
        status: z.enum(STATUSES).optional().describe("Filter by ticket status."),
        priority: z.enum(PRIORITIES).optional().describe("Filter by priority."),
        assignee: z.string().optional().describe("Filter by assignee username."),
        limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)."),
      },
    },
    async ({ status, priority, assignee, limit }) => {
      const max = limit ?? 25;
      try {
        const entries = await listVaultFiles(nk, TICKETS_PREFIX);
        const tickets: Record<string, unknown>[] = [];
        for (const entry of entries) {
          if (!entry.path.endsWith(".md")) continue;
          const file = await nk.vault.readFile(entry.path);
          const { frontmatter, body } = parseMarkdown(file.content ?? "");
          if (status && frontmatter["status"] !== status) continue;
          if (priority && frontmatter["priority"] !== priority) continue;
          if (assignee && frontmatter["assignee"] !== assignee) continue;
          tickets.push({
            path: entry.path,
            title: frontmatter["title"] ?? deriveTitle(entry.path),
            status: frontmatter["status"] ?? "todo",
            priority: frontmatter["priority"] ?? "medium",
            assignee: frontmatter["assignee"] ?? null,
            labels: frontmatter["labels"] ?? [],
            dueDate: frontmatter["dueDate"] ?? null,
            snippet: body.slice(0, 160).trim(),
          });
          if (tickets.length >= max) break;
        }
        return jsonContent({ count: tickets.length, tickets });
      } catch (err) {
        return errorContent(`tickets_list failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "tickets_create",
    {
      title: "Create ticket",
      description:
        "Create a new ticket in the selected vault. Use when the user wants to track work, file a bug, or create a TODO. Defaults: status=`todo`, priority=`medium`.",
      inputSchema: {
        title: z.string().min(1).describe("Ticket title."),
        body: z.string().optional().describe("Optional Markdown description."),
        status: z.enum(STATUSES).optional().describe("Initial status (default `todo`)."),
        priority: z.enum(PRIORITIES).optional().describe("Priority (default `medium`)."),
        assignee: z.string().optional().describe("Assignee username."),
        labels: z.array(z.string()).optional().describe("Label list."),
        dueDate: z.string().optional().describe("ISO 8601 due date."),
        path: z.string().optional().describe("Override path (default `tickets/<slug>.md`)."),
        commitMessage: z.string().optional().describe("Git commit message."),
      },
    },
    async (args) => {
      try {
        const now = new Date().toISOString();
        const targetPath = args.path ?? `${TICKETS_PREFIX}${slugify(args.title)}.md`;
        const content = serializeMarkdown({
          frontmatter: {
            title: args.title,
            status: args.status ?? "todo",
            priority: args.priority ?? "medium",
            assignee: args.assignee ?? null,
            labels: args.labels ?? [],
            dueDate: args.dueDate ?? null,
            createdAt: now,
            updatedAt: now,
          },
          body: args.body ?? "",
        });
        await nk.vault.writeFile(
          targetPath,
          content,
          args.commitMessage ?? `notekit: open ticket ${args.title}`,
        );
        return textContent(`Created ticket at ${targetPath}`);
      } catch (err) {
        return errorContent(`tickets_create failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "tickets_update",
    {
      title: "Update ticket",
      description:
        "Update a ticket's status, priority, assignee, labels, due date, or body. Use when the user moves a ticket between columns ('mark X done'), reassigns it, or edits the description.",
      inputSchema: {
        path: z.string().min(1).describe("Vault path of the ticket."),
        title: z.string().optional(),
        status: z.enum(STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        assignee: z.string().nullable().optional(),
        labels: z.array(z.string()).optional(),
        dueDate: z.string().nullable().optional(),
        body: z.string().optional().describe("Replace ticket body."),
        commitMessage: z.string().optional(),
      },
    },
    async ({ path, body, commitMessage, ...patch }) => {
      try {
        const existing = await nk.vault.readFile(path);
        const parsed = parseMarkdown(existing.content ?? "");
        const fm: Record<string, unknown> = { ...parsed.frontmatter };
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) continue;
          fm[k] = v;
        }
        fm["updatedAt"] = new Date().toISOString();
        const nextContent = serializeMarkdown({
          frontmatter: fm,
          body: body ?? parsed.body,
        });
        await nk.vault.writeFile(
          path,
          nextContent,
          commitMessage ?? `notekit: update ticket ${path}`,
          existing.sha ?? undefined,
        );
        return textContent(`Updated ${path}`);
      } catch (err) {
        return errorContent(`tickets_update failed: ${(err as Error).message}`);
      }
    },
  );
}

function deriveTitle(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/, "");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}
