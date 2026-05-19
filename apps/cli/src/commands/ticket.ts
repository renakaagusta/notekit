// `notekit ticket <sub>` — CRUD over tickets. Tickets are `.md` with YAML
// frontmatter, see `packages/core/src/types/ticket.ts` for the canonical shape.
// They live under `tickets/` in the vault and share the same write-through-API
// model as notes.

import { defineCommand } from "citty";
import kleur from "kleur";
import { nanoid } from "nanoid";
import type { Ticket, TicketStatus, TicketPriority } from "@notekit/core/types";
import { getClient, dieWithError } from "../client.js";
import { openEditor } from "../lib/editor.js";
import { parseFrontmatter, stringifyFrontmatter } from "../lib/frontmatter.js";
import type { NoteKitApi } from "@notekit/api-client";

const TICKETS_DIR = "tickets";
const INDEX_PATH = `${TICKETS_DIR}/index.json`;

interface TicketIndexEntry {
  id: string;
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
  meta: { name: "new", description: "Create a new ticket." },
  args: {
    title: { type: "positional", description: "Ticket title.", required: true },
    body: { type: "string", description: "Body text (skip the editor).", required: false },
    priority: { type: "string", description: "low|medium|high|urgent (default medium).", required: false },
    assignee: { type: "string", description: "Assignee ref, e.g. user:abc or agent:xyz.", required: false },
    label: { type: "string", description: "Comma-separated labels.", required: false },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });

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

      const ticket: Omit<Ticket, "path"> = {
        id,
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
          path,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          assignee: ticket.assignee,
          updatedAt: now,
        });
        return idx;
      });

      process.stdout.write(`${kleur.green("created")} ${path}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const listCmd = defineCommand({
  meta: { name: "list", description: "List tickets, optionally filtered by status." },
  args: {
    status: { type: "string", description: "Filter: todo|in_progress|blocked|done|archived.", required: false },
    all: { type: "boolean", description: "Include archived/done.", required: false },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
      const { index: idx } = await readIndex(nk);
      let rows = idx.tickets;
      if (args.status) {
        const want = normalizeStatus(String(args.status));
        rows = rows.filter((t) => t.status === want);
      } else if (!args.all) {
        rows = rows.filter((t) => t.status !== "done" && t.status !== "archived");
      }
      if (rows.length === 0) {
        process.stdout.write(kleur.dim("(no tickets)\n"));
        return;
      }
      for (const t of rows) {
        process.stdout.write(
          `${kleur.dim(t.id)}  ${badge(t.status)}  ${priorityBadge(t.priority)}  ${t.title}\n`,
        );
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

const showCmd = defineCommand({
  meta: { name: "show", description: "Show a ticket." },
  args: { id: { type: "positional", description: "Ticket id or path.", required: true } },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
      const { ticket } = await readTicket(nk, String(args.id));
      process.stdout.write(`${kleur.bold(ticket.title)}  ${kleur.dim(`#${ticket.id}`)}\n`);
      process.stdout.write(`${badge(ticket.status)}  ${priorityBadge(ticket.priority)}`);
      if (ticket.assignee) process.stdout.write(`  ${kleur.cyan(ticket.assignee)}`);
      if (ticket.labels.length > 0) process.stdout.write(`  ${ticket.labels.map((l) => kleur.gray(`#${l}`)).join(" ")}`);
      process.stdout.write("\n\n");
      process.stdout.write(ticket.body);
      if (!ticket.body.endsWith("\n")) process.stdout.write("\n");
    } catch (err) {
      dieWithError(err);
    }
  },
});

const closeCmd = defineCommand({
  meta: { name: "close", description: "Mark a ticket as done." },
  args: { id: { type: "positional", description: "Ticket id or path.", required: true } },
  async run({ args }) {
    await transition(String(args.id), "done", "ticket: close");
  },
});

const reopenCmd = defineCommand({
  meta: { name: "reopen", description: "Move a ticket back to todo." },
  args: { id: { type: "positional", description: "Ticket id or path.", required: true } },
  async run({ args }) {
    await transition(String(args.id), "todo", "ticket: reopen");
  },
});

const assignCmd = defineCommand({
  meta: { name: "assign", description: "Set or clear the ticket assignee." },
  args: {
    id: { type: "positional", description: "Ticket id or path.", required: true },
    assignee: { type: "positional", description: "Assignee ref (user:id, agent:id, or `none`).", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
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

export const ticketCommand = defineCommand({
  meta: { name: "ticket", description: "Track work items as markdown tickets." },
  subCommands: {
    new: newCmd,
    list: listCmd,
    show: showCmd,
    close: closeCmd,
    reopen: reopenCmd,
    assign: assignCmd,
  },
});

// ── helpers ────────────────────────────────────────────────────────────────

async function transition(idOrPath: string, status: TicketStatus, message: string): Promise<void> {
  try {
    const nk = await getClient({ requireAuth: true });
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
  if (idOrPath.endsWith(".md") && idOrPath.startsWith(TICKETS_DIR)) return idOrPath;
  const { index: idx } = await readIndex(nk);
  const found = idx.tickets.find((t) => t.id === idOrPath);
  if (found) return found.path;
  return `${TICKETS_DIR}/${idOrPath}.md`;
}

async function readTicket(nk: NoteKitApi, idOrPath: string): Promise<{ ticket: Ticket; sha: string | null }> {
  const path = await resolveTicketPath(nk, idOrPath);
  const file = await nk.vault.readFile(path);
  const { data, body } = parseFrontmatter(file.content ?? "");
  // Apply sensible defaults — the file is the source of truth, but older
  // tickets may be missing optional fields.
  const ticket: Ticket = {
    id: String(data.id ?? path.split("/").pop()?.replace(/\.md$/, "") ?? ""),
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
  const data: Record<string, unknown> = {
    id: ticket.id,
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
