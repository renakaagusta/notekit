// `notekit note <sub>` — CRUD over markdown notes living in the active vault.
// Notes are plain `.md` files under `notes/`. Reads/writes go through
// `nk.vault.readFile / writeFile / deleteFile` so the server enforces vault
// access checks and audits commits.

import { defineCommand } from "citty";
import kleur from "kleur";
import { nanoid } from "nanoid";
import { getClient, dieWithError } from "../client.js";
import { openEditor } from "../lib/editor.js";
import { parseFrontmatter, stringifyFrontmatter } from "../lib/frontmatter.js";
import { isEncrypted, decryptNote } from "../lib/crypto.js";

const NOTES_DIR = "notes";
const INDEX_PATH = `${NOTES_DIR}/index.json`;

interface NoteIndexEntry {
  id: string;
  path: string;
  title: string;
  updatedAt: string;
}

interface NoteIndex {
  notes: NoteIndexEntry[];
}

const newCmd = defineCommand({
  meta: { name: "new", description: "Create a new note. Opens $EDITOR if --body is not provided." },
  args: {
    title: { type: "positional", description: "Note title.", required: true },
    body: { type: "string", description: "Note body (skip the editor).", required: false },
    tag: { type: "string", description: "Comma-separated tags.", required: false },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });

      const seed = args.body
        ? String(args.body)
        : `# ${args.title}\n\n`;
      const body = args.body ? String(args.body) : await openEditor({ seed, extension: ".md" });

      const id = nanoid(10);
      const now = new Date().toISOString();
      const tags = args.tag ? String(args.tag).split(",").map((t) => t.trim()).filter(Boolean) : [];

      const frontmatter = {
        id,
        title: String(args.title),
        createdAt: now,
        updatedAt: now,
        tags,
      };
      const content = stringifyFrontmatter(frontmatter, body.startsWith("\n") ? body : `\n${body}`);
      const path = `${NOTES_DIR}/${id}.md`;

      await nk.vault.writeFile(path, content, `note: create ${id}`);

      await updateIndex(nk, (idx) => {
        idx.notes.unshift({ id, path, title: String(args.title), updatedAt: now });
        return idx;
      });

      process.stdout.write(`${kleur.green("created")} ${path}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const listCmd = defineCommand({
  meta: { name: "list", description: "List notes in the active vault." },
  args: {
    limit: { type: "string", description: "Max rows to print.", required: false },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
      const { index: idx } = await readIndex(nk);
      // `--limit foo` would otherwise become NaN and silently return zero
      // results via slice(0, NaN). Reject early so the user sees the bug.
      let limit = idx.notes.length;
      if (args.limit) {
        const parsed = Number(args.limit);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error(`--limit must be a non-negative integer, got: ${args.limit}`);
        }
        limit = parsed;
      }
      for (const n of idx.notes.slice(0, limit)) {
        process.stdout.write(`${kleur.dim(n.id)}  ${n.title}\n`);
      }
      if (idx.notes.length === 0) {
        process.stdout.write(kleur.dim("(no notes — create one with `notekit note new <title>`)\n"));
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

const readCmd = defineCommand({
  meta: { name: "read", description: "Print a note to stdout." },
  args: {
    idOrPath: { type: "positional", description: "Note id or vault path.", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
      const path = await resolveNotePath(nk, String(args.idOrPath));
      const file = await nk.vault.readFile(path);
      let text = file.content ?? "";
      // Encrypted (.md.age) notes: decrypt with the unlocked recovery phrase
      // and render plaintext frontmatter + body, so `read` looks the same as
      // for a plain note (#49).
      if (text && isEncrypted(path)) {
        const note = await decryptNote(path, text);
        if (note) {
          text = stringifyFrontmatter(
            {
              id: note.id,
              title: note.title,
              tags: note.tags,
              createdAt: note.createdAt,
              updatedAt: note.updatedAt,
              folder: note.folder ?? undefined,
            },
            note.body.startsWith("\n") ? note.body : `\n${note.body}`,
          );
        }
      }
      process.stdout.write(text);
      if (!text.endsWith("\n")) process.stdout.write("\n");
    } catch (err) {
      dieWithError(err);
    }
  },
});

const editCmd = defineCommand({
  meta: { name: "edit", description: "Edit a note in $EDITOR and commit." },
  args: {
    idOrPath: { type: "positional", description: "Note id or vault path.", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
      const path = await resolveNotePath(nk, String(args.idOrPath));
      const file = await nk.vault.readFile(path);
      const seed = file.content ?? "";

      const next = await openEditor({ seed, extension: ".md" });
      if (next === seed) {
        process.stdout.write(kleur.dim("no changes\n"));
        return;
      }

      // Bump updatedAt + refresh index title.
      const { data, body } = parseFrontmatter(next);
      const now = new Date().toISOString();
      data.updatedAt = now;
      const content = stringifyFrontmatter(data, body);

      await nk.vault.writeFile(path, content, `note: edit ${data.id ?? path}`, file.sha ?? undefined);

      const title = String(data.title ?? path.split("/").pop());
      await updateIndex(nk, (idx) => {
        const found = idx.notes.find((n) => n.path === path);
        if (found) {
          found.title = title;
          found.updatedAt = now;
        }
        return idx;
      });

      process.stdout.write(`${kleur.green("updated")} ${path}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const rmCmd = defineCommand({
  meta: { name: "rm", description: "Delete a note." },
  args: {
    idOrPath: { type: "positional", description: "Note id or vault path.", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
      const path = await resolveNotePath(nk, String(args.idOrPath));
      const existing = await nk.vault.readFile(path);
      if (!existing.sha) {
        throw new Error(`cannot delete ${path}: no sha returned from server`);
      }
      await nk.vault.deleteFile(path, existing.sha, `note: delete ${path}`);
      await updateIndex(nk, (idx) => {
        idx.notes = idx.notes.filter((n) => n.path !== path);
        return idx;
      });
      process.stdout.write(`${kleur.yellow("removed")} ${path}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const searchCmd = defineCommand({
  meta: {
    name: "search",
    description: "Substring search over note titles + bodies (client-side).",
  },
  args: {
    query: { type: "positional", description: "Search query.", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
      const { index: idx } = await readIndex(nk);
      const q = String(args.query).toLowerCase();

      // Phase 3 TODO: replace this with a server-side `nk.vault.search()` once
      // the API exposes ripgrep over the working tree. For now, fetch every
      // note in the index and substring-match — fine for personal vaults.
      let hits = 0;
      for (const n of idx.notes) {
        const titleHit = n.title.toLowerCase().includes(q);
        let bodyHit = false;
        if (!titleHit) {
          try {
            const file = await nk.vault.readFile(n.path);
            bodyHit = (file.content ?? "").toLowerCase().includes(q);
          } catch {
            // skip
          }
        }
        if (titleHit || bodyHit) {
          process.stdout.write(`${kleur.dim(n.id)}  ${n.title}\n`);
          hits++;
        }
      }
      if (hits === 0) {
        process.stdout.write(kleur.dim("no matches\n"));
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

export const noteCommand = defineCommand({
  meta: { name: "note", description: "Create, list, edit, and search notes." },
  subCommands: {
    new: newCmd,
    list: listCmd,
    read: readCmd,
    edit: editCmd,
    rm: rmCmd,
    search: searchCmd,
  },
});

// ── helpers ────────────────────────────────────────────────────────────────

import type { NoteKitApi } from "@notekit/api-client";

async function readIndex(nk: NoteKitApi): Promise<{ index: NoteIndex; sha: string | null }> {
  try {
    const file = await nk.vault.readFile(INDEX_PATH);
    const parsed = JSON.parse(file.content ?? "{}") as Partial<NoteIndex>;
    return { index: { notes: parsed.notes ?? [] }, sha: file.sha };
  } catch {
    // No index yet (fresh vault, or pre-CLI vault). Phase 3 TODO: walk the
    // vault tree to build one on demand using `nk.vault.listFiles(prefix)`.
    return { index: { notes: [] }, sha: null };
  }
}

async function updateIndex(nk: NoteKitApi, mut: (idx: NoteIndex) => NoteIndex): Promise<void> {
  const { index, sha } = await readIndex(nk);
  const next = mut(index);
  await nk.vault.writeFile(
    INDEX_PATH,
    JSON.stringify(next, null, 2) + "\n",
    "notes: update index",
    sha ?? undefined,
  );
}

async function resolveNotePath(nk: NoteKitApi, idOrPath: string): Promise<string> {
  if (idOrPath.includes("/")) return idOrPath;
  if (idOrPath.endsWith(".md") && idOrPath.startsWith(NOTES_DIR)) return idOrPath;
  const { index: idx } = await readIndex(nk);
  const found = idx.notes.find((n) => n.id === idOrPath);
  if (found) return found.path;
  // Last resort — assume id-as-filename.
  return `${NOTES_DIR}/${idOrPath}.md`;
}
