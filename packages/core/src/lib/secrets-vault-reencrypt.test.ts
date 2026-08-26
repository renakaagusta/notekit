import { generateIdentity, identityToRecipient } from "age-encryption";
import { beforeEach, describe, expect, it } from "vitest";
import type { DeviceIdentity } from "./crypto/device-key";
import { decryptItemPayload, encryptItemPayload } from "./crypto/item-crypto";
import {
  configureSecretsBackend,
  configureSecretsCache,
  noopSecretsCache,
  reencryptImportedItems,
  type SecretsBackend,
} from "./secrets-vault";

/**
 * In-memory backend that records how many commit round-trips happened, so a
 * test can assert the re-seal batches every item into ONE commit rather than
 * one commit per note.
 */
function memoryBackend(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  let commits = 0;
  const backend: SecretsBackend = {
    async listFiles(prefix) {
      return {
        entries: [...files.keys()]
          .filter((p) => p.startsWith(prefix))
          .map((p) => ({ path: p, sha: `sha-${p}` })),
      };
    },
    async readFile(path) {
      const content = files.get(path) ?? null;
      return { path, content, sha: content === null ? null : `sha-${path}` };
    },
    async readFileAtRef(path) {
      const content = files.get(path) ?? null;
      return { path, content, sha: content === null ? null : `sha-${path}` };
    },
    async writeFile(path, content) {
      files.set(path, content);
      commits++;
      return { path, sha: `sha-${path}-${commits}` };
    },
    async deleteFile(path) {
      files.delete(path);
      return { ok: true };
    },
    async commitFiles(fileList) {
      for (const f of fileList) files.set(f.path, f.content);
      commits++;
      return { commitSha: `commit-${commits}` };
    },
  };
  return { backend, files, commitCount: () => commits };
}

async function newIdentity(): Promise<{ identity: string; recipient: string }> {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  return { identity, recipient };
}

function deviceFrom(identity: string, recipient: string): DeviceIdentity {
  return {
    deviceId: "dev-1",
    name: "Source",
    identity,
    recipient,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

async function itemFile(
  kind: "note" | "ticket" | "link",
  id: string,
  payload: unknown,
  recipients: string[],
): Promise<string> {
  const ciphertext = await encryptItemPayload(payload, recipients);
  return `---\nencrypted: true\nv: 1\nkind: ${kind}\nid: ${id}\n---\n${ciphertext}\n`;
}

describe("reencryptImportedItems (cross-vault migration re-seal)", () => {
  beforeEach(() => configureSecretsCache(noopSecretsCache));

  it("re-seals every imported item to the new vault key in ONE batched commit", async () => {
    const source = await newIdentity();
    const dest = await newIdentity();

    // Imported items are still encrypted to the SOURCE vault's device key.
    const { backend, files, commitCount } = memoryBackend({
      "notes/n1.md.age": await itemFile("note", "n1", { title: "One", body: "a" }, [source.recipient]),
      "notes/n2.md.age": await itemFile("note", "n2", { title: "Two", body: "b" }, [source.recipient]),
      "tickets/t1.md.age": await itemFile("ticket", "t1", { title: "Task" }, [source.recipient]),
    });
    configureSecretsBackend(backend);

    const result = await reencryptImportedItems(
      deviceFrom(source.identity, source.recipient),
      [dest.recipient],
      (kind, id) => `Re-encrypt ${kind} ${id}`,
    );

    expect(result).toEqual({ resealed: 3, skipped: 0 });
    // Batched: a single commitFiles call, NOT three per-note writes.
    expect(commitCount()).toBe(1);

    // Every item now opens with the DESTINATION key...
    const n1 = files.get("notes/n1.md.age") ?? "";
    const ct = n1.slice(n1.indexOf("-----BEGIN AGE ENCRYPTED FILE-----"));
    expect(await decryptItemPayload(ct, dest.identity)).toEqual({ title: "One", body: "a" });
    // ...and no longer with the old source key (a stranger can't read it).
    await expect(decryptItemPayload(ct, source.identity)).rejects.toThrow();
  });

  it("skips items this device cannot decrypt (never drops or corrupts them)", async () => {
    const source = await newIdentity();
    const dest = await newIdentity();
    const stranger = await newIdentity();

    const mine = await itemFile("note", "mine", { title: "mine" }, [source.recipient]);
    const foreign = await itemFile("note", "foreign", { title: "foreign" }, [stranger.recipient]);
    const { backend, files } = memoryBackend({
      "notes/mine.md.age": mine,
      "notes/foreign.md.age": foreign,
    });
    configureSecretsBackend(backend);

    const result = await reencryptImportedItems(
      deviceFrom(source.identity, source.recipient),
      [dest.recipient],
      (kind, id) => `Re-encrypt ${kind} ${id}`,
    );

    expect(result).toEqual({ resealed: 1, skipped: 1 });
    // The undecryptable item is left byte-for-byte untouched.
    expect(files.get("notes/foreign.md.age")).toBe(foreign);
  });
});
