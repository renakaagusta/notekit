import { describe, expect, it } from "vitest";
import type { Ticket } from "../../domain/entities/ticket";
import { resolveUpsertedTicket, type UpsertTicketPorts } from "./upsertTicket";

const ports = (encryptionRequired = false, defaultCreator: string | null = "user:me"): UpsertTicketPorts => ({
  clock: { now: () => 0, nowIso: () => "2026-01-02T03:04:05.000Z" },
  resolvePath: (t) => `tickets/${t.title || "untitled"}--${t.id}.md`,
  encryptionRequired,
  defaultCreator,
  existingKeys: [],
});

describe("resolveUpsertedTicket", () => {
  it("creates a fresh ticket with defaults, timestamps, path and creator", () => {
    const t = resolveUpsertedTicket("t1", { title: "Do it" }, undefined, ports());
    expect(t).toEqual<Ticket>({
      id: "t1",
      key: "do-it",
      path: "tickets/Do it--t1.md",
      title: "Do it",
      body: "",
      status: "todo",
      priority: "medium",
      assignee: null,
      labels: [],
      linkedNotes: [],
      createdAt: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-01-02T03:04:05.000Z",
      dueDate: null,
      createdBy: "user:me",
      encrypted: false,
    });
  });

  it("preserves createdAt/path/inherited fields and advances updatedAt on merge", () => {
    const existing: Ticket = {
      id: "t1", path: "tickets/old--t1.md", title: "Old", body: "old", status: "in_progress",
      priority: "high", assignee: "bob", labels: ["a"], linkedNotes: ["n1"],
      createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z",
      dueDate: "2021-01-01", createdBy: "user:orig", encrypted: false,
    };
    const t = resolveUpsertedTicket("t1", { title: "New" }, existing, ports());
    expect(t.createdAt).toBe("2020-01-01T00:00:00.000Z");
    expect(t.updatedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(t.path).toBe("tickets/old--t1.md");
    expect(t.status).toBe("in_progress");
    expect(t.assignee).toBe("bob");
    expect(t.createdBy).toBe("user:orig");
  });

  it("keeps encrypted sticky under a plaintext policy", () => {
    const existing = { id: "e", path: "p", title: "t", body: "", status: "todo", priority: "medium", assignee: null, labels: [], linkedNotes: [], createdAt: "t", updatedAt: "t", dueDate: null, createdBy: null, encrypted: true } satisfies Ticket;
    expect(resolveUpsertedTicket("e", { title: "t" }, existing, ports(false)).encrypted).toBe(true);
  });

  it("defaults new tickets to the vault encryption policy", () => {
    expect(resolveUpsertedTicket("n", { title: "t" }, undefined, ports(true)).encrypted).toBe(true);
  });

  it("derives a human-friendly key from the title on create", () => {
    expect(resolveUpsertedTicket("t1", { title: "Deploy to prod" }, undefined, ports()).key).toBe(
      "deploy-to-prod",
    );
  });

  it("de-dupes the derived key against other tickets' keys", () => {
    const t = resolveUpsertedTicket("t2", { title: "Deploy" }, undefined, {
      ...ports(),
      existingKeys: ["deploy"],
    });
    expect(t.key).toBe("deploy-2");
  });

  it("keeps a ticket's key stable across a plain title edit", () => {
    const existing = { ...(resolveUpsertedTicket("t1", { title: "Deploy" }, undefined, ports())) };
    const renamed = resolveUpsertedTicket("t1", { title: "Deploy v2" }, existing, ports());
    expect(renamed.key).toBe("deploy");
  });

  it("renames the key when the command supplies one, slugging and de-duping it", () => {
    const existing = resolveUpsertedTicket("t1", { title: "Deploy" }, undefined, ports());
    const renamed = resolveUpsertedTicket("t1", { title: "Deploy", key: "Ship It" }, existing, ports());
    expect(renamed.key).toBe("ship-it");
  });
});
