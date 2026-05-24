/**
 * Round-trip tests for per-item E2EE. Validates that:
 *
 *   1. encrypt → decrypt restores every plaintext field exactly
 *   2. the on-disk envelope advertises only the surface's public
 *      frontmatter — no titles, no URLs, no assignees in the clear
 *   3. envelopes from other kinds reject (a `note` envelope can't be
 *      deserialized as a ticket and vice versa)
 *   4. the parser distinguishes encrypted envelopes from plaintext
 *      markdown so the sync layer can dispatch by content shape
 */

import { describe, expect, it, beforeAll } from "vitest";
import {
  generateIdentity,
  identityToRecipient,
} from "age-encryption";
import type { Note } from "../../types/note";
import type { Ticket } from "../../types/ticket";
import type { SavedLink } from "../../types/link";
import {
  classifyEncryptedPath,
  deserializeEncryptedLink,
  deserializeEncryptedNote,
  deserializeEncryptedTicket,
  isEncryptedItemPath,
  parseEncryptedEnvelope,
  serializeEncryptedLink,
  serializeEncryptedNote,
  serializeEncryptedTicket,
} from "./item-crypto";

let identity: string;
let recipient: string;

beforeAll(async () => {
  identity = await generateIdentity();
  recipient = await identityToRecipient(identity);
});

function buildNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "abc123def456",
    path: "notes/abc123def456.md.age",
    title: "My therapy session notes",
    body: "# My therapy session notes\n\nDiscussed anxiety patterns and grounding exercises.",
    frontmatter: {},
    createdAt: "2026-05-20T09:00:00.000Z",
    updatedAt: "2026-05-20T09:45:00.000Z",
    folder: "private/health",
    tags: ["health", "personal"],
    ...overrides,
  };
}

function buildTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "tkt7y8z9a0b1",
    path: "tickets/tkt7y8z9a0b1.md.age",
    title: "Fire client X — they're threatening legal",
    body: "Send termination letter via certified mail. Loop in Sarah from legal.",
    status: "in_progress",
    priority: "urgent",
    assignee: "sarah",
    labels: ["client", "sensitive"],
    linkedNotes: ["abc123def456"],
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:15:00.000Z",
    dueDate: "2026-05-25T00:00:00.000Z",
    createdBy: "renakaagusta",
    ...overrides,
  };
}

function buildLink(overrides: Partial<SavedLink> = {}): SavedLink {
  return {
    id: "lnk2c3d4e5f6",
    path: "links/lnk2c3d4e5f6.md.age",
    url: "https://therapist-portal.example.com/booking?ref=secret",
    title: "Therapy booking portal",
    description: "Use the second slot when available",
    platform: "web",
    tags: ["health"],
    folder: "reading/health",
    createdAt: "2026-05-19T18:00:00.000Z",
    updatedAt: "2026-05-19T18:00:00.000Z",
    ...overrides,
  };
}

describe("notes E2EE round-trip", () => {
  it("restores every private field after encrypt → decrypt", async () => {
    const original = buildNote();
    const content = await serializeEncryptedNote(original, [recipient]);
    const restored = await deserializeEncryptedNote(
      original.path,
      content,
      identity,
    );
    expect(restored).not.toBeNull();
    expect(restored!.id).toBe(original.id);
    expect(restored!.title).toBe(original.title);
    expect(restored!.body).toBe(original.body);
    expect(restored!.tags).toEqual(original.tags);
    expect(restored!.folder).toBe(original.folder);
    expect(restored!.createdAt).toBe(original.createdAt);
    expect(restored!.updatedAt).toBe(original.updatedAt);
  });

  it("keeps title and body out of the plaintext envelope", async () => {
    const note = buildNote();
    const content = await serializeEncryptedNote(note, [recipient]);
    // The plaintext header above the age block should not contain the
    // title, body, or tag values.
    const headerEnd = content.indexOf("-----BEGIN AGE ENCRYPTED FILE-----");
    expect(headerEnd).toBeGreaterThan(0);
    const header = content.slice(0, headerEnd);
    expect(header).not.toContain("therapy");
    expect(header).not.toContain("anxiety");
    expect(header).not.toContain("personal");
    // Folder DOES leak — that's intentional for sidebar nav.
    expect(header).toContain("private/health");
  });
});

describe("tickets E2EE round-trip", () => {
  it("restores every private field after encrypt → decrypt", async () => {
    const original = buildTicket();
    const content = await serializeEncryptedTicket(original, [recipient]);
    const restored = await deserializeEncryptedTicket(
      original.path,
      content,
      identity,
    );
    expect(restored).not.toBeNull();
    expect(restored!.title).toBe(original.title);
    expect(restored!.body).toBe(original.body);
    expect(restored!.assignee).toBe(original.assignee);
    expect(restored!.labels).toEqual(original.labels);
    expect(restored!.linkedNotes).toEqual(original.linkedNotes);
    expect(restored!.createdBy).toBe(original.createdBy);
    // Plaintext metadata must round-trip too — the board reads it
    // straight out of the public frontmatter without unlock.
    expect(restored!.status).toBe(original.status);
    expect(restored!.priority).toBe(original.priority);
    expect(restored!.dueDate).toBe(original.dueDate);
  });

  it("exposes status/priority/dueDate to the operator but hides title/assignee", async () => {
    const t = buildTicket();
    const content = await serializeEncryptedTicket(t, [recipient]);
    const headerEnd = content.indexOf("-----BEGIN AGE ENCRYPTED FILE-----");
    const header = content.slice(0, headerEnd);
    // These are the fields the board needs.
    expect(header).toContain("in_progress");
    expect(header).toContain("urgent");
    expect(header).toContain("2026-05-25");
    // These are the fields the user cares about hiding.
    expect(header.toLowerCase()).not.toContain("client x");
    expect(header.toLowerCase()).not.toContain("legal");
    expect(header).not.toContain("sarah");
  });
});

describe("links E2EE round-trip", () => {
  it("restores every private field after encrypt → decrypt", async () => {
    const original = buildLink();
    const content = await serializeEncryptedLink(original, [recipient]);
    const restored = await deserializeEncryptedLink(
      original.path,
      content,
      identity,
    );
    expect(restored).not.toBeNull();
    expect(restored!.title).toBe(original.title);
    expect(restored!.url).toBe(original.url);
    expect(restored!.description).toBe(original.description);
    expect(restored!.platform).toBe(original.platform);
    expect(restored!.tags).toEqual(original.tags);
    expect(restored!.folder).toBe(original.folder);
    expect(restored!.createdAt).toBe(original.createdAt);
  });

  it("hides URL and title in the plaintext envelope but exposes folder", async () => {
    const l = buildLink();
    const content = await serializeEncryptedLink(l, [recipient]);
    const headerEnd = content.indexOf("-----BEGIN AGE ENCRYPTED FILE-----");
    const header = content.slice(0, headerEnd);
    expect(header).not.toContain("therapist-portal");
    expect(header).not.toContain("booking");
    expect(header).not.toContain("Therapy");
    // Timestamps + id + kind + folder leak — folder is the only addition
    // and matches the same trade-off we make for notes.
    expect(header).toContain("2026-05-19");
    expect(header).toContain("reading/health");
  });
});

describe("envelope cross-kind safety", () => {
  it("refuses to deserialize a note envelope as a ticket", async () => {
    const note = buildNote();
    const content = await serializeEncryptedNote(note, [recipient]);
    const restored = await deserializeEncryptedTicket(
      note.path,
      content,
      identity,
    );
    expect(restored).toBeNull();
  });

  it("refuses to deserialize a ticket envelope as a link", async () => {
    const t = buildTicket();
    const content = await serializeEncryptedTicket(t, [recipient]);
    const restored = await deserializeEncryptedLink(
      t.path,
      content,
      identity,
    );
    expect(restored).toBeNull();
  });

  it("returns null on plaintext markdown — never decrypts", async () => {
    const plaintext = `---\nid: foo\ntitle: hi\n---\nplain body\n`;
    expect(parseEncryptedEnvelope(plaintext)).toBeNull();
  });

  it("returns null on truncated header", async () => {
    expect(parseEncryptedEnvelope("---\nv: 1\nencrypted: true\n")).toBeNull();
  });
});

describe("path classification", () => {
  it("classifies notes/.md.age as note", () => {
    expect(classifyEncryptedPath("notes/abc.md.age")).toBe("note");
    expect(classifyEncryptedPath("notes/sub/abc.md.age")).toBe("note");
  });
  it("classifies tickets/.md.age as ticket", () => {
    expect(classifyEncryptedPath("tickets/abc.md.age")).toBe("ticket");
  });
  it("classifies links/.md.age as link", () => {
    expect(classifyEncryptedPath("links/abc.md.age")).toBe("link");
  });
  it("returns null for plaintext .md and unknown prefixes", () => {
    expect(classifyEncryptedPath("notes/foo.md")).toBeNull();
    expect(classifyEncryptedPath("attachments/foo.md.age")).toBeNull();
    expect(classifyEncryptedPath("foo")).toBeNull();
  });
  it("isEncryptedItemPath agrees with classifyEncryptedPath", () => {
    expect(isEncryptedItemPath("notes/abc.md.age")).toBe(true);
    expect(isEncryptedItemPath("notes/abc.md")).toBe(false);
  });
});

describe("recipient enforcement", () => {
  it("a different identity cannot decrypt the payload", async () => {
    const other = await generateIdentity();
    const note = buildNote();
    const content = await serializeEncryptedNote(note, [recipient]);
    await expect(
      deserializeEncryptedNote(note.path, content, other),
    ).rejects.toThrow();
  });

  it("rejects encryption with zero recipients", async () => {
    await expect(
      serializeEncryptedNote(buildNote(), []),
    ).rejects.toThrow(/at least one recipient/);
  });
});
