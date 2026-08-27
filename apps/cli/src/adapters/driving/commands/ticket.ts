// `notekit ticket <sub>` — CRUD over tickets. Tickets are `.md` with YAML
// frontmatter, see `packages/core/src/types/ticket.ts` for the canonical shape.
// They live under `tickets/` in the vault and share the same write-through-API
// model as notes.

import type { NoteKitApi } from "@notekit/api-client";
import {
  canReparent,
  childProgress,
  childrenOf,
} from "@notekit/core/ticket-hierarchy";
import { deriveTicketKey } from "@notekit/core/ticket-key";
import type { Ticket, TicketStatus, TicketPriority } from "@notekit/core/types";
import { defineCommand } from "citty";
import kleur from "kleur";
import { nanoid } from "nanoid";
import {
  dieWithError,
  vaultIsEncrypted,
  encryptTicket,
  decryptTicket,
  listEncryptedTickets,
  isEncrypted,
  openEditor,
  getSecretsClient,
} from "../../../composition/index.js";
import { parseFrontmatter, stringifyFrontmatter } from "../../../domain/frontmatter.js";

const TICKETS_DIR = "tickets";
const INDEX_PATH = `${TICKETS_DIR}/index.json`;

interface TicketIndexEntry {
  id: string;
  key?: string;
  parentId?: string;
  path: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee: string | null;
  updatedAt: string;
}

interface TicketIndex {
  tickets: TicketIndexEntry[];
}

const STATUSES: TicketStatus[] = ["todo", "in_progress", "blocked", "done", "archived"];
const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];

const newCmd = defineCommand({
  meta: { name: "new", description: "Create a new task." },
  args: {
    title: { type: "positional", description: "Task title.", required: true },
    body: { type: "string", description: "Body text (skip the editor).", required: false },
    priority: { type: "string", description: "low|medium|high|urgent (default medium).", required: false },
    assignee: { type: "string", description: "Assignee ref, e.g. user:abc or agent:xyz.", required: false },
    label: { type: "string", description: "Comma-separated labels.", required: false },
    key: { type: "string", description: "Human-friendly key (slug). Auto-derived from the title if omitted.", required: false },
    parent: { type: "string", description: "Make this a subtask of another task (its id or key).", required: false },
  },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });

      const priority = normalizePriority(args.priority);
      const id = nanoid(10);
      const now = new Date().toISOString();
      const body =
        args.body !== undefined
          ? String(args.body)
          : await openEditor({ seed: `# ${args.title}\n\n`, extension: ".md" });

      const labels = args.label
        ? String(args.label).split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const parentId = args.parent
        ? (await readTicket(nk, String(args.parent))).ticket.id
        : undefined;

      const key = deriveTicketKey(
        String(args.title),
        await listTicketKeys(nk),
        args.key ? String(args.key) : undefined,
      );

      const ticket: Omit<Ticket, "path"> = {
        id,
        key,
        ...(parentId ? { parentId } : {}),
        title: String(args.title),
        body,
        status: "todo",
        priority,
        assignee: args.assignee ? String(args.assignee) : null,
        labels,
        linkedNotes: [],
        createdAt: now,
        updatedAt: now,
        dueDate: null,
        createdBy: null,
      };
      const path = `${TICKETS_DIR}/${id}.md`;
      await writeTicket(nk, { ...ticket, path }, null);
      await updateIndex(nk, (idx) => {
        idx.tickets.unshift({
          id,
          key,
          ...(parentId ? { parentId } : {}),
          path,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          assignee: ticket.assignee,
          updatedAt: now,
        });
        return idx;
      });

      const kind = parentId ? "subtask" : "created";
      process.stdout.write(`${kleur.green(kind)} ${kleur.cyan(key)} ${kleur.dim(path)}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const listCmd = defineCommand({
  meta: { name: "list", description: "List tasks. Top-level only by default; use --parent for subtasks." },
  args: {
    status: { type: "string", description: "Filter: todo|in_progress|blocked|done|archived.", required: false },
    all: { type: "boolean", description: "Include archived/done.", required: false },
    parent: { type: "string", description: "List the subtasks of a task (its id or key) instead of the top level.", required: false },
  },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });
      const graph = await loadTicketGraph(nk);

      // Scope: a parent's direct children, else the top level (no parent).
      const parentId = args.parent
        ? (await readTicket(nk, String(args.parent))).ticket.id
        : undefined;
      let rows = parentId
        ? childrenOf(parentId, graph)
        : graph.filter((t) => !t.parentId);

      if (args.status) {
        const want = normalizeStatus(String(args.status));
        rows = rows.filter((t) => t.status === want);
      } else if (!args.all) {
        rows = rows.filter((t) => t.status !== "done" && t.status !== "archived");
      }
      if (rows.length === 0) {
        process.stdout.write(kleur.dim("(no tasks)\n"));
        return;
      }
      for (const t of rows) {
        const sub = childProgress(t.id, graph);
        const subBadge =
          sub.total > 0 ? `  ${kleur.dim(`[${sub.done}/${sub.total}]`)}` : "";
        process.stdout.write(
          `${kleur.cyan(t.key ?? t.id)}  ${badge(t.status)}  ${priorityBadge(t.priority)}${subBadge}  ${t.title}\n`,
        );
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

const showCmd = defineCommand({
  meta: { name: "show", description: "Show a task." },
  args: { id: { type: "positional", description: "Task id or path.", required: true } },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });
      const { ticket } = await readTicket(nk, String(args.id));
      const graph = await loadTicketGraph(nk);
      const ref = ticket.key ? `${kleur.cyan(ticket.key)} ${kleur.dim(`#${ticket.id}`)}` : kleur.dim(`#${ticket.id}`);
      process.stdout.write(`${kleur.bold(ticket.title)}  ${ref}\n`);
      process.stdout.write(`${badge(ticket.status)}  ${priorityBadge(ticket.priority)}`);
      if (ticket.assignee) process.stdout.write(`  ${kleur.cyan(ticket.assignee)}`);
      if (ticket.labels.length > 0) process.stdout.write(`  ${ticket.labels.map((l) => kleur.gray(`#${l}`)).join(" ")}`);
      if (ticket.parentId) {
        const parent = graph.find((t) => t.id === ticket.parentId);
        process.stdout.write(`\n${kleur.dim("subtask of")} ${kleur.cyan(parent?.key ?? ticket.parentId)}`);
      }
      process.stdout.write("\n\n");
      process.stdout.write(ticket.body);
      if (!ticket.body.endsWith("\n")) process.stdout.write("\n");
      const children = childrenOf(ticket.id, graph);
      if (children.length > 0) {
        const done = childProgress(ticket.id, graph);
        process.stdout.write(`\n${kleur.bold(`Subtasks ${done.done}/${done.total}`)}\n`);
        for (const c of children) {
          process.stdout.write(`  ${badge(c.status)}  ${kleur.cyan(c.key ?? c.id)}  ${c.title}\n`);
        }
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

const closeCmd = defineCommand({
  meta: { name: "close", description: "Mark a task as done." },
  args: { id: { type: "positional", description: "Task id or path.", required: true } },
  async run({ args }) {
    await transition(String(args.id), "done", "ticket: close");
  },
});

const reopenCmd = defineCommand({
  meta: { name: "reopen", description: "Move a task back to todo." },
  args: { id: { type: "positional", description: "Task id or path.", required: true } },
  async run({ args }) {
    await transition(String(args.id), "todo", "ticket: reopen");
  },
});

const assignCmd = defineCommand({
  meta: { name: "assign", description: "Set or clear the task assignee." },
  args: {
    id: { type: "positional", description: "Task id or path.", required: true },
    assignee: { type: "positional", description: "Assignee ref (user:id, agent:id, or `none`).", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });
      const { ticket, sha } = await readTicket(nk, String(args.id));
      const value = String(args.assignee);
      ticket.assignee = value === "none" || value === "" ? null : value;
      ticket.updatedAt = new Date().toISOString();
      await writeTicket(nk, ticket, sha);
      await updateIndex(nk, (idx) => {
        const row = idx.tickets.find((t) => t.id === ticket.id);
        if (row) {
          row.assignee = ticket.assignee;
          row.updatedAt = ticket.updatedAt;
        }
        return idx;
      });
      process.stdout.write(`${kleur.green("assigned")} ${ticket.id} -> ${ticket.assignee ?? "(none)"}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const renameCmd = defineCommand({
  meta: { name: "rename", description: "Change a task's human-friendly key (its slug)." },
  args: {
    id: { type: "positional", description: "Task id, key, or path.", required: true },
    key: { type: "positional", description: "New key (slug).", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });
      const { ticket, sha } = await readTicket(nk, String(args.id));
      const others = (await listTicketKeys(nk)).filter((k) => k !== ticket.key);
      const next = deriveTicketKey(ticket.title, others, String(args.key));
      ticket.key = next;
      ticket.updatedAt = new Date().toISOString();
      await writeTicket(nk, ticket, sha);
      await updateIndex(nk, (idx) => {
        const row = idx.tickets.find((t) => t.id === ticket.id);
        if (row) {
          row.key = next;
          row.updatedAt = ticket.updatedAt;
        }
        return idx;
      });
      process.stdout.write(`${kleur.green("renamed")} ${ticket.id} -> ${kleur.cyan(next)}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const reparentCmd = defineCommand({
  meta: { name: "reparent", description: "Move a task under another task (or to the top level)." },
  args: {
    id: { type: "positional", description: "Task id, key, or path.", required: true },
    parent: { type: "positional", description: "New parent id/key, or `none` for top level.", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });
      const { ticket, sha } = await readTicket(nk, String(args.id));
      const target = String(args.parent);
      let nextParent: string | undefined;
      if (target === "none" || target === "") {
        nextParent = undefined;
      } else {
        const parentId = (await readTicket(nk, target)).ticket.id;
        if (!canReparent(ticket.id, parentId, await loadTicketGraph(nk))) {
          throw new Error(`cannot reparent ${ticket.id} under ${parentId}: that would create a cycle`);
        }
        nextParent = parentId;
      }
      ticket.parentId = nextParent;
      ticket.updatedAt = new Date().toISOString();
      await writeTicket(nk, ticket, sha);
      await updateIndex(nk, (idx) => {
        const row = idx.tickets.find((t) => t.id === ticket.id);
        if (row) {
          row.parentId = nextParent;
          row.updatedAt = ticket.updatedAt;
        }
        return idx;
      });
      process.stdout.write(
        `${kleur.green("reparented")} ${ticket.id} -> ${nextParent ? kleur.cyan(nextParent) : kleur.dim("(top level)")}\n`,
      );
    } catch (err) {
      dieWithError(err);
    }
  },
});

const rmCmd = defineCommand({
  meta: { name: "rm", description: "Delete a task. Its subtasks are promoted to the top level." },
  args: {
    idOrPath: { type: "positional", description: "Task id or vault path.", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });
      const { ticket } = await readTicket(nk, String(args.idOrPath));
      // Promote direct children to the top level so nothing is lost.
      const children = childrenOf(ticket.id, await loadTicketGraph(nk));
      for (const child of children) {
        const { ticket: childTicket, sha: childSha } = await readTicket(nk, child.id);
        childTicket.parentId = undefined;
        childTicket.updatedAt = new Date().toISOString();
        await writeTicket(nk, childTicket, childSha);
        await updateIndex(nk, (idx) => {
          const row = idx.tickets.find((t) => t.id === child.id);
          if (row) row.parentId = undefined;
          return idx;
        });
      }
      const path = await resolveTicketPath(nk, String(args.idOrPath));
      const existing = await nk.vault.readFile(path);
      if (!existing.sha) {
        throw new Error(`cannot delete ${path}: no sha returned from server`);
      }
      await nk.vault.deleteFile(path, existing.sha, `ticket: delete ${path}`);
      // E2EE vaults have no plaintext index to maintain.
      if (!isEncrypted(path)) {
        await updateIndex(nk, (idx) => {
          idx.tickets = idx.tickets.filter((t) => t.path !== path);
          return idx;
        });
      }
      const note = children.length > 0 ? kleur.dim(` (${children.length} subtask(s) promoted)`) : "";
      process.stdout.write(`${kleur.yellow("removed")} ${path}${note}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

export const ticketCommand = defineCommand({
  meta: { name: "task", description: "Track work items as markdown tasks." },
  subCommands: {
    new: newCmd,
    list: listCmd,
    show: showCmd,
    close: closeCmd,
    reopen: reopenCmd,
    assign: assignCmd,
    rename: renameCmd,
    reparent: reparentCmd,
    rm: rmCmd,
  },
});

// ── helpers ────────────────────────────────────────────────────────────────

async function transition(idOrPath: string, status: TicketStatus, message: string): Promise<void> {
  try {
    const nk = await getSecretsClient({ requireAuth: true });
    const { ticket, sha } = await readTicket(nk, idOrPath);
    ticket.status = status;
    ticket.updatedAt = new Date().toISOString();
    await writeTicket(nk, ticket, sha);
    await updateIndex(nk, (idx) => {
      const row = idx.tickets.find((t) => t.id === ticket.id);
      if (row) {
        row.status = status;
        row.updatedAt = ticket.updatedAt;
      }
      return idx;
    });
    process.stdout.write(`${kleur.green(message)} ${ticket.id}\n`);
  } catch (err) {
    dieWithError(err);
  }
}

function normalizePriority(input: unknown): TicketPriority {
  if (!input) return "medium";
  const v = String(input).toLowerCase();
  if ((PRIORITIES as string[]).includes(v)) return v as TicketPriority;
  throw new Error(`invalid priority "${v}" — expected one of ${PRIORITIES.join(", ")}`);
}

function normalizeStatus(input: string): TicketStatus {
  const v = input.toLowerCase();
  if ((STATUSES as string[]).includes(v)) return v as TicketStatus;
  throw new Error(`invalid status "${v}" — expected one of ${STATUSES.join(", ")}`);
}

function badge(status: TicketStatus): string {
  switch (status) {
    case "todo": return kleur.gray("TODO");
    case "in_progress": return kleur.yellow("WIP");
    case "blocked": return kleur.red("BLOCK");
    case "done": return kleur.green("DONE");
    case "archived": return kleur.dim("ARCH");
  }
}

function priorityBadge(p: TicketPriority): string {
  switch (p) {
    case "low": return kleur.dim("p:low");
    case "medium": return kleur.cyan("p:med");
    case "high": return kleur.magenta("p:high");
    case "urgent": return kleur.red("p:urg");
  }
}

async function listTicketKeys(nk: NoteKitApi): Promise<string[]> {
  const rows = (await vaultIsEncrypted())
    ? await listEncryptedTickets(nk)
    : (await readIndex(nk)).index.tickets;
  return rows.map((t) => t.key).filter((k): k is string => Boolean(k));
}

interface TicketRow {
  id: string;
  key?: string;
  parentId?: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
}

/**
 * A flat view of every ticket with just the fields the hierarchy + list views
 * need. E2EE → scan + decrypt; plaintext → the index. Cheap enough to build the
 * parent/child tree on each command.
 */
async function loadTicketGraph(nk: NoteKitApi): Promise<TicketRow[]> {
  const rows = (await vaultIsEncrypted())
    ? await listEncryptedTickets(nk)
    : (await readIndex(nk)).index.tickets;
  return rows.map((t) => ({
    id: t.id,
    key: t.key,
    parentId: t.parentId,
    title: t.title,
    status: t.status,
    priority: t.priority,
  }));
}

async function readIndex(nk: NoteKitApi): Promise<{ index: TicketIndex; sha: string | null }> {
  try {
    const file = await nk.vault.readFile(INDEX_PATH);
    const parsed = JSON.parse(file.content ?? "{}") as Partial<TicketIndex>;
    return { index: { tickets: parsed.tickets ?? [] }, sha: file.sha };
  } catch {
    return { index: { tickets: [] }, sha: null };
  }
}

async function updateIndex(nk: NoteKitApi, mut: (idx: TicketIndex) => TicketIndex): Promise<void> {
  // E2EE vaults have no plaintext index (it would leak titles/assignees);
  // tickets are listed by scanning + decrypting, like the web.
  if (await vaultIsEncrypted()) return;
  const { index, sha } = await readIndex(nk);
  const next = mut(index);
  await nk.vault.writeFile(
    INDEX_PATH,
    JSON.stringify(next, null, 2) + "\n",
    "tickets: update index",
    sha ?? undefined,
  );
}

async function resolveTicketPath(nk: NoteKitApi, idOrPath: string): Promise<string> {
  if (idOrPath.includes("/")) return idOrPath;
  if (
    (idOrPath.endsWith(".md") || idOrPath.endsWith(".md.age")) &&
    idOrPath.startsWith(TICKETS_DIR)
  ) {
    return idOrPath;
  }
  if (await vaultIsEncrypted()) {
    // The file name is the nanoid id; a human key lives inside the ciphertext,
    // so resolving one means scanning + decrypting the ticket list.
    const direct = `${TICKETS_DIR}/${idOrPath}.md.age`;
    const match = (await listEncryptedTickets(nk)).find(
      (t) => t.id === idOrPath || t.key === idOrPath,
    );
    return match?.path ?? direct;
  }
  const { index: idx } = await readIndex(nk);
  const found = idx.tickets.find((t) => t.id === idOrPath || t.key === idOrPath);
  if (found) return found.path;
  return `${TICKETS_DIR}/${idOrPath}.md`;
}

// eslint-disable-next-line complexity -- function is a necessary dispatch over multiple ticket formats (encrypted vs plaintext, with defaults)
async function readTicket(nk: NoteKitApi, idOrPath: string): Promise<{ ticket: Ticket; sha: string | null }> {
  const path = await resolveTicketPath(nk, idOrPath);
  const file = await nk.vault.readFile(path);
  if (file.content && isEncrypted(path)) {
    const ticket = await decryptTicket(path, file.content);
    if (!ticket) throw new Error(`couldn't decrypt ${path}`);
    return { ticket, sha: file.sha };
  }
  const { data, body } = parseFrontmatter(file.content ?? "");
  // Apply sensible defaults — the file is the source of truth, but older
  // tickets may be missing optional fields.
  const ticket: Ticket = {
    id: String(data.id ?? path.split("/").pop()?.replace(/\.md$/, "") ?? ""),
    ...(data.key ? { key: String(data.key) } : {}),
    ...(data.parentId ? { parentId: String(data.parentId) } : {}),
    path,
    title: String(data.title ?? "(untitled)"),
    body: body.trimStart(),
    status: normalizeStatus(String(data.status ?? "todo")),
    priority: normalizePriority(data.priority),
    assignee: (data.assignee ?? null) as string | null,
    labels: Array.isArray(data.labels) ? data.labels.map(String) : [],
    linkedNotes: Array.isArray(data.linkedNotes) ? data.linkedNotes.map(String) : [],
    createdAt: String(data.createdAt ?? new Date().toISOString()),
    updatedAt: String(data.updatedAt ?? new Date().toISOString()),
    dueDate: (data.dueDate ?? null) as string | null,
    createdBy: (data.createdBy ?? null) as string | null,
  };
  return { ticket, sha: file.sha };
}

async function writeTicket(nk: NoteKitApi, ticket: Ticket, sha?: string | null): Promise<void> {
  if (await vaultIsEncrypted()) {
    const path = `${TICKETS_DIR}/${ticket.id}.md.age`;
    const sealed = await encryptTicket({ ...ticket, path });
    await nk.vault.writeFile(path, sealed, `ticket: update ${ticket.id}`, sha ?? undefined);
    return;
  }
  const data: Record<string, unknown> = {
    id: ticket.id,
    ...(ticket.key ? { key: ticket.key } : {}),
    ...(ticket.parentId ? { parentId: ticket.parentId } : {}),
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    assignee: ticket.assignee,
    labels: ticket.labels,
    linkedNotes: ticket.linkedNotes,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    dueDate: ticket.dueDate,
    createdBy: ticket.createdBy,
  };
  const content = stringifyFrontmatter(data, ticket.body.startsWith("\n") ? ticket.body : `\n${ticket.body}`);
  await nk.vault.writeFile(
    ticket.path,
    content,
    `ticket: update ${ticket.id}`,
    sha ?? undefined,
  );
}
