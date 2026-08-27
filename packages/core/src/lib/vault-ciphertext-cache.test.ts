import type { NoteKitApi } from "@notekit/api-client";
import { generateIdentity, identityToRecipient } from "age-encryption";
import { beforeAll, describe, expect, it } from "vitest";
import type { Ticket } from "../domain/entities/ticket";
import { serializeEncryptedTicket, type RecoveryIdentity } from "./crypto";
import { createInMemoryCiphertextCache } from "./vault-ciphertext-cache";
import { listEncryptedTickets } from "./vault-e2ee";

let identity: RecoveryIdentity;
let recipient: string;

beforeAll(async () => {
  const id = await generateIdentity();
  recipient = await identityToRecipient(id);
  identity = { identity: id, recipient };
});

function ticket(id: string): Ticket {
  return {
    id,
    path: `tickets/${id}.md.age`,
    title: `Ticket ${id}`,
    body: "body",
    status: "todo",
    priority: "medium",
    assignee: null,
    labels: [],
    linkedNotes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    dueDate: null,
    createdBy: null,
  };
}

/**
 * A fake vault backed by an in-memory {path → {sha, content}} map, counting how
 * many times readFile hits the "network". listFiles returns the blob shas the
 * cache keys on.
 */
async function fakeVault(tickets: Ticket[]) {
  const files = new Map<string, { sha: string; content: string }>();
  for (const [i, t] of tickets.entries()) {
    files.set(t.path, {
      sha: `sha-${i}`,
      content: await serializeEncryptedTicket(t, [recipient]),
    });
  }
  let readCount = 0;
  const nk = {
    vault: {
      async listFiles() {
        return { entries: [...files].map(([path, f]) => ({ path, sha: f.sha })) };
      },
      async readFile(path: string) {
        readCount++;
        const f = files.get(path);
        return { path, sha: f?.sha ?? null, content: f?.content ?? null };
      },
    },
  } as unknown as NoteKitApi;
  async function setFile(t: Ticket, sha: string) {
    files.set(t.path, { sha, content: await serializeEncryptedTicket(t, [recipient]) });
  }
  return { nk, reads: () => readCount, setFile };
}

describe("listEncryptedTickets with a ciphertext cache", () => {
  it("reads every file cold, then serves a warm cache with zero readFile calls", async () => {
    const { nk, reads } = await fakeVault([ticket("a"), ticket("b"), ticket("c")]);
    const cache = createInMemoryCiphertextCache();

    const cold = await listEncryptedTickets(nk, identity, cache);
    expect(cold.map((t) => t.id).sort()).toEqual(["a", "b", "c"]);
    expect(reads()).toBe(3);

    const warm = await listEncryptedTickets(nk, identity, cache);
    expect(warm.map((t) => t.id).sort()).toEqual(["a", "b", "c"]);
    // Every blob sha was already cached → no further network reads.
    expect(reads()).toBe(3);
  });

  it("re-reads only the file whose blob sha changed", async () => {
    const { nk, reads, setFile } = await fakeVault([ticket("a"), ticket("b")]);
    const cache = createInMemoryCiphertextCache();
    await listEncryptedTickets(nk, identity, cache);
    expect(reads()).toBe(2);

    // Edit ticket "a": same path, new blob sha + new ciphertext. "b" unchanged.
    await setFile({ ...ticket("a"), title: "Edited" }, "sha-a2");

    const after = await listEncryptedTickets(nk, identity, cache);
    // "b" (sha-1) still cached; only "a" (new sha) refetched.
    expect(reads()).toBe(3);
    expect(after.find((t) => t.id === "a")?.title).toBe("Edited");
  });

  it("still works with no cache (backward compatible)", async () => {
    const { nk, reads } = await fakeVault([ticket("a")]);
    const out = await listEncryptedTickets(nk, identity);
    expect(out.map((t) => t.id)).toEqual(["a"]);
    expect(reads()).toBe(1);
  });
});
