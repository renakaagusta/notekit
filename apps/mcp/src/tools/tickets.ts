// Ticket tools — list, create, update tickets in the active scope.
// Tickets live at `<writePrefix><id>.md` with YAML frontmatter that maps
// 1:1 to the `Ticket` shape from `@notekit/core`. Scope rules mirror
// notes_*: project-default with read-everywhere fallback, see
// `lib/scope.ts`.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import {
  encryptedSkippedNote,
  errorContent,
  isEncryptedItemPath,
  jsonContent,
  listVaultFiles,
  textContent,
} from "../lib/notekit.js";
import { parseMarkdown, serializeMarkdown } from "../lib/markdown.js";
import { resolveProjectContext } from "../lib/project.js";
import { isUnderAnyPrefix, resolveScope } from "../lib/scope.js";
import { randomBytes } from "node:crypto";
import { vaultIsEncrypted, encryptTicket, decryptTicket } from "../lib/crypto.js";
import type { Ticket } from "@notekit/core/types";

function newItemId(): string {
  return randomBytes(8).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
}

const STATUSES = ["todo", "in_progress", "blocked", "done", "archived"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const SCOPE_VALUES = ["project", "global", "all"] as const;

const scopeSchema = z
  .enum(SCOPE_VALUES)
  .optional()
  .describe(
    "Where to look. `project` (default) scopes to the active `.notekit` project, with fallback reads from top-level tickets. `global` is top-level only. `all` is everything.",
  );

const projectSchema = z
  .string()
  .optional()
  .describe(
    "Override the active project slug for this call. Implies `scope` defaults to `project`.",
  );

export function registerTicketTools(server: McpServer, nk: NoteKitApi): void {
  server.registerTool(
    "tickets_list",
    {
      title: "List tickets",
      description:
        "List tickets in the active scope, optionally filtered by status, priority, or assignee. Returns a compact summary. Use this when the user asks 'what am I working on', 'show me open tickets', or before tickets_create to check for duplicates. Scope-aware (see `scope`).",
      inputSchema: {
        status: z.enum(STATUSES).optional().describe("Filter by ticket status."),
        priority: z.enum(PRIORITIES).optional().describe("Filter by priority."),
        assignee: z.string().optional().describe("Filter by assignee username."),
        limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)."),
        scope: scopeSchema,
        project: projectSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ status, priority, assignee, limit, scope, project }) => {
      const max = limit ?? 25;
      try {
        const ctx = resolveProjectContext();
        const resolved = resolveScope("tickets", { scope, project, ctx });
        const candidatePaths = await collectCandidatePaths(nk, resolved.readPrefixes);
        const tickets: Record<string, unknown>[] = [];
        let encryptedSkipped = 0;
        for (const filePath of candidatePaths) {
          // Encrypted ticket → decrypt (if unlocked) and include; else skip.
          if (isEncryptedItemPath(filePath)) {
            let t = null;
            try {
              const file = await nk.vault.readFile(filePath);
              t = file.content ? await decryptTicket(filePath, file.content) : null;
            } catch {
              t = null;
            }
            if (!t) {
              encryptedSkipped++;
              continue;
            }
            if (status && t.status !== status) continue;
            if (priority && t.priority !== priority) continue;
            if (assignee && t.assignee !== assignee) continue;
            tickets.push({
              path: filePath,
              title: t.title,
              status: t.status,
              priority: t.priority,
              assignee: t.assignee,
              labels: t.labels,
              dueDate: t.dueDate,
              snippet: t.body.slice(0, 160).trim(),
            });
            if (tickets.length >= max) break;
            continue;
          }
          if (!filePath.endsWith(".md")) continue;
          const file = await nk.vault.readFile(filePath);
          const { frontmatter, body } = parseMarkdown(file.content ?? "");
          if (status && frontmatter["status"] !== status) continue;
          if (priority && frontmatter["priority"] !== priority) continue;
          if (assignee && frontmatter["assignee"] !== assignee) continue;
          tickets.push({
            path: filePath,
            title: frontmatter["title"] ?? deriveTitle(filePath),
            status: frontmatter["status"] ?? "todo",
            priority: frontmatter["priority"] ?? "medium",
            assignee: frontmatter["assignee"] ?? null,
            labels: frontmatter["labels"] ?? [],
            dueDate: frontmatter["dueDate"] ?? null,
            snippet: body.slice(0, 160).trim(),
          });
          if (tickets.length >= max) break;
        }
        return jsonContent({
          count: tickets.length,
          scope: resolved.effective,
          project: resolved.project,
          tickets,
          ...(encryptedSkippedNote(encryptedSkipped, "ticket") ?? {}),
        });
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
        "Create a new ticket. Default path is `<writePrefix><slugified-title>.md` (project-scoped folder if a `.notekit` marker is present). Defaults: status=`todo`, priority=`medium`.",
      inputSchema: {
        title: z.string().min(1).describe("Ticket title."),
        body: z.string().optional().describe("Optional Markdown description."),
        status: z.enum(STATUSES).optional().describe("Initial status (default `todo`)."),
        priority: z.enum(PRIORITIES).optional().describe("Priority (default `medium`)."),
        assignee: z.string().optional().describe("Assignee username."),
        labels: z.array(z.string()).optional().describe("Label list."),
        dueDate: z.string().optional().describe("ISO 8601 due date."),
        path: z.string().optional().describe("Override absolute vault path."),
        commitMessage: z.string().optional().describe("Git commit message."),
        scope: scopeSchema,
        project: projectSchema,
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      try {
        const now = new Date().toISOString();
        // Born-E2EE vault → seal as an opaque tickets/<id>.md.age (#49).
        if (await vaultIsEncrypted()) {
          const id = newItemId();
          const ticket: Ticket = {
            id,
            path: `tickets/${id}.md.age`,
            title: args.title,
            body: args.body ?? "",
            status: args.status ?? "todo",
            priority: args.priority ?? "medium",
            assignee: args.assignee ?? null,
            labels: args.labels ?? [],
            linkedNotes: [],
            createdAt: now,
            updatedAt: now,
            dueDate: args.dueDate ?? null,
            createdBy: null,
          };
          const sealed = await encryptTicket(ticket);
          await nk.vault.writeFile(
            ticket.path,
            sealed,
            args.commitMessage ?? `notekit: open ticket ${args.title}`,
          );
          return textContent(`Created encrypted ticket at ${ticket.path}`);
        }
        const ctx = resolveProjectContext();
        const resolved = resolveScope("tickets", {
          scope: args.scope,
          project: args.project,
          ctx,
        });
        const targetPath =
          args.path ?? `${resolved.writePrefix}${slugify(args.title)}.md`;
        const frontmatter: Record<string, unknown> = {
          title: args.title,
          status: args.status ?? "todo",
          priority: args.priority ?? "medium",
          assignee: args.assignee ?? null,
          labels: args.labels ?? [],
          dueDate: args.dueDate ?? null,
          createdAt: now,
          updatedAt: now,
        };
        if (resolved.project && targetPath.startsWith(`projects/${resolved.project}/`)) {
          frontmatter["project"] = resolved.project;
        }
        const content = serializeMarkdown({ frontmatter, body: args.body ?? "" });
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
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ path, body, commitMessage, ...patch }) => {
      try {
        const existing = await nk.vault.readFile(path);
        // Encrypted ticket → decrypt, patch, re-encrypt (#49).
        if (existing.content && isEncryptedItemPath(path)) {
          const ticket = await decryptTicket(path, existing.content);
          if (!ticket) return errorContent(`tickets_update: couldn't decrypt ${path}`);
          if (body !== undefined) ticket.body = body;
          if (patch.title !== undefined) ticket.title = patch.title;
          if (patch.status !== undefined) ticket.status = patch.status;
          if (patch.priority !== undefined) ticket.priority = patch.priority;
          if (patch.assignee !== undefined) ticket.assignee = patch.assignee;
          if (patch.labels !== undefined) ticket.labels = patch.labels;
          if (patch.dueDate !== undefined) ticket.dueDate = patch.dueDate;
          ticket.updatedAt = new Date().toISOString();
          const sealed = await encryptTicket(ticket);
          await nk.vault.writeFile(
            path,
            sealed,
            commitMessage ?? `notekit: update ticket ${path}`,
            existing.sha ?? undefined,
          );
          return textContent(`Updated ${path}`);
        }
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

  server.registerTool(
    "tickets_delete",
    {
      title: "Delete ticket",
      description:
        "Delete a ticket. The deletion is committed to Git — it stays in history. Use when the user wants to remove a ticket entirely (not just close it — for that, use `tickets_update` with `status: 'archived'`).",
      inputSchema: {
        path: z.string().min(1).describe("Vault path of the ticket."),
        commitMessage: z.string().optional().describe("Git commit message."),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ path, commitMessage }) => {
      try {
        const file = await nk.vault.readFile(path);
        if (!file.sha) {
          return errorContent(
            `tickets_delete: ${path} has no SHA — refusing to delete to avoid surprises.`,
          );
        }
        await nk.vault.deleteFile(path, file.sha, commitMessage ?? `notekit: delete ticket ${path}`);
        return textContent(`Deleted ${path}`);
      } catch (err) {
        return errorContent(`tickets_delete failed: ${(err as Error).message}`);
      }
    },
  );
}

async function collectCandidatePaths(
  nk: NoteKitApi,
  prefixes: string[],
): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const prefix of prefixes) {
    const entries = await listVaultFiles(nk, prefix);
    for (const entry of entries) {
      if (!isUnderAnyPrefix(entry.path, [prefix])) continue;
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      out.push(entry.path);
    }
  }
  return out;
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
