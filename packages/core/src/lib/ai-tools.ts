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
import { useLinksStore } from "../stores/linksStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { findLeaf, useLayoutStore } from "../stores/layoutStore";
import { noteTitle } from "./note-display";
import { listCommits } from "./vault-api";
import { listSecretNames, listSecretVaults } from "./secrets-vault";
import type { AgentToolPermissions } from "./agents-api";

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
}

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
 * as an activity chip in the transcript (e.g. `Menghapus "Ideas"`).
 */
// eslint-disable-next-line complexity -- dispatch over all known tool names; each case is trivial
export function describeToolCall(toolName: string, input: unknown): string {
  const inp = (input ?? {}) as Record<string, unknown>;
  const titleById = (id: unknown): string => {
    if (typeof id !== "string") return "";
    const n = useNotesStore.getState().notes[id];
    return n ? noteTitle(n) : id;
  };
  switch (toolName) {
    case "list_notes":
      return "Melihat semua catatan";
    case "list_folders":
      return "Melihat daftar folder";
    case "recent_activity":
      return inp.path ? `Melihat riwayat "${String(inp.path)}"` : "Melihat riwayat commit";
    case "list_links":
      return "Melihat semua link";
    case "list_tasks":
      return "Melihat semua task";
    case "list_secrets":
      return "Melihat nama secret";
    case "create_link":
      return `Menyimpan link "${String(inp.title ?? inp.url ?? "")}"`;
    case "create_task":
      return `Membuat task "${String(inp.title ?? "")}"`;
    case "set_task_status":
      return `Ubah status task → ${String(inp.status ?? "")}`;
    case "search_notes":
      return `Mencari "${String(inp.query ?? "")}"`;
    case "get_current_note":
      return "Membaca catatan aktif";
    case "read_note":
      return `Membaca "${titleById(inp.id)}"`;
    case "open_note":
      return `Membuka "${titleById(inp.id)}"`;
    case "close_current_tab":
      return "Menutup tab";
    case "create_note":
      return `Membuat "${String(inp.title ?? "")}"`;
    case "update_note":
      return `Mengubah "${titleById(inp.id)}"`;
    case "move_note":
      return `Memindahkan "${titleById(inp.id)}" → ${inp.folder ? String(inp.folder) : "(root)"}`;
    case "delete_note":
      return `Menghapus "${titleById(inp.id)}"`;
    case "delete_task":
      return `Menghapus task "${String(inp.id ?? "")}"`;
    case "assign_task":
      return inp.assignee
        ? `Menetapkan task ke "${String(inp.assignee)}"`
        : `Menghapus penugasan task`;
    case "delete_link":
      return `Menghapus link "${String(inp.id ?? "")}"`;
    default:
      return toolName;
  }
}

// eslint-disable-next-line max-lines-per-function -- defines all read+write AI tools in one registry; splitting across files would obscure the full tool surface
export function buildAssistantTools(
  ctx: ToolContext,
  permissions: AgentToolPermissions,
): ToolSet {
  const read: ToolSet = {
    list_notes: tool({
      description:
        "Daftar SEMUA catatan di vault (judul, id, folder, waktu dibuat & diubah dalam ISO 8601). Gunakan ini untuk melihat isi vault menyeluruh atau menentukan catatan terbaru/terlama (urutkan berdasarkan updatedAt/createdAt). JANGAN pakai search_notes untuk itu.",
      inputSchema: z.object({}),
      execute: async () => {
        const all = useNotesStore.getState().all();
        // Newest-updated first, so "catatan terbaru" is trivially the first row.
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
        "Cari catatan berdasarkan kata kunci di judul atau isi. Untuk melihat SEMUA catatan pakai list_notes, bukan ini.",
      inputSchema: z.object({ query: z.string().describe("Kata kunci pencarian") }),
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
      description: "Baca isi lengkap satu catatan berdasarkan id (dari list_notes / search_notes).",
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
    recent_activity: tool({
      description:
        "Riwayat commit Git dari vault — siapa mengubah apa dan kapan. Gunakan untuk pertanyaan tentang aktivitas, riwayat perubahan, atau siapa yang mengedit. Opsional filter `path` (mis. sebuah file) dan `limit`.",
      inputSchema: z.object({
        path: z.string().optional().describe("Filter ke path/file tertentu"),
        limit: z.number().optional().describe("Jumlah commit (default 30, maks 100)"),
      }),
      execute: async ({ path, limit }) => {
        try {
          const res = await listCommits(path, Math.min(Math.max(limit ?? 30, 1), 100));
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
    list_links: tool({
      description: "Daftar semua link/bookmark tersimpan (judul, url, platform, tag).",
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
      description: "Daftar semua task/tiket (judul, status, prioritas, jatuh tempo).",
      inputSchema: z.object({}),
      execute: async () => {
        const tickets = useTicketsStore.getState().all();
        return {
          total: tickets.length,
          tasks: tickets.slice(0, 200).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            updatedAt: t.updatedAt,
          })),
        };
      },
    }),
    list_secrets: tool({
      description:
        "Daftar NAMA secret di vault terenkripsi. PENTING: hanya nama — NILAI/ISI secret tidak pernah bisa diakses AI (keamanan E2EE). Jangan pernah mengaku bisa membaca nilai secret.",
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
            note: "Hanya nama yang ditampilkan — nilai secret tidak pernah diakses AI.",
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
        "Buat catatan baru. Minta persetujuan dulu. Body dalam Markdown (heading, tabel, list). " +
        "Untuk konten STATIS: Markdown + HTML inline sederhana (mis. <mark>). " +
        "Untuk konten INTERAKTIF (kuis, chart, simulasi yang butuh JavaScript): taruh potongan HTML lengkap di dalam blok kode berbahasa `interactive` (```interactive ... ```). Konten itu berjalan di dalam sandboxed iframe sehingga JS/CSS-nya JALAN dengan aman. Tulis HTML level-body saja + <style>/<script> inline (JANGAN <!DOCTYPE>/<html>/<head>), mandiri, tanpa akses jaringan. " +
        "Kamu BOLEH memuat library dari CDN tepercaya (cdn.jsdelivr.net, unpkg.com, cdnjs.cloudflare.com) — mis. Chart.js untuk grafik — dan memakai gambar dari URL https atau data:. Yang TIDAK bisa: fetch/XHR ke jaringan (diblokir demi keamanan), jadi buat konten mandiri tanpa ambil data eksternal saat runtime. " +
        "Agar MENYATU dengan tema app: pakai CSS variables yang sudah disediakan — var(--surface), var(--text), var(--muted), var(--accent), var(--accent-text), var(--border) — untuk warna, dan biarkan background transparan (JANGAN hardcode putih/hitam). Contoh: kartu pakai `background:var(--surface);border:1px solid var(--border);color:var(--text)`, tombol/highlight pakai `var(--accent)`. Untuk warna benar/salah boleh pakai warna semantik lembut (mis. rgba hijau/merah). " +
        "NAVIGASI KE APP: dari dalam konten interaktif kamu BISA membuka catatan lain di NoteKit lewat bridge `window.notekit`. Untuk elemen yang bila diklik membuka catatan (mis. node mindmap, item daftar), pakai salah satu: (a) atribut `data-nk-open=\"<id atau judul catatan>\"` pada elemen — otomatis terbuka saat diklik, atau (b) `onclick=\"notekit.openNote('<id>')\"`. SELALU utamakan ID catatan (dari list_notes) daripada judul supaya akurat. Bridge ini HANYA bisa membuka catatan (navigasi) — aman, tak bisa hal lain. " +
        "JANGAN pakai fence ```html biasa untuk konten interaktif (itu tampil sebagai teks kode).",
      inputSchema: z.object({
        title: z.string(),
        body: z.string().default(""),
        folder: z.string().nullable().optional(),
      }),
      execute: async ({ title, body, folder }) => {
        const ok = await ctx.requestApproval(
          "create_note",
          `Buat catatan "${title}"`,
          { title, body, folder },
        );
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
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
        "Ganti SELURUH isi catatan berdasarkan id (kirim body lengkap yang baru, bukan potongan). Minta persetujuan dulu. " +
        "Body dalam Markdown; HTML inline sederhana boleh (mis. <mark>) TAPI jangan dibungkus ```html. " +
        "Untuk konten INTERAKTIF (kuis, chart, mindmap yang butuh JavaScript): taruh HTML lengkap di blok kode ```interactive ... ``` — berjalan di sandboxed iframe yang aman. Aturannya sama seperti create_note: HTML level-body + <style>/<script> inline (tanpa <!DOCTYPE>/<html>/<head>), boleh library CDN tepercaya (jsdelivr/unpkg/cdnjs) + gambar https/data:, TANPA fetch/XHR. Pakai CSS variables tema (var(--surface), var(--text), var(--accent), var(--border), dst). " +
        "NAVIGASI: elemen bisa membuka catatan lain saat diklik lewat atribut `data-nk-open=\"<id atau judul>\"` atau `onclick=\"notekit.openNote('<id>')\"` — utamakan ID catatan dari list_notes.",
      inputSchema: z.object({ id: z.string(), body: z.string() }),
      execute: async ({ id, body }) => {
        const n = useNotesStore.getState().notes[id];
        if (!n) return { ok: false as const, reason: "not_found" };
        const ok = await ctx.requestApproval(
          "update_note",
          `Ubah catatan "${noteTitle(n)}"`,
          { id, body },
        );
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        useNotesStore.getState().updateBody(id, body);
        return { ok: true as const };
      },
    }),
    move_note: tool({
      description:
        "Pindahkan catatan ke sebuah folder (ubah folder-nya; id & isi tetap). " +
        "folder boleh bertingkat, mis. \"Trading/Teknikal\". Kirim null atau string kosong untuk memindahkan ke root. Minta persetujuan dulu.",
      inputSchema: z.object({ id: z.string(), folder: z.string().nullable() }),
      execute: async ({ id, folder }) => {
        const n = useNotesStore.getState().notes[id];
        if (!n) return { ok: false as const, reason: "not_found" };
        const dest = folder && folder.trim() ? folder.trim() : null;
        const ok = await ctx.requestApproval(
          "move_note",
          `Pindahkan "${noteTitle(n)}" ke ${dest ?? "(root)"}`,
          { id, folder: dest },
        );
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        useNotesStore.getState().setFolder(id, dest);
        return { ok: true as const, folder: dest };
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
          `Hapus catatan "${noteTitle(n)}"`,
          { id },
        );
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        useNotesStore.getState().remove(id);
        return { ok: true as const };
      },
    }),
    create_link: tool({
      description: "Simpan link/bookmark baru. Minta persetujuan dulu.",
      inputSchema: z.object({
        url: z.string(),
        title: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
      execute: async ({ url, title, tags }) => {
        const ok = await ctx.requestApproval("create_link", `Simpan link "${title || url}"`, {
          url,
          title,
          tags,
        });
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        const link = useLinksStore.getState().upsert({ url, title, tags });
        return { ok: true as const, id: link.id };
      },
    }),
    create_task: tool({
      description: "Buat task/tiket baru. Minta persetujuan dulu.",
      inputSchema: z.object({
        title: z.string(),
        body: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      }),
      execute: async ({ title, body, priority }) => {
        const ok = await ctx.requestApproval("create_task", `Buat task "${title}"`, {
          title,
          body,
          priority,
        });
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        const t = useTicketsStore.getState().upsert({ title, body, priority });
        return { ok: true as const, id: t.id };
      },
    }),
    set_task_status: tool({
      description:
        "Ubah status task/tiket (todo, in_progress, blocked, done, archived). Minta persetujuan dulu.",
      inputSchema: z.object({
        id: z.string(),
        status: z.enum(["todo", "in_progress", "blocked", "done", "archived"]),
      }),
      execute: async ({ id, status }) => {
        const t = useTicketsStore.getState().all().find((x) => x.id === id);
        if (!t) return { ok: false as const, reason: "not_found" };
        const ok = await ctx.requestApproval(
          "set_task_status",
          `Ubah status "${t.title}" → ${status}`,
          { id, status },
        );
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        useTicketsStore.getState().setStatus(id, status);
        return { ok: true as const };
      },
    }),
    delete_task: tool({
      description: "Hapus sebuah task/tiket berdasarkan id. Minta persetujuan dulu.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const t = useTicketsStore.getState().all().find((x) => x.id === id);
        if (!t) return { ok: false as const, reason: "not_found" };
        const ok = await ctx.requestApproval(
          "delete_task",
          `Hapus task "${t.title}"`,
          { id },
        );
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        useTicketsStore.getState().remove(id);
        return { ok: true as const };
      },
    }),
    assign_task: tool({
      description:
        "Tetapkan atau hapus penugasan (assignee) sebuah task/tiket berdasarkan id. Kirim null untuk menghapus penugasan. Minta persetujuan dulu.",
      inputSchema: z.object({
        id: z.string(),
        assignee: z.string().nullable().describe("Username/nama penerima tugas, atau null untuk menghapus"),
      }),
      execute: async ({ id, assignee }) => {
        const t = useTicketsStore.getState().all().find((x) => x.id === id);
        if (!t) return { ok: false as const, reason: "not_found" };
        const label = assignee
          ? `Tetapkan task "${t.title}" ke "${assignee}"`
          : `Hapus penugasan task "${t.title}"`;
        const ok = await ctx.requestApproval("assign_task", label, { id, assignee });
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        useTicketsStore.getState().setAssignee(id, assignee);
        return { ok: true as const };
      },
    }),
    delete_link: tool({
      description: "Hapus sebuah link/bookmark tersimpan berdasarkan id. Minta persetujuan dulu.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const links = useLinksStore.getState().links;
        const l = links[id];
        if (!l) return { ok: false as const, reason: "not_found" };
        const ok = await ctx.requestApproval(
          "delete_link",
          `Hapus link "${l.title || l.url}"`,
          { id },
        );
        if (!ok) return { ok: false as const, reason: "ditolak pengguna" };
        useLinksStore.getState().remove(id);
        return { ok: true as const };
      },
    }),
  };

  return { ...read, ...write };
}
