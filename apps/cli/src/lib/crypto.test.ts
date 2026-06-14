import { describe, it, expect } from "vitest";
import {
  generateRecoveryMnemonic,
  recoveryFromMnemonic,
  serializeEncryptedNote,
  deserializeEncryptedNote,
  isEncryptedItemPath,
} from "@notekit/core/crypto";
import type { Note } from "@notekit/core/types";

// Proves the @notekit/core crypto runs end-to-end in the CLI's Node runtime
// (age WASM + @noble + @scure), so the CLI can read/write E2EE vaults (#49).
describe("CLI E2EE round-trip (Node)", () => {
  it("encrypts a note to the recovery recipient and decrypts it back", async () => {
    const mnemonic = generateRecoveryMnemonic();
    const { identity, recipient } = await recoveryFromMnemonic(mnemonic);

    const note: Note = {
      id: "n1",
      path: "notes/n1.md.age",
      title: "Secret note",
      body: "# Secret note\n\nhush — encrypted at rest.",
      frontmatter: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      folder: "private",
      tags: ["x"],
    };

    const path = "notes/n1.md.age";
    const sealed = await serializeEncryptedNote(note, [recipient]);

    // It's a real encrypted envelope: public frontmatter + age ciphertext.
    expect(isEncryptedItemPath(path)).toBe(true);
    expect(sealed).toContain("encrypted: true");
    expect(sealed).toContain("-----BEGIN AGE ENCRYPTED FILE-----");
    expect(sealed).not.toContain("hush"); // body is not in plaintext

    const out = await deserializeEncryptedNote(path, sealed, identity);
    expect(out).not.toBeNull();
    expect(out!.title).toBe("Secret note");
    expect(out!.body).toContain("hush");
    expect(out!.tags).toEqual(["x"]);
    expect(out!.folder).toBe("private");
  });

  it("a wrong identity cannot decrypt", async () => {
    const a = await recoveryFromMnemonic(generateRecoveryMnemonic());
    const b = await recoveryFromMnemonic(generateRecoveryMnemonic());
    const note: Note = {
      id: "n2",
      path: "notes/n2.md.age",
      title: "t",
      body: "body",
      frontmatter: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      folder: null,
      tags: [],
    };
    const sealed = await serializeEncryptedNote(note, [a.recipient]);
    await expect(
      deserializeEncryptedNote("notes/n2.md.age", sealed, b.identity),
    ).rejects.toThrow();
  });
});
