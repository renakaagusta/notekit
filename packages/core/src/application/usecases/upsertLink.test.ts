import { describe, expect, it } from "vitest";
import type { SavedLink } from "../../domain/entities/link";
import { resolveUpsertedLink, type UpsertLinkPorts } from "./upsertLink";

const ports = (encryptionRequired = false): UpsertLinkPorts => ({
  clock: { now: () => 0, nowIso: () => "2026-01-02T03:04:05.000Z" },
  resolvePath: (l) => `links/${l.folder ? l.folder + "/" : ""}${l.title}--${l.id}.md`,
  deriveTitle: (url) => `title:${url}`,
  detectPlatform: (url) => (url.includes("youtube") ? "youtube" : null),
  detectLinkKind: (url) => (url.endsWith(".pdf") ? "pdf" : "link"),
  cleanFolder: (f) => (f ? f.trim().replace(/^\/+|\/+$/g, "") : null),
  encryptionRequired,
});

describe("resolveUpsertedLink", () => {
  it("derives title/platform/kind from the URL when absent", () => {
    const l = resolveUpsertedLink("l1", { url: "https://x.pdf" }, undefined, ports());
    expect(l.title).toBe("title:https://x.pdf");
    expect(l.platform).toBe(null);
    expect(l.kind).toBe("pdf");
    expect(l.path).toBe("links/title:https://x.pdf--l1.md");
    expect(l.createdAt).toBe("2026-01-02T03:04:05.000Z");
    expect(l.encrypted).toBe(false);
  });

  it("prefers an explicit trimmed title over derivation, then existing", () => {
    expect(resolveUpsertedLink("l", { url: "u", title: "  Hi  " }, undefined, ports()).title).toBe("Hi");
    const existing = { id: "l", path: "p", url: "u", title: "Old", description: null, platform: null, tags: [], folder: null, createdAt: "c", updatedAt: "c" } satisfies SavedLink;
    expect(resolveUpsertedLink("l", { url: "u" }, existing, ports()).title).toBe("Old");
  });

  it("clears folder on explicit null but inherits when omitted", () => {
    const existing = { id: "l", path: "p", url: "u", title: "t", description: null, platform: null, tags: [], folder: "work", createdAt: "c", updatedAt: "c" } satisfies SavedLink;
    expect(resolveUpsertedLink("l", { url: "u", folder: null }, existing, ports()).folder).toBe(null);
    expect(resolveUpsertedLink("l", { url: "u" }, existing, ports()).folder).toBe("work");
  });

  it("preserves createdAt/path and keeps encrypted sticky", () => {
    const existing = { id: "l", path: "links/old--l.md", url: "u", title: "t", description: null, platform: null, tags: [], folder: null, createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z", encrypted: true } satisfies SavedLink;
    const l = resolveUpsertedLink("l", { url: "u" }, existing, ports(false));
    expect(l.createdAt).toBe("2020-01-01T00:00:00.000Z");
    expect(l.updatedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(l.path).toBe("links/old--l.md");
    expect(l.encrypted).toBe(true);
  });
});
