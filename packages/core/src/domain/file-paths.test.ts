/**
 * Path-resolution tests. These guard the contract between
 * `file-paths.ts` and `sync.ts`: encrypted items use opaque filenames
 * with `.md.age`, plaintext items keep the slug-bearing form.
 */

import { describe, expect, it } from "vitest";
import {
  encryptedLinkPathFor,
  encryptedNotePathFor,
  encryptedTicketPathFor,
  isEncryptedItemPath,
  linkPathFor,
  notePathFor,
  ticketPathFor,
} from "./file-paths";

describe("encrypted path helpers", () => {
  it("notes drop the slug and use <id>.md.age regardless of folder", () => {
    expect(
      encryptedNotePathFor({ id: "abc123def456" }),
    ).toBe("notes/abc123def456.md.age");
  });

  it("tickets drop the slug and use <id>.md.age", () => {
    expect(encryptedTicketPathFor({ id: "tkt7y8z9" })).toBe(
      "tickets/tkt7y8z9.md.age",
    );
  });

  it("links drop the slug and use <id>.md.age", () => {
    expect(encryptedLinkPathFor({ id: "lnk2c3d4" })).toBe(
      "links/lnk2c3d4.md.age",
    );
  });

  it("opaque encrypted path differs from the slug-bearing plaintext path", () => {
    const id = "abc123def456";
    const plaintext = notePathFor({
      id,
      body: "# My therapy session notes",
      folder: "private/health",
      title: "",
    });
    const encrypted = encryptedNotePathFor({ id });
    expect(plaintext).not.toBe(encrypted);
    // The plaintext path leaks the title via slug.
    expect(plaintext).toContain("therapy");
    // The encrypted one leaks nothing about the title.
    expect(encrypted).not.toContain("therapy");
    expect(encrypted).not.toContain("private");
    expect(encrypted).not.toContain("health");
  });

  it("ticket and link plaintext paths leak titles; encrypted ones don't", () => {
    const plainT = ticketPathFor({
      id: "tkt7y8z9",
      title: "Fire client X",
    });
    const encT = encryptedTicketPathFor({ id: "tkt7y8z9" });
    expect(plainT).toContain("fire-client-x");
    expect(encT).not.toContain("fire");

    const plainL = linkPathFor({
      id: "lnk2c3d4",
      title: "Therapy booking",
    });
    const encL = encryptedLinkPathFor({ id: "lnk2c3d4" });
    expect(plainL).toContain("therapy");
    expect(encL).not.toContain("therapy");
  });
});

describe("isEncryptedItemPath", () => {
  it("matches .md.age", () => {
    expect(isEncryptedItemPath("notes/abc.md.age")).toBe(true);
    expect(isEncryptedItemPath("tickets/abc.md.age")).toBe(true);
    expect(isEncryptedItemPath("links/abc.md.age")).toBe(true);
  });

  it("rejects plaintext markdown", () => {
    expect(isEncryptedItemPath("notes/abc.md")).toBe(false);
    expect(isEncryptedItemPath("tickets/abc.md")).toBe(false);
  });

  it("rejects other extensions", () => {
    expect(isEncryptedItemPath("attachments/abc.png")).toBe(false);
    expect(isEncryptedItemPath("notes/abc.age")).toBe(false);
    expect(isEncryptedItemPath("notes/abc.md.age.bak")).toBe(false);
  });
});
