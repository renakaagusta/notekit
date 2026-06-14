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
import { getSecretsClient } from "../lib/secrets.js";
import {
  isEncrypted,
  decryptNote,
  vaultIsEncrypted,
  encryptNote,
  listEncryptedNotes,
} from "../lib/crypto.js";
import type { Note } from "@notekit/core/types";

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
      // getSecretsClient configures the @notekit/core backend so the E2EE
      // helpers (vaultIsEncrypted / encryptNote) can read the vault.
      const nk = await getSecretsClient({ requireAuth: true });

      const seed = args.body
        ? String(args.body)
        : `# ${args.title}\n\n`;
      const body = args.body ? String(args.body) : await openEditor({ seed, extension: ".md" });

      const id = nanoid(10);
      const now = new Date().toISOString();
      const title = String(args.title);
      const tags = args.tag ? String(args.tag).split(",").map((t) => t.trim()).filter(Boolean) : [];

      // Born-E2EE vault → seal the note as `.md.age` for the whole vault
      // audience. No plaintext index update (it would leak titles); E2EE
      // notes are listed by scanning + decrypting, like the web.
      if (await vaultIsEncrypted()) {
        const note: Note = {
          id,
          path: `${NOTES_DIR}/${id}.md.age`,
          title,
          body,
          frontmatter: {},
          createdAt: now,
          updatedAt: now,
          folder: null,
          tags,
        };
        const sealed = await encryptNote(note);
        await nk.vault.writeFile(note.path, sealed, `note: create ${id}`);
        process.stdout.write(`${kleur.green("created (encrypted)")} ${note.path}\n`);
        return;
      }

      const frontmatter = {
        id,
        title,
        createdAt: now,
        updatedAt: now,
        tags,
      };
      const content = stringifyFrontmatter(frontmatter, body.startsWith("\n") ? body : `\n${body}`);
      const path = `${NOTES_DIR}/${id}.md`;

      await nk.vault.writeFile(path, content, `note: create ${id}`);

      await updateIndex(nk, (idx) => {
        idx.notes.unshift({ id, path, title, updatedAt: now });
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
      const nk = await getSecretsClient({ requireAuth: true });
      // E2EE vault → scan + decrypt (no plaintext index). Plaintext → index.
      const rows: { id: string; title: string }[] = (await vaultIsEncrypted())
        ? await listEncryptedNotes(nk)
        : (await readIndex(nk)).index.notes;
      // `--limit foo` would otherwise become NaN and silently return zero
      // results via slice(0, NaN). Reject early so the user sees the bug.
      let limit = rows.length;
      if (args.limit) {
        const parsed = Number(args.limit);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error(`--limit must be a non-negative integer, got: ${args.limit}`);
        }
        limit = parsed;
      }
      for (const n of rows.slice(0, limit)) {
        process.stdout.write(`${kleur.dim(n.id)}  ${n.title}\n`);
      }
      if (rows.length === 0) {
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
      const nk = await getSecretsClient({ requireAuth: true });
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
      const nk = await getSecretsClient({ requireAuth: true });
      const path = await resolveNotePath(nk, String(args.idOrPath));
      const file = await nk.vault.readFile(path);
      const encrypted = isEncrypted(path);

      // Seed the editor with plaintext (decrypt first for E2EE notes).
      let seed = file.content ?? "";
      if (encrypted && seed) {
        const note = await decryptNote(path, seed);
        if (!note) throw new Error(`couldn't decrypt ${path}`);
        seed = stringifyFrontmatter(
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

      const next = await openEditor({ seed, extension: ".md" });
      if (next === seed) {
        process.stdout.write(kleur.dim("no changes\n"));
        return;
      }

      const { data, body } = parseFrontmatter(next);
      const now = new Date().toISOString();
      data.updatedAt = now;

      if (encrypted) {
        const note: Note = {
          id: String(data.id ?? ""),
          path,
          title: String(data.title ?? ""),
          body,
          frontmatter: {},
          createdAt: String(data.createdAt ?? now),
          updatedAt: now,
          folder: (data.folder as string | null | undefined) ?? null,
          tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
        };
        const sealed = await encryptNote(note);
        await nk.vault.writeFile(path, sealed, `note: edit ${note.id}`, file.sha ?? undefined);
        process.stdout.write(`${kleur.green("updated (encrypted)")} ${path}\n`);
        return;
      }

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
      const nk = await getSecretsClient({ requireAuth: true });
      const path = await resolveNotePath(nk, String(args.idOrPath));
      const existing = await nk.vault.readFile(path);
      if (!existing.sha) {
        throw new Error(`cannot delete ${path}: no sha returned from server`);
      }
      await nk.vault.deleteFile(path, existing.sha, `note: delete ${path}`);
      // E2EE vaults have no plaintext index to maintain.
      if (!isEncrypted(path)) {
        await updateIndex(nk, (idx) => {
          idx.notes = idx.notes.filter((n) => n.path !== path);
          return idx;
        });
      }
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
      const nk = await getSecretsClient({ requireAuth: true });
      const q = String(args.query).toLowerCase();
      let hits = 0;

      // E2EE vault → scan + decrypt every note and match title/body in memory.
      if (await vaultIsEncrypted()) {
        for (const n of await listEncryptedNotes(nk)) {
          if (
            n.title.toLowerCase().includes(q) ||
            n.body.toLowerCase().includes(q)
          ) {
            process.stdout.write(`${kleur.dim(n.id)}  ${n.title}\n`);
            hits++;
          }
        }
        if (hits === 0) process.stdout.write(kleur.dim("no matches\n"));
        return;
      }

      const { index: idx } = await readIndex(nk);
      // Plaintext: fetch every indexed note and substring-match.
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
  if (
    (idOrPath.endsWith(".md") || idOrPath.endsWith(".md.age")) &&
    idOrPath.startsWith(NOTES_DIR)
  ) {
    return idOrPath;
  }
  // E2EE vaults have no plaintext index; notes are `notes/<id>.md.age`.
  if (await vaultIsEncrypted()) return `${NOTES_DIR}/${idOrPath}.md.age`;
  const { index: idx } = await readIndex(nk);
  const found = idx.notes.find((n) => n.id === idOrPath);
  if (found) return found.path;
  // Last resort — assume id-as-filename.
  return `${NOTES_DIR}/${idOrPath}.md`;
}
