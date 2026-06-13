import { describe, it, expect } from "vitest";
import {
  serializeNote,
  deserializeNote,
  serializeLink,
  deserializeLink,
} from "./serialize";
import type { Note } from "../types/note";
import type { SavedLink } from "../types/link";

const baseNote: Note = {
  id: "n1",
  path: "notes/a--n1.md",
  title: "",
  body: "# Hello\n\nbody",
  frontmatter: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  folder: null,
  tags: ["x"],
};

const baseLink: SavedLink = {
  id: "l1",
  path: "links/a--l1.md",
  url: "https://example.com/x.png",
  title: "X",
  description: "desc",
  platform: null,
  tags: ["x"],
  folder: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("note format", () => {
  it("defaults to md and does not write a format key (no churn)", () => {
    const out = serializeNote(baseNote);
    expect(out).not.toContain("format:");
    expect(deserializeNote(baseNote.path, out)?.format).toBe("md");
  });

  it("round-trips an html note", () => {
    const out = serializeNote({ ...baseNote, format: "html" });
    expect(out).toContain("format: html");
    expect(deserializeNote(baseNote.path, out)?.format).toBe("html");
  });
});

describe("link kind", () => {
  it("defaults to link and does not write a kind key (no churn)", () => {
    const out = serializeLink(baseLink);
    expect(out).not.toContain("kind:");
    expect(deserializeLink(baseLink.path, out)?.kind).toBe("link");
  });

  it("round-trips image and pdf kinds", () => {
    for (const kind of ["image", "pdf"] as const) {
      const out = serializeLink({ ...baseLink, kind });
      expect(out).toContain(`kind: ${kind}`);
      expect(deserializeLink(baseLink.path, out)?.kind).toBe(kind);
    }
  });

  it("falls back to link for an unknown kind value", () => {
    const out = serializeLink(baseLink).replace(
      `url: ${baseLink.url}`,
      `url: ${baseLink.url}\nkind: bogus`,
    );
    expect(deserializeLink(baseLink.path, out)?.kind).toBe("link");
  });
});
