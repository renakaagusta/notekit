// Ticket tools — list, create, update tickets in the active scope.
// Tickets live at `<writePrefix><id>.md` with YAML frontmatter that maps
// 1:1 to the `Ticket` shape from `@notekit/core`. Scope rules mirror
// notes_*: project-default with read-everywhere fallback, see
// `lib/scope.ts`.

import { randomBytes } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import { mapWithConcurrency } from "@notekit/core/concurrency";
import { slugify } from "@notekit/core/paths";
import {
  canReparent,
  childrenOf,
} from "@notekit/core/ticket-hierarchy";
import { deriveTicketKey } from "@notekit/core/ticket-key";
import type { Ticket, TicketStatus } from "@notekit/core/types";
import type { VaultCiphertextCache } from "@notekit/core/vault-e2ee";
import { z } from "zod";
import { vaultIsEncrypted, encryptTicket, decryptTicket, parseMarkdown, serializeMarkdown ,
  diskCiphertextCache,
  encryptedSkippedNote,
  errorContent,
  isEncryptedItemPath,
  jsonContent,
  listVaultFiles,
  textContent, resolveProjectContext , isUnderAnyPrefix, resolveScope  } from "../../../composition/index.js";

function newItemId(): string {
  return randomBytes(8).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
}

/** A vault file's path plus its content-addressed git blob sha. */
interface VaultEntry {
  path: string;
  sha: string;
}

/**
 * How many ciphertext files to fetch at once when scanning. Bounded so we don't
 * burst the git backend. Mirrors the shared core scan.
 */
const READ_CONCURRENCY = 8;

/**
 * Process-wide ciphertext cache (content-addressed by blob sha). A long-lived
 * MCP server reuses it across tool calls; a warm blob is served from disk with
 * no network read. Undefined when caching is disabled.
 */
const ciphertextCache: VaultCiphertextCache | undefined = diskCiphertextCache();

/**
 * Fetch a file's content, serving `.age` ciphertext from the cache when its blob
 * sha is already known (zero network) and warming it on a miss. Plaintext files
 * aren't content-addressed here, so they always read through.
 */
async function readVaultContent(
  nk: NoteKitApi,
  entry: VaultEntry,
): Promise<string | undefined> {
  const cacheable = ciphertextCache && isEncryptedItemPath(entry.path);
  if (cacheable) {
    const hit = await ciphertextCache.get(entry.sha);
    if (hit !== undefined) return hit;
  }
  const file = await nk.vault.readFile(entry.path);
  const content = file.content ?? undefined;
  if (cacheable && content !== undefined) await ciphertextCache.put(entry.sha, content);
  return content;
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

interface TicketFilters {
  status: (typeof STATUSES)[number] | undefined;
  priority: (typeof PRIORITIES)[number] | undefined;
  assignee: string | undefined;
}

type TicketRecord = Record<string, unknown>;

// eslint-disable-next-line max-lines-per-function -- registers multiple MCP tools; each tool handler is a self-contained unit and cannot be extracted without breaking the registration pattern
export function registerTicketTools(server: McpServer, nk: NoteKitApi): void {
  server.registerTool(
    "tasks_list",
    {
      title: "List tasks",
      description:
        "List tasks in the active scope, optionally filtered by status, priority, or assignee. Top-level tasks only by default — pass `parent` (a task id/key/path) to list that task's subtasks. Each row carries `parentId` and `childCount`. Use before tasks_create to check for duplicates. Scope-aware (see `scope`).",
      inputSchema: {
        status: z.enum(STATUSES).optional().describe("Filter by ticket status."),
        priority: z.enum(PRIORITIES).optional().describe("Filter by priority."),
        assignee: z.string().optional().describe("Filter by assignee username."),
        parent: z.string().optional().describe("List the subtasks of this task (its id, key, or path) instead of the top level."),
        limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)."),
        scope: scopeSchema,
        project: projectSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ status, priority, assignee, parent, limit, scope, project }) => {
      const max = limit ?? 25;
      try {
        const ctx = resolveProjectContext();
        const resolved = resolveScope("tickets", { scope, project, ctx });
        const nodes = await loadTicketNodes(nk, resolved.readPrefixes);
        const parentId = parent ? resolveParentId(nodes, parent) : undefined;
        // Scope to a parent's subtasks, else the top level (tasks with no parent).
        // Reuse each node's sha so runTicketList's reads hit the warm cache that
        // loadTicketNodes just populated (no second download).
        const scoped: VaultEntry[] = (parentId
          ? childrenOf(parentId, nodes)
          : nodes.filter((n) => !n.parentId)
        ).map((n) => ({ path: n.path, sha: n.sha }));
        const filters: TicketFilters = { status, priority, assignee };
        const { tickets, encryptedSkipped } = await runTicketList(nk, scoped, filters, max);
        for (const t of tickets) {
          t["childCount"] = childrenOf(String(t["id"]), nodes).length;
        }
        return jsonContent({
          count: tickets.length,
          scope: resolved.effective,
          project: resolved.project,
          ...(parentId ? { parent: parentId } : {}),
          tickets,
          ...(encryptedSkippedNote(encryptedSkipped, "ticket") ?? {}),
        });
      } catch (err) {
        return errorContent(`tasks_list failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "tasks_read",
    {
      title: "Read task",
      description:
        "Read the full contents of a task by vault-relative path (e.g. `tickets/fix-login-bug.md` or `projects/notekit/tickets/NK-42.md`). Returns frontmatter fields and the Markdown body. Use this after tasks_list, or when the user names a specific task.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Vault-relative path, e.g. `tickets/fix-login-bug.md`."),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ path }) => {
      try {
        const file = await nk.vault.readFile(path);
        // Encrypted ticket → decrypt with NOTEKIT_RECOVERY_PHRASE (#49).
        if (file.content && isEncryptedItemPath(path)) {
          const ticket = await decryptTicket(path, file.content);
          if (!ticket) return errorContent(`tasks_read: couldn't decrypt ${path}`);
          const children = childSummaries(ticket.id, await loadTicketNodes(nk, ["tickets/"]));
          return jsonContent({
            path,
            sha: file.sha,
            frontmatter: {
              title: ticket.title,
              ...(ticket.key ? { key: ticket.key } : {}),
              ...(ticket.parentId ? { parentId: ticket.parentId } : {}),
              status: ticket.status,
              priority: ticket.priority,
              assignee: ticket.assignee,
              labels: ticket.labels,
              dueDate: ticket.dueDate,
              createdAt: ticket.createdAt,
              updatedAt: ticket.updatedAt,
            },
            body: ticket.body,
            children,
          });
        }
        const parsed = parseMarkdown(file.content ?? "");
        const id = parsed.frontmatter["id"] ? String(parsed.frontmatter["id"]) : deriveTitle(path);
        const children = childSummaries(id, await loadTicketNodes(nk, [parentPrefix(path)]));
        return jsonContent({
          path: file.path,
          sha: file.sha,
          frontmatter: parsed.frontmatter,
          body: parsed.body,
          children,
        });
      } catch (err) {
        return errorContent(`tasks_read failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "tasks_create",
    {
      title: "Create task",
      description:
        "Create a new task. Default path is `<writePrefix><slugified-title>.md` (project-scoped folder if a `.notekit` marker is present). Defaults: status=`todo`, priority=`medium`.",
      inputSchema: {
        title: z.string().min(1).describe("Ticket title."),
        key: z.string().optional().describe("Human-friendly key (slug). Auto-derived from the title if omitted; de-duped per vault."),
        parent: z.string().optional().describe("Make this a subtask: the id, key, or path of the parent task."),
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
    // eslint-disable-next-line complexity -- handler branches on encrypted vs plaintext path plus all optional fields
    async (args) => {
      try {
        const now = new Date().toISOString();
        // Born-E2EE vault → seal as an opaque tickets/<id>.md.age (#49).
        if (await vaultIsEncrypted()) {
          const id = newItemId();
          const nodes = await loadTicketNodes(nk, ["tickets/"]);
          const key = deriveTicketKey(args.title, keysOf(nodes), args.key);
          const parentId = args.parent ? resolveParentId(nodes, args.parent) : undefined;
          const ticket: Ticket = {
            id,
            key,
            ...(parentId ? { parentId } : {}),
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
          const kind = parentId ? "subtask" : "ticket";
          return textContent(`Created encrypted ${kind} ${key} at ${ticket.path}`);
        }
        const ctx = resolveProjectContext();
        const resolved = resolveScope("tickets", {
          scope: args.scope,
          project: args.project,
          ctx,
        });
        const targetPath =
          args.path ?? `${resolved.writePrefix}${slugify(args.title)}.md`;
        const nodes = await loadTicketNodes(nk, resolved.readPrefixes);
        const key = deriveTicketKey(args.title, keysOf(nodes), args.key);
        const parentId = args.parent ? resolveParentId(nodes, args.parent) : undefined;
        const frontmatter: Record<string, unknown> = {
          title: args.title,
          key,
          ...(parentId ? { parentId } : {}),
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
        return textContent(`Created ${parentId ? "subtask" : "ticket"} ${key} at ${targetPath}`);
      } catch (err) {
        return errorContent(`tasks_create failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "tasks_update",
    {
      title: "Update task",
      description:
        "Update a task's status, priority, assignee, labels, due date, or body. Use when the user moves a task between columns ('mark X done'), reassigns it, or edits the description.",
      inputSchema: {
        path: z.string().min(1).describe("Vault path of the ticket."),
        title: z.string().optional(),
        key: z.string().optional().describe("Rename the human-friendly key (slug). Slugged + de-duped per vault."),
        parent: z.string().nullable().optional().describe("Reparent this task under another (id/key/path); `null` promotes it to the top level. Cycle-guarded."),
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
    async ({ path, body, commitMessage, parent, ...patch }) => {
      try {
        const existing = await nk.vault.readFile(path);
        const ok =
          existing.content && isEncryptedItemPath(path)
            ? await updateEncryptedTicket(nk, path, existing, { body, commitMessage, parent, patch })
            : await updatePlaintextTicket(nk, path, existing, { body, commitMessage, parent, patch });
        return ok
          ? textContent(`Updated ${path}`)
          : errorContent(`tasks_update: couldn't decrypt ${path}`);
      } catch (err) {
        return errorContent(`tasks_update failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "tasks_delete",
    {
      title: "Delete task",
      description:
        "Delete a task. Its subtasks are promoted to the top level (not deleted). The deletion is committed to Git — it stays in history. Use when the user wants to remove a task entirely (not just close it — for that, use `tasks_update` with `status: 'archived'`).",
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
            `tasks_delete: ${path} has no SHA — refusing to delete to avoid surprises.`,
          );
        }
        const promoted = await promoteChildrenOf(nk, path);
        await nk.vault.deleteFile(path, file.sha, commitMessage ?? `notekit: delete ticket ${path}`);
        const note = promoted > 0 ? ` (${promoted} subtask(s) promoted to top level)` : "";
        return textContent(`Deleted ${path}${note}`);
      } catch (err) {
        return errorContent(`tasks_delete failed: ${(err as Error).message}`);
      }
    },
  );
}

/**
 * Clear the parent link on every direct child of the ticket at `path`, so
 * deleting the parent promotes them to the top level instead of orphaning them.
 * Returns the number promoted.
 */
async function promoteChildrenOf(nk: NoteKitApi, path: string): Promise<number> {
  const prefix = isEncryptedItemPath(path) ? "tickets/" : parentPrefix(path);
  const nodes = await loadTicketNodes(nk, [prefix]);
  const self = nodes.find((n) => n.path === path);
  if (!self) return 0;
  const children = childrenOf(self.id, nodes);
  for (const child of children) await clearParentLink(nk, child.path);
  return children.length;
}

interface VaultFileRef {
  content?: string | null;
  sha?: string | null;
}

interface TicketUpdate {
  body?: string;
  commitMessage?: string;
  parent?: string | null;
  patch: TicketPatch & { key?: string };
}

/** Decrypt → patch (key/parent/fields) → re-encrypt. Returns false if it can't decrypt. */
async function updateEncryptedTicket(
  nk: NoteKitApi,
  path: string,
  existing: VaultFileRef,
  { body, commitMessage, parent, patch }: TicketUpdate,
): Promise<boolean> {
  const ticket = existing.content ? await decryptTicket(path, existing.content) : null;
  if (!ticket) return false;
  if (patch.key !== undefined) {
    const others = (await collectExistingKeys(nk, ["tickets/"])).filter((k) => k !== ticket.key);
    ticket.key = deriveTicketKey(ticket.title, others, patch.key);
  }
  if (parent !== undefined) {
    ticket.parentId = reparentTarget(ticket.id, parent, await loadTicketNodes(nk, ["tickets/"]));
  }
  applyTicketPatch(ticket, body, patch);
  ticket.updatedAt = new Date().toISOString();
  await nk.vault.writeFile(
    path,
    await encryptTicket(ticket),
    commitMessage ?? `notekit: update ticket ${path}`,
    existing.sha ?? undefined,
  );
  return true;
}

/** Patch plaintext frontmatter (key/parent/fields) and rewrite. Always succeeds. */
async function updatePlaintextTicket(
  nk: NoteKitApi,
  path: string,
  existing: VaultFileRef,
  { body, commitMessage, parent, patch }: TicketUpdate,
): Promise<boolean> {
  const parsed = parseMarkdown(existing.content ?? "");
  const fm: Record<string, unknown> = { ...parsed.frontmatter };
  if (parent !== undefined) {
    const selfId = fm["id"] ? String(fm["id"]) : deriveTitle(path);
    const pid = reparentTarget(selfId, parent, await loadTicketNodes(nk, [parentPrefix(path)]));
    if (pid) fm["parentId"] = pid;
    else delete fm["parentId"];
  }
  await applyFrontmatterPatch(nk, path, fm, patch as Record<string, unknown>);
  fm["updatedAt"] = new Date().toISOString();
  await nk.vault.writeFile(
    path,
    serializeMarkdown({ frontmatter: fm, body: body ?? parsed.body }),
    commitMessage ?? `notekit: update ticket ${path}`,
    existing.sha ?? undefined,
  );
  return true;
}

/** Remove the `parentId` from a single ticket file, encrypted or plaintext. */
async function clearParentLink(nk: NoteKitApi, path: string): Promise<void> {
  const existing = await nk.vault.readFile(path);
  const now = new Date().toISOString();
  if (isEncryptedItemPath(path)) {
    const ticket = existing.content ? await decryptTicket(path, existing.content) : null;
    if (!ticket) return;
    ticket.parentId = undefined;
    ticket.updatedAt = now;
    await nk.vault.writeFile(
      path,
      await encryptTicket(ticket),
      `notekit: promote subtask ${path}`,
      existing.sha ?? undefined,
    );
    return;
  }
  const parsed = parseMarkdown(existing.content ?? "");
  const fm: Record<string, unknown> = { ...parsed.frontmatter };
  delete fm["parentId"];
  fm["updatedAt"] = now;
  await nk.vault.writeFile(
    path,
    serializeMarkdown({ frontmatter: fm, body: parsed.body }),
    `notekit: promote subtask ${path}`,
    existing.sha ?? undefined,
  );
}

async function collectCandidatePaths(
  nk: NoteKitApi,
  prefixes: string[],
): Promise<VaultEntry[]> {
  const seen = new Set<string>();
  const out: VaultEntry[] = [];
  for (const prefix of prefixes) {
    const entries = await listVaultFiles(nk, prefix);
    for (const entry of entries) {
      if (!isUnderAnyPrefix(entry.path, [prefix])) continue;
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      out.push({ path: entry.path, sha: entry.sha });
    }
  }
  return out;
}

function deriveTitle(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/, "");
}

function parentPrefix(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index + 1) : "";
}

/**
 * Apply a tasks_update patch onto plaintext frontmatter in place. A `key` field
 * is a rename: slugged + de-duped against the other tickets in its folder.
 */
async function applyFrontmatterPatch(
  nk: NoteKitApi,
  path: string,
  fm: Record<string, unknown>,
  patch: Record<string, unknown>,
): Promise<void> {
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (field === "key") {
      const others = (await collectExistingKeys(nk, [parentPrefix(path)])).filter(
        (key) => key !== fm["key"],
      );
      fm["key"] = deriveTicketKey(String(fm["title"] ?? ""), others, String(value));
      continue;
    }
    fm[field] = value;
  }
}

interface TicketNode {
  id: string;
  key?: string;
  parentId?: string;
  status: TicketStatus;
  title: string;
  path: string;
  sha: string;
}

/**
 * A flat view of every ticket under the given prefixes with just the fields the
 * hierarchy + key logic need. Reads are fanned out (bounded) and cache-served.
 * Best-effort: unreadable/locked tickets are skipped rather than aborting.
 */
async function loadTicketNodes(nk: NoteKitApi, prefixes: string[]): Promise<TicketNode[]> {
  const entries = await collectCandidatePaths(nk, prefixes);
  const nodes = await mapWithConcurrency(entries, READ_CONCURRENCY, (e) =>
    tryReadTicketNode(nk, e),
  );
  return nodes.filter((n): n is TicketNode => n !== null);
}

/** One ticket file → a hierarchy node, or null when it isn't a readable ticket. */
async function tryReadTicketNode(nk: NoteKitApi, entry: VaultEntry): Promise<TicketNode | null> {
  try {
    const content = await readVaultContent(nk, entry);
    if (isEncryptedItemPath(entry.path)) {
      const t = content ? await decryptTicket(entry.path, content) : null;
      return t
        ? { id: t.id, key: t.key, parentId: t.parentId, status: t.status, title: t.title, path: entry.path, sha: entry.sha }
        : null;
    }
    if (!entry.path.endsWith(".md")) return null;
    const { frontmatter } = parseMarkdown(content ?? "");
    return {
      id: frontmatter["id"] ? String(frontmatter["id"]) : deriveTitle(entry.path),
      key: frontmatter["key"] ? String(frontmatter["key"]) : undefined,
      parentId: frontmatter["parentId"] ? String(frontmatter["parentId"]) : undefined,
      status: (frontmatter["status"] as TicketStatus) ?? "todo",
      title: String(frontmatter["title"] ?? deriveTitle(entry.path)),
      path: entry.path,
      sha: entry.sha,
    };
  } catch {
    return null; // unreadable/locked ticket
  }
}

/** The human-friendly keys already taken among the given nodes. */
function keysOf(nodes: TicketNode[]): string[] {
  return nodes.map((n) => n.key).filter((k): k is string => Boolean(k));
}

/** The human-friendly keys already taken across the given prefixes. */
async function collectExistingKeys(nk: NoteKitApi, prefixes: string[]): Promise<string[]> {
  return keysOf(await loadTicketNodes(nk, prefixes));
}

/** Resolve a parent reference (id, key, or path) to its immutable ticket id. */
function resolveParentId(nodes: TicketNode[], ref: string): string {
  const match = nodes.find((n) => n.id === ref || n.key === ref || n.path === ref);
  if (!match) throw new Error(`parent task not found: ${ref}`);
  return match.id;
}

/**
 * Resolve a reparent request to the new parent id. `null`/empty clears the
 * parent (promote to top level). Throws if the move would create a cycle.
 */
function reparentTarget(
  childId: string,
  parent: string | null,
  nodes: TicketNode[],
): string | undefined {
  if (parent === null || parent === "") return undefined;
  const parentId = resolveParentId(nodes, parent);
  if (!canReparent(childId, parentId, nodes)) {
    throw new Error(`reparenting ${childId} under ${parentId} would create a cycle`);
  }
  return parentId;
}

/** Compact child records for a parent, for tasks_read output. */
function childSummaries(parentId: string, nodes: TicketNode[]): TicketRecord[] {
  return childrenOf(parentId, nodes).map((c) => ({
    id: c.id,
    ...(c.key ? { key: c.key } : {}),
    title: c.title,
    status: c.status,
    path: c.path,
  }));
}

/**
 * Run the full ticket list loop over candidate paths.
 */
async function runTicketList(
  nk: NoteKitApi,
  candidates: VaultEntry[],
  filters: TicketFilters,
  max: number,
): Promise<{ tickets: TicketRecord[]; encryptedSkipped: number }> {
  const resolved = await mapWithConcurrency(candidates, READ_CONCURRENCY, (e) =>
    resolveTicketEntry(nk, e, filters),
  );
  const tickets: TicketRecord[] = [];
  let encryptedSkipped = 0;
  for (const entry of resolved) {
    if (entry === "encrypted-failed") { encryptedSkipped++; continue; }
    if (!entry) continue;
    tickets.push(entry);
    if (tickets.length >= max) break;
  }
  return { tickets, encryptedSkipped };
}

/**
 * Resolve a single candidate path for the ticket list loop.
 * Returns the ticket record (if matched), null (no match / not a ticket file),
 * or 'encrypted-failed' (locked vault).
 */
async function resolveTicketEntry(
  nk: NoteKitApi,
  entry: VaultEntry,
  filters: TicketFilters,
): Promise<TicketRecord | null | "encrypted-failed"> {
  if (isEncryptedItemPath(entry.path)) {
    const record = await tryDecryptAndReadTicket(nk, entry);
    if (record === "encrypted-failed") return "encrypted-failed";
    if (!record || !matchesTicketFilters(record, filters)) return null;
    return record;
  }
  if (!entry.path.endsWith(".md")) return null;
  const record = await readPlaintextTicket(nk, entry);
  return matchesTicketFilters(record, filters) ? record : null;
}

/**
 * Try to decrypt an encrypted ticket for the list handler.
 * Returns the ticket record on success, null when it doesn't decrypt, or
 * 'encrypted-failed' when the vault is locked / unreadable.
 */
async function tryDecryptAndReadTicket(
  nk: NoteKitApi,
  entry: VaultEntry,
): Promise<TicketRecord | null | "encrypted-failed"> {
  let t: Ticket | null = null;
  try {
    const content = await readVaultContent(nk, entry);
    t = content ? await decryptTicket(entry.path, content) : null;
  } catch {
    t = null;
  }
  if (!t) return "encrypted-failed";
  return {
    path: entry.path,
    id: t.id,
    ...(t.key ? { key: t.key } : {}),
    ...(t.parentId ? { parentId: t.parentId } : {}),
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee,
    labels: t.labels,
    dueDate: t.dueDate,
    snippet: t.body.slice(0, 160).trim(),
  };
}

/**
 * Read and parse a plaintext ticket for the list handler.
 */
async function readPlaintextTicket(
  nk: NoteKitApi,
  entry: VaultEntry,
): Promise<TicketRecord> {
  const content = await readVaultContent(nk, entry);
  const { frontmatter, body } = parseMarkdown(content ?? "");
  return {
    path: entry.path,
    id: frontmatter["id"] ?? deriveTitle(entry.path),
    ...(frontmatter["key"] ? { key: frontmatter["key"] } : {}),
    ...(frontmatter["parentId"] ? { parentId: frontmatter["parentId"] } : {}),
    title: frontmatter["title"] ?? deriveTitle(entry.path),
    status: frontmatter["status"] ?? "todo",
    priority: frontmatter["priority"] ?? "medium",
    assignee: frontmatter["assignee"] ?? null,
    labels: frontmatter["labels"] ?? [],
    dueDate: frontmatter["dueDate"] ?? null,
    snippet: body.slice(0, 160).trim(),
  };
}

function matchesTicketFilters(record: TicketRecord, filters: TicketFilters): boolean {
  if (filters.status && record["status"] !== filters.status) return false;
  if (filters.priority && record["priority"] !== filters.priority) return false;
  if (filters.assignee && record["assignee"] !== filters.assignee) return false;
  return true;
}

interface TicketPatch {
  title?: string;
  status?: (typeof STATUSES)[number];
  priority?: (typeof PRIORITIES)[number];
  assignee?: string | null;
  labels?: string[];
  dueDate?: string | null;
}

/**
 * Mutate a Ticket in-place with the fields from a tasks_update call.
 * Does NOT set updatedAt — the caller sets that after.
 */
function applyTicketPatch(
  ticket: Ticket,
  body: string | undefined,
  patch: TicketPatch,
): void {
  if (body !== undefined) ticket.body = body;
  if (patch.title !== undefined) ticket.title = patch.title;
  if (patch.status !== undefined) ticket.status = patch.status;
  if (patch.priority !== undefined) ticket.priority = patch.priority;
  if (patch.assignee !== undefined) ticket.assignee = patch.assignee;
  if (patch.labels !== undefined) ticket.labels = patch.labels;
  if (patch.dueDate !== undefined) ticket.dueDate = patch.dueDate;
}
