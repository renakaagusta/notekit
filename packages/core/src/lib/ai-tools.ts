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
import { useNotesStore } from "../stores/notesStore";
import { findLeaf, useLayoutStore } from "../stores/layoutStore";
import { noteTitle } from "./note-display";
import type { AgentToolPermissions } from "./agents-api";

export interface ToolContext {
  /** Ask the user to confirm a mutating action. Resolves true if approved. */
  requestApproval(toolName: string, summary: string, input: unknown): Promise<boolean>;
  /** Default folder for newly-created notes. */
  defaultFolder?: string | null;
}

function snippet(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

export function buildAssistantTools(
  ctx: ToolContext,
  permissions: AgentToolPermissions,
): ToolSet {
  const read: ToolSet = {
    search_notes: tool({
      description:
        "Cari catatan berdasarkan kata kunci di judul, tag, atau isi. Kembalikan hasil teratas dengan cuplikan.",
      inputSchema: z.object({ query: z.string().describe("Kata kunci pencarian") }),
      execute: async ({ query }) => {
        const q = query.toLowerCase();
        const hits = useNotesStore
          .getState()
          .all()
          .filter((n) => (noteTitle(n) + " " + n.body).toLowerCase().includes(q))
          .slice(0, 8)
          .map((n) => ({ id: n.id, title: noteTitle(n), snippet: snippet(n.body) }));
        return { count: hits.length, results: hits };
      },
    }),
    read_note: tool({
      description: "Baca isi lengkap satu catatan berdasarkan id (dari search_notes).",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const n = useNotesStore.getState().notes[id];
        if (!n) return { found: false as const };
        return { found: true as const, id: n.id, title: noteTitle(n), body: n.body };
      },
    }),
    get_current_note: tool({
      description: "Ambil catatan yang sedang aktif/dibuka pengguna, bila ada.",
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
      description: "Daftar folder yang ada di vault.",
      inputSchema: z.object({}),
      execute: async () => ({ folders: useNotesStore.getState().folders }),
    }),
    open_note: tool({
      description: "Buka catatan (berdasarkan id) di tab aktif.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const n = useNotesStore.getState().notes[id];
        if (!n) return { ok: false as const, reason: "not_found" };
        useLayoutStore.getState().openNote(id);
        return { ok: true as const, title: noteTitle(n) };
      },
    }),
    close_current_tab: tool({
      description: "Tutup tab yang sedang aktif.",
      inputSchema: z.object({}),
      execute: async () => {
        const ls = useLayoutStore.getState();
        const pane = findLeaf(ls.layout, ls.activePaneId);
        if (!pane?.activeTab) return { ok: false as const, reason: "no_active_tab" };
        ls.closeTab(pane.activeTab, ls.activePaneId);
        return { ok: true as const };
      },
    }),
  };

  if (permissions !== "read-write") return read;

  const write: ToolSet = {
    create_note: tool({
      description:
        "Buat catatan baru. Minta persetujuan pengguna dulu. Isi body dalam Markdown.",
      inputSchema: z.object({
        title: z.string(),
        body: z.string().default(""),
        folder: z.string().nullable().optional(),
      }),
      execute: async ({ title, body, folder }) => {
        const ok = await ctx.requestApproval(
          "create_note",
          `Buat catatan “${title}”`,
          { title, body, folder },
        );
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        const note = useNotesStore.getState().upsert({
          title,
          body: body ?? "",
          folder: folder ?? ctx.defaultFolder ?? null,
        });
        useLayoutStore.getState().openNote(note.id);
        return { ok: true as const, id: note.id };
      },
    }),
    update_note: tool({
      description:
        "Ganti seluruh isi (body Markdown) sebuah catatan berdasarkan id. Minta persetujuan dulu.",
      inputSchema: z.object({ id: z.string(), body: z.string() }),
      execute: async ({ id, body }) => {
        const n = useNotesStore.getState().notes[id];
        if (!n) return { ok: false as const, reason: "not_found" };
        const ok = await ctx.requestApproval(
          "update_note",
          `Ubah catatan “${noteTitle(n)}”`,
          { id, body },
        );
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        useNotesStore.getState().updateBody(id, body);
        return { ok: true as const };
      },
    }),
    delete_note: tool({
      description: "Hapus sebuah catatan berdasarkan id. Minta persetujuan dulu.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const n = useNotesStore.getState().notes[id];
        if (!n) return { ok: false as const, reason: "not_found" };
        const ok = await ctx.requestApproval(
          "delete_note",
          `Hapus catatan “${noteTitle(n)}”`,
          { id },
        );
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        useNotesStore.getState().remove(id);
        return { ok: true as const };
      },
    }),
  };

  return { ...read, ...write };
}
