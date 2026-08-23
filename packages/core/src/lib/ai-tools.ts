/**
 * Agentic tools for the in-app assistant.
 *
 * Tools operate on the note MODEL (Zustand stores), never a live TipTap editor
 * instance — so they work regardless of which pane is focused and can't be
 * broken by editor remounts. Read + navigation tools run automatically;
 * vault-mutating tools (create/update/delete) route through `requestApproval`
 * so nothing changes the user's notes without an explicit click.
 *
 * A read-only profile simply never receives the write tools, so the model
 * can't even attempt them.
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { findLeaf, useLayoutStore } from "../adapters/driving/stores/layoutStore";
import { useLinksStore } from "../adapters/driving/stores/linksStore";
import { useNotesStore } from "../adapters/driving/stores/notesStore";
import { useTicketsStore } from "../adapters/driving/stores/ticketsStore";
import type { VaultCommit } from "../application/ports/out";
import type { AgentToolPermissions } from "../domain/entities/agent";
import { noteTitle } from "../domain/note-display";
import i18n from "../i18n";
import { listSecretNames, listSecretVaults } from "./secrets-vault";

/** Vault-internal secrets that power the assistant itself — never shown as "user secrets". */
function isInternalSecret(name: string): boolean {
  return (
    name.startsWith("agentkey-") ||
    name === "anthropic" ||
    name === "openai-compatible" ||
    name === "openai-compatible-baseurl"
  );
}

export interface ToolContext {
  /** Ask the user to confirm a mutating action. Resolves true if approved. */
  requestApproval(toolName: string, summary: string, input: unknown): Promise<boolean>;
  /** Default folder for newly-created notes. */
  defaultFolder?: string | null;
  /** Read the vault's git commit history (injected VaultPort capability). */
  listRecentCommits(path?: string, limit?: number): Promise<{ commits: VaultCommit[] }>;
}

const REJECTED_BY_USER = "ditolak pengguna";

function snippet(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

/**
 * A note's title IS the first line of its body (see {@link noteTitle}); the
 * `title` field isn't persisted. So a body that opens with a ```interactive /
 * ```html fence (or raw HTML) would be titled with that marker. Bake the
 * requested title in as a leading heading unless the body already starts with
 * one, so interactive/quiz notes get a real, findable title.
 */
function withTitleHeading(title: string, body: string): string {
  const t = title.trim();
  if (!t) return body;
  const firstLine = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (firstLine && /^#{1,6}\s+/.test(firstLine)) return body; // already has a heading
  return `# ${t}\n\n${body.replace(/^\s+/, "")}`;
}

/**
 * Human-readable label for a tool call, including which note it touches — shown
 * as an activity chip in the transcript (e.g. `Deleting "Ideas"`).
 */
// eslint-disable-next-line complexity -- dispatch over all known tool names; each case is trivial
export function describeToolCall(toolName: string, input: unknown): string {
  const inp = (input ?? {}) as Record<string, unknown>;
  const t = i18n.t.bind(i18n);
  const titleById = (id: unknown): string => {
    if (typeof id !== "string") return "";
    const n = useNotesStore.getState().notes[id];
    return n ? noteTitle(n) : id;
  };
  switch (toolName) {
    case "list_notes":
      return t("ai.tool.listNotes");
    case "list_folders":
      return t("ai.tool.listFolders");
    case "recent_activity":
      return inp.path
        ? t("ai.tool.recentActivityPath", { path: String(inp.path) })
        : t("ai.tool.recentActivity");
    case "list_links":
      return t("ai.tool.listLinks");
    case "list_tasks":
      return t("ai.tool.listTasks");
    case "list_secrets":
      return t("ai.tool.listSecrets");
    case "create_link":
      return t("ai.tool.createLink", { title: String(inp.title ?? inp.url ?? "") });
    case "create_task":
      return t("ai.tool.createTask", { title: String(inp.title ?? "") });
    case "set_task_status":
      return t("ai.tool.setTaskStatus", { status: String(inp.status ?? "") });
    case "search_notes":
      return t("ai.tool.search", { query: String(inp.query ?? "") });
    case "get_current_note":
      return t("ai.tool.currentNote");
    case "read_note":
      return t("ai.tool.read", { title: titleById(inp.id) });
    case "open_note":
      return t("ai.tool.open", { title: titleById(inp.id) });
    case "close_current_tab":
      return t("ai.tool.closeTab");
    case "create_note":
      return t("ai.tool.create", { title: String(inp.title ?? "") });
    case "update_note":
      return t("ai.tool.update", { title: titleById(inp.id) });
    case "move_note":
      return t("ai.tool.moveNote", {
        title: titleById(inp.id),
        folder: inp.folder ? String(inp.folder) : t("ai.tool.rootFolder"),
      });
    case "delete_note":
      return t("ai.tool.deleteNote", { title: titleById(inp.id) });
    case "delete_task":
      return t("ai.tool.deleteTask", { id: String(inp.id ?? "") });
    case "assign_task":
      return inp.assignee
        ? t("ai.tool.assignTask", { assignee: String(inp.assignee) })
        : t("ai.tool.unassignTask");
    case "delete_link":
      return t("ai.tool.deleteLink", { id: String(inp.id ?? "") });
    default:
      return toolName;
  }
}

// eslint-disable-next-line max-lines-per-function -- defines all read+write AI tools in one registry; splitting across files would obscure the full tool surface
export function buildAssistantTools(
  ctx: ToolContext,
  permissions: AgentToolPermissions,
): ToolSet {
  const t = i18n.t.bind(i18n);
  const read: ToolSet = {
    list_notes: tool({
      description:
        "List ALL notes in the vault (title, id, folder, created & updated times in ISO 8601). Use this to see the whole vault or to determine the newest/oldest notes (sort by updatedAt/createdAt). Do NOT use search_notes for that.",
      inputSchema: z.object({}),
      execute: async () => {
        const all = useNotesStore.getState().all();
        // Newest-updated first, so the most recent note is trivially the first row.
        const sorted = [...all].sort((a, b) =>
          (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
        );
        const notes = sorted.slice(0, 300).map((n) => ({
          id: n.id,
          title: noteTitle(n),
          folder: n.folder ?? null,
          createdAt: n.createdAt ?? null,
          updatedAt: n.updatedAt ?? null,
        }));
        return { total: all.length, returned: notes.length, sortedBy: "updatedAt desc", notes };
      },
    }),
    search_notes: tool({
      description:
        "Search notes by keyword in the title or body. To see ALL notes use list_notes, not this.",
      inputSchema: z.object({ query: z.string().describe("Search keyword") }),
      execute: async ({ query }) => {
        const q = query.toLowerCase();
        const matches = useNotesStore
          .getState()
          .all()
          .filter((n) => (noteTitle(n) + " " + n.body).toLowerCase().includes(q));
        const hits = matches
          .slice(0, 25)
          .map((n) => ({ id: n.id, title: noteTitle(n), snippet: snippet(n.body) }));
        return { total: matches.length, returned: hits.length, results: hits };
      },
    }),
    read_note: tool({
      description: "Read the full body of a single note by id (from list_notes / search_notes).",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const n = useNotesStore.getState().notes[id];
        if (!n) return { found: false as const };
        return {
          found: true as const,
          id: n.id,
          title: noteTitle(n),
          body: n.body,
          folder: n.folder ?? null,
          createdAt: n.createdAt ?? null,
          updatedAt: n.updatedAt ?? null,
        };
      },
    }),
    get_current_note: tool({
      description: "Get the note the user currently has active/open, if any.",
      inputSchema: z.object({}),
      execute: async () => {
        const st = useNotesStore.getState();
        const id = st.activeNoteId;
        const n = id ? st.notes[id] : null;
        if (!n) return { open: false as const };
        return { open: true as const, id: n.id, title: noteTitle(n), body: n.body };
      },
    }),
    list_folders: tool({
      description: "List the folders in the vault.",
      inputSchema: z.object({}),
      execute: async () => ({ folders: useNotesStore.getState().folders }),
    }),
    recent_activity: tool({
      description:
        "Git commit history of the vault — who changed what and when. Use for questions about activity, change history, or who edited something. Optional `path` filter (e.g. a file) and `limit`.",
      inputSchema: z.object({
        path: z.string().optional().describe("Filter to a specific path/file"),
        limit: z.number().optional().describe("Number of commits (default 30, max 100)"),
      }),
      execute: async ({ path, limit }) => {
        try {
          const res = await ctx.listRecentCommits(path, Math.min(Math.max(limit ?? 30, 1), 100));
          return {
            count: res.commits.length,
            commits: res.commits.map((c) => ({
              sha: c.sha.slice(0, 7),
              message: c.message,
              author: c.authorName || c.authorLogin || "unknown",
              at: c.authoredAt,
            })),
          };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
    open_note: tool({
      description: "Open a note (by id) in the active tab.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const n = useNotesStore.getState().notes[id];
        if (!n) return { ok: false as const, reason: "not_found" };
        useLayoutStore.getState().openNote(id);
        return { ok: true as const, title: noteTitle(n) };
      },
    }),
    close_current_tab: tool({
      description: "Close the currently active tab.",
      inputSchema: z.object({}),
      execute: async () => {
        const ls = useLayoutStore.getState();
        const pane = findLeaf(ls.layout, ls.activePaneId);
        if (!pane?.activeTab) return { ok: false as const, reason: "no_active_tab" };
        ls.closeTab(pane.activeTab, ls.activePaneId);
        return { ok: true as const };
      },
    }),
    list_links: tool({
      description: "List all saved links/bookmarks (title, url, platform, tags).",
      inputSchema: z.object({}),
      execute: async () => {
        const links = useLinksStore.getState().all();
        return {
          total: links.length,
          links: links.slice(0, 200).map((l) => ({
            id: l.id,
            title: l.title || l.url,
            url: l.url,
            platform: l.platform,
            tags: l.tags,
          })),
        };
      },
    }),
    list_tasks: tool({
      description: "List all tasks/tickets (title, status, priority, due date).",
      inputSchema: z.object({}),
      execute: async () => {
        const tickets = useTicketsStore.getState().all();
        return {
          total: tickets.length,
          tasks: tickets.slice(0, 200).map((ticket) => ({
            id: ticket.id,
            title: ticket.title,
            status: ticket.status,
            priority: ticket.priority,
            dueDate: ticket.dueDate,
            updatedAt: ticket.updatedAt,
          })),
        };
      },
    }),
    list_secrets: tool({
      description:
        "List the NAMES of secrets in the encrypted vault. IMPORTANT: names only — a secret's VALUE/CONTENT can never be accessed by the AI (E2EE security). Never claim you can read a secret's value.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const [defaultNames, vaults] = await Promise.all([
            listSecretNames(""),
            listSecretVaults(),
          ]);
          const named = await Promise.all(
            vaults.map(async (v) => ({
              vault: v.label,
              names: (await listSecretNames(v.slug)).filter((n) => !isInternalSecret(n)),
            })),
          );
          return {
            note: "Names only — a secret's value is never accessed by the AI.",
            default: defaultNames.filter((n) => !isInternalSecret(n)),
            vaults: named,
          };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
  };

  if (permissions !== "read-write") return read;

  const write: ToolSet = {
    create_note: tool({
      description:
        "Create a new note. Ask for approval first. Body in Markdown (headings, tables, lists). " +
        "For STATIC content: Markdown + simple inline HTML (e.g. <mark>). " +
        "For INTERACTIVE content (quizzes, charts, simulations that need JavaScript): put the full HTML snippet inside an `interactive`-language code block (```interactive ... ```). That content runs inside a sandboxed iframe so its JS/CSS RUNS safely. Write body-level HTML only + inline <style>/<script> (NOT <!DOCTYPE>/<html>/<head>), self-contained, with no network access. " +
        "You MAY load libraries from trusted CDNs (cdn.jsdelivr.net, unpkg.com, cdnjs.cloudflare.com) — e.g. Chart.js for charts — and use images from https or data: URLs. What you CANNOT do: fetch/XHR to the network (blocked for security), so make the content self-contained without fetching external data at runtime. " +
        "To BLEND with the app theme: use the provided CSS variables — var(--surface), var(--text), var(--muted), var(--accent), var(--accent-text), var(--border) — for colors, and keep the background transparent (do NOT hardcode white/black). Example: a card uses `background:var(--surface);border:1px solid var(--border);color:var(--text)`, buttons/highlights use `var(--accent)`. For correct/incorrect colors you may use soft semantic colors (e.g. green/red rgba). " +
        "APP NAVIGATION: from inside interactive content you CAN open other notes in NoteKit via the `window.notekit` bridge. For elements that open a note when clicked (e.g. a mindmap node, a list item), use one of: (a) a `data-nk-open=\"<note id or title>\"` attribute on the element — it opens automatically on click, or (b) `onclick=\"notekit.openNote('<id>')\"`. ALWAYS prefer the note id (from list_notes) over the title for accuracy. This bridge can ONLY open notes (navigation) — it's safe, it can't do anything else. " +
        "Do NOT use a plain ```html fence for interactive content (it renders as code text).",
      inputSchema: z.object({
        title: z.string(),
        body: z.string().default(""),
        folder: z.string().nullable().optional(),
      }),
      execute: async ({ title, body, folder }) => {
        const ok = await ctx.requestApproval(
          "create_note",
          t("ai.approvalSummary.create", { title }),
          { title, body, folder },
        );
        if (!ok) return { ok: false as const, reason: REJECTED_BY_USER };
        const note = useNotesStore.getState().upsert({
          title,
          body: withTitleHeading(title, body ?? ""),
          folder: folder ?? ctx.defaultFolder ?? null,
        });
        useLayoutStore.getState().openNote(note.id);
        return { ok: true as const, id: note.id };
      },
    }),
    update_note: tool({
      description:
        "Replace the ENTIRE note body by id (send the complete new body, not a fragment). Ask for approval first. " +
        "Body in Markdown; simple inline HTML is allowed (e.g. <mark>) BUT do not wrap it in ```html. " +
        "For INTERACTIVE content (quizzes, charts, mindmaps that need JavaScript): put the full HTML in an ```interactive ... ``` code block — it runs in a safe sandboxed iframe. Same rules as create_note: body-level HTML + inline <style>/<script> (no <!DOCTYPE>/<html>/<head>), trusted CDN libraries allowed (jsdelivr/unpkg/cdnjs) + https/data: images, NO fetch/XHR. Use the theme CSS variables (var(--surface), var(--text), var(--accent), var(--border), etc.). " +
        "NAVIGATION: an element can open another note when clicked via a `data-nk-open=\"<id or title>\"` attribute or `onclick=\"notekit.openNote('<id>')\"` — prefer the note id from list_notes.",
      inputSchema: z.object({ id: z.string(), body: z.string() }),
      execute: async ({ id, body }) => {
        const n = useNotesStore.getState().notes[id];
        if (!n) return { ok: false as const, reason: "not_found" };
        const ok = await ctx.requestApproval(
          "update_note",
          t("ai.approvalSummary.update", { title: noteTitle(n) }),
          { id, body },
        );
        if (!ok) return { ok: false as const, reason: REJECTED_BY_USER };
        useNotesStore.getState().updateBody(id, body);
        return { ok: true as const };
      },
    }),
    move_note: tool({
      description:
        "Move a note to a folder (change its folder; id & content stay). " +
        "The folder can be nested, e.g. \"Trading/Technical\". Send null or an empty string to move it to the root. Ask for approval first.",
      inputSchema: z.object({ id: z.string(), folder: z.string().nullable() }),
      execute: async ({ id, folder }) => {
        const n = useNotesStore.getState().notes[id];
        if (!n) return { ok: false as const, reason: "not_found" };
        const dest = folder && folder.trim() ? folder.trim() : null;
        const ok = await ctx.requestApproval(
          "move_note",
          t("ai.approvalSummary.moveNote", {
            title: noteTitle(n),
            folder: dest ?? t("ai.tool.rootFolder"),
          }),
          { id, folder: dest },
        );
        if (!ok) return { ok: false as const, reason: REJECTED_BY_USER };
        useNotesStore.getState().setFolder(id, dest);
        return { ok: true as const, folder: dest };
      },
    }),
    delete_note: tool({
      description: "Delete a note by id. Ask for approval first.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const n = useNotesStore.getState().notes[id];
        if (!n) return { ok: false as const, reason: "not_found" };
        const ok = await ctx.requestApproval(
          "delete_note",
          t("ai.approvalSummary.deleteNote", { title: noteTitle(n) }),
          { id },
        );
        if (!ok) return { ok: false as const, reason: REJECTED_BY_USER };
        useNotesStore.getState().remove(id);
        return { ok: true as const };
      },
    }),
    create_link: tool({
      description: "Save a new link/bookmark. Ask for approval first.",
      inputSchema: z.object({
        url: z.string(),
        title: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
      execute: async ({ url, title, tags }) => {
        const ok = await ctx.requestApproval("create_link", t("ai.approvalSummary.createLink", { title: title || url }), {
          url,
          title,
          tags,
        });
        if (!ok) return { ok: false as const, reason: REJECTED_BY_USER };
        const link = useLinksStore.getState().upsert({ url, title, tags });
        return { ok: true as const, id: link.id };
      },
    }),
    create_task: tool({
      description: "Create a new task/ticket. Ask for approval first.",
      inputSchema: z.object({
        title: z.string(),
        body: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      }),
      execute: async ({ title, body, priority }) => {
        const ok = await ctx.requestApproval("create_task", t("ai.approvalSummary.createTask", { title }), {
          title,
          body,
          priority,
        });
        if (!ok) return { ok: false as const, reason: REJECTED_BY_USER };
        const ticket = useTicketsStore.getState().upsert({ title, body, priority });
        return { ok: true as const, id: ticket.id };
      },
    }),
    set_task_status: tool({
      description:
        "Change a task/ticket status (todo, in_progress, blocked, done, archived). Ask for approval first.",
      inputSchema: z.object({
        id: z.string(),
        status: z.enum(["todo", "in_progress", "blocked", "done", "archived"]),
      }),
      execute: async ({ id, status }) => {
        const ticket = useTicketsStore.getState().all().find((x) => x.id === id);
        if (!ticket) return { ok: false as const, reason: "not_found" };
        const ok = await ctx.requestApproval(
          "set_task_status",
          t("ai.approvalSummary.setTaskStatus", { title: ticket.title, status }),
          { id, status },
        );
        if (!ok) return { ok: false as const, reason: REJECTED_BY_USER };
        useTicketsStore.getState().setStatus(id, status);
        return { ok: true as const };
      },
    }),
    delete_task: tool({
      description: "Delete a task/ticket by id. Ask for approval first.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const ticket = useTicketsStore.getState().all().find((x) => x.id === id);
        if (!ticket) return { ok: false as const, reason: "not_found" };
        const ok = await ctx.requestApproval(
          "delete_task",
          t("ai.approvalSummary.deleteTask", { title: ticket.title }),
          { id },
        );
        if (!ok) return { ok: false as const, reason: REJECTED_BY_USER };
        useTicketsStore.getState().remove(id);
        return { ok: true as const };
      },
    }),
    assign_task: tool({
      description:
        "Set or clear the assignee of a task/ticket by id. Send null to clear the assignee. Ask for approval first.",
      inputSchema: z.object({
        id: z.string(),
        assignee: z.string().nullable().describe("Assignee username/name, or null to clear"),
      }),
      execute: async ({ id, assignee }) => {
        const ticket = useTicketsStore.getState().all().find((x) => x.id === id);
        if (!ticket) return { ok: false as const, reason: "not_found" };
        const label = assignee
          ? t("ai.approvalSummary.assignTask", { title: ticket.title, assignee })
          : t("ai.approvalSummary.unassignTask", { title: ticket.title });
        const ok = await ctx.requestApproval("assign_task", label, { id, assignee });
        if (!ok) return { ok: false as const, reason: REJECTED_BY_USER };
        useTicketsStore.getState().setAssignee(id, assignee);
        return { ok: true as const };
      },
    }),
    delete_link: tool({
      description: "Delete a saved link/bookmark by id. Ask for approval first.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const links = useLinksStore.getState().links;
        const l = links[id];
        if (!l) return { ok: false as const, reason: "not_found" };
        const ok = await ctx.requestApproval(
          "delete_link",
          t("ai.approvalSummary.deleteLink", { title: l.title || l.url }),
          { id },
        );
        if (!ok) return { ok: false as const, reason: REJECTED_BY_USER };
        useLinksStore.getState().remove(id);
        return { ok: true as const };
      },
    }),
  };

  return { ...read, ...write };
}
