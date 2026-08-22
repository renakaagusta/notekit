import { describe, expect, it } from "vitest";
import type { Note } from "../../domain/entities/note";
import { resolveUpsertedNote, type UpsertNotePorts } from "./upsertNote";

const ports = (encryptionRequired = false): UpsertNotePorts => ({
  clock: { now: () => 0, nowIso: () => "2026-01-02T03:04:05.000Z" },
  resolvePath: (n) => `notes/${n.folder ? n.folder + "/" : ""}${n.title || "untitled"}--${n.id}.md`,
  encryptionRequired,
});

describe("resolveUpsertedNote", () => {
  it("creates a fresh note with generated timestamps and computed path", () => {
    const note = resolveUpsertedNote("abc", { title: "Hi", body: "b", folder: "work" }, undefined, ports());
    expect(note).toEqual<Note>({
      id: "abc",
      path: "notes/work/Hi--abc.md",
      title: "Hi",
      body: "b",
      frontmatter: {},
      createdAt: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-01-02T03:04:05.000Z",
      folder: "work",
      tags: [],
      encrypted: false,
      format: undefined,
    });
  });

  it("preserves createdAt and advances updatedAt when merging over an existing note", () => {
    const existing: Note = {
      id: "abc", path: "notes/old--abc.md", title: "Old", body: "old",
      frontmatter: { a: 1 }, createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z", folder: null, tags: ["x"], encrypted: false,
    };
    const note = resolveUpsertedNote("abc", { title: "New", body: "new" }, existing, ports());
    expect(note.createdAt).toBe("2020-01-01T00:00:00.000Z");
    expect(note.updatedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(note.path).toBe("notes/old--abc.md"); // existing path preserved
    expect(note.tags).toEqual(["x"]); // inherited from existing
    expect(note.frontmatter).toEqual({ a: 1 });
  });

  it("keeps encrypted sticky: an existing encrypted note stays encrypted even under a plaintext policy", () => {
    const existing = { id: "e", path: "p", title: "t", body: "b", frontmatter: {}, createdAt: "t", updatedAt: "t", folder: null, tags: [], encrypted: true } satisfies Note;
    const note = resolveUpsertedNote("e", { title: "t", body: "b2" }, existing, ports(false));
    expect(note.encrypted).toBe(true);
  });

  it("defaults new notes to the vault encryption policy", () => {
    expect(resolveUpsertedNote("n", { title: "t", body: "b" }, undefined, ports(true)).encrypted).toBe(true);
    expect(resolveUpsertedNote("n", { title: "t", body: "b" }, undefined, ports(false)).encrypted).toBe(false);
  });

  it("lets an explicit command field override both existing and policy", () => {
    const existing = { id: "e", path: "p", title: "t", body: "b", frontmatter: {}, createdAt: "t", updatedAt: "t", folder: null, tags: [], encrypted: true } satisfies Note;
    const note = resolveUpsertedNote("e", { title: "t", body: "b", encrypted: false, tags: ["new"] }, existing, ports(true));
    expect(note.encrypted).toBe(false);
    expect(note.tags).toEqual(["new"]);
  });
});
