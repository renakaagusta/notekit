// End-to-end-ish smoke test for the MCP server. We pair a real
// `McpServer` (via `createMcpServer`) with a real `Client` using the
// in-memory transport pair so the JSON-RPC plumbing is exercised, but
// the NoteKit API is stubbed via a global `fetch` mock so no network is
// involved.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server.js";

interface MockFetchOptions {
  vaults?: { id: string; owner: string; repo: string; branch: string; provider?: string }[];
  listResponses?: Record<string, { entries: { path: string; sha: string }[] }>;
  fileResponses?: Record<string, { path: string; sha: string; content: string }>;
  /** Per-path response to writeFile (PUT /vault/file). */
  writeResponses?: Record<string, { path: string; sha: string }>;
  /** Capture commits requested via listCommits. */
  commits?: { sha: string; message: string; author: string; date: string; path?: string }[];
}

function setupMockFetch(opts: MockFetchOptions = {}) {
  const calls: { url: string; method: string }[] = [];
  const vaults = opts.vaults ?? [
    { id: "v1", owner: "renakaagusta", repo: "notekit-vault", branch: "main", provider: "github" },
  ];
  const handler = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const urlString = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url: urlString, method });
    const url = new URL(urlString);
    const pathname = url.pathname;

    if (pathname === "/vault/vaults") {
      return new Response(
        JSON.stringify({ activeId: vaults[0]?.id ?? null, vaults }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (pathname === "/vault/status") {
      return new Response(
        JSON.stringify({ vault: vaults[0] ?? null }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (pathname === "/vault/list") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const body = opts.listResponses?.[prefix] ?? { entries: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (pathname === "/vault/file" && (method === "GET" || method === undefined)) {
      const path = url.searchParams.get("path") ?? "";
      const body = opts.fileResponses?.[path];
      if (!body) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (pathname === "/vault/file" && method === "PUT") {
      let parsedBody: { path?: string } = {};
      try {
        parsedBody = JSON.parse(typeof init?.body === "string" ? init.body : "") as { path?: string };
      } catch {
        // ignore
      }
      const body = opts.writeResponses?.[parsedBody.path ?? ""] ?? {
        path: parsedBody.path ?? "",
        sha: "newsha",
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (pathname === "/vault/file" && method === "DELETE") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (pathname === "/vault/commits") {
      return new Response(JSON.stringify({ commits: opts.commits ?? [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not mocked: " + urlString, { status: 501 });
  });
  vi.stubGlobal("fetch", handler);
  return { calls };
}

async function connectClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({
    baseUrl: "http://localhost:9999",
    token: "test-token",
  });
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

describe("createMcpServer — tool inventory", () => {
  beforeEach(() => {
    setupMockFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers every advertised tool, including the new project_* trio", async () => {
    const { client, server } = await connectClient();
    try {
      const list = await client.listTools();
      const names = list.tools.map((t) => t.name).sort();
      expect(names).toContain("vault_list");
      expect(names).toContain("notes_search");
      expect(names).toContain("notes_read");
      expect(names).toContain("notes_create");
      expect(names).toContain("notes_update");
      expect(names).toContain("tickets_list");
      expect(names).toContain("tickets_create");
      expect(names).toContain("tickets_update");
      expect(names).toContain("project_list");
      expect(names).toContain("project_current");
      expect(names).toContain("project_create");
      // Slice C additions:
      expect(names).toContain("notes_delete");
      expect(names).toContain("notes_move");
      expect(names).toContain("notes_append");
      expect(names).toContain("tickets_delete");
      expect(names).toContain("inbox_append");
      expect(names).toContain("links_list");
      expect(names).toContain("links_create");
      expect(names).toContain("recent_activity");
      expect(names).toContain("vault_grep");
      expect(names).toContain("list_directory");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("exposes the Slice C prompts as /notekit:* slash commands", async () => {
    const { client, server } = await connectClient();
    try {
      const list = await client.listPrompts();
      const names = list.prompts.map((p) => p.name).sort();
      expect(names).toContain("notekit:daily");
      expect(names).toContain("notekit:capture");
      expect(names).toContain("notekit:ticket-triage");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("tool annotations are populated (readOnlyHint / destructiveHint)", async () => {
    const { client, server } = await connectClient();
    try {
      const list = await client.listTools();
      const byName = new Map(list.tools.map((t) => [t.name, t]));
      expect(byName.get("notes_search")?.annotations?.readOnlyHint).toBe(true);
      expect(byName.get("notes_delete")?.annotations?.destructiveHint).toBe(true);
      expect(byName.get("tickets_delete")?.annotations?.destructiveHint).toBe(true);
      expect(byName.get("recent_activity")?.annotations?.readOnlyHint).toBe(true);
      expect(byName.get("vault_grep")?.annotations?.readOnlyHint).toBe(true);
      expect(byName.get("list_directory")?.annotations?.readOnlyHint).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("recent_activity returns the stubbed commit list", async () => {
    setupMockFetch({
      commits: [
        { sha: "abc1234", message: "notekit: add note", author: "rena", date: "2026-05-21T10:00:00Z", path: "notes/x.md" },
        { sha: "def5678", message: "notekit: ticket update", author: "rena", date: "2026-05-21T11:00:00Z" },
      ],
    });
    const { client, server } = await connectClient();
    try {
      const result = await client.callTool({ name: "recent_activity", arguments: { limit: 5 } });
      const text = (result.content as { type: string; text: string }[])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
      const parsed = JSON.parse(text);
      expect(parsed.count).toBe(2);
      expect(parsed.commits[0].sha).toBe("abc1234");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("vault_grep finds substring matches across notes", async () => {
    setupMockFetch({
      listResponses: {
        "notes/": { entries: [{ path: "notes/a.md", sha: "s1" }] },
        "tickets/": { entries: [] },
        "links/": { entries: [] },
        "inbox/": { entries: [] },
        "projects/": { entries: [] },
      },
      fileResponses: {
        "notes/a.md": {
          path: "notes/a.md",
          sha: "s1",
          content: "---\ntitle: Alpha\n---\nthis is a target line\nand another",
        },
      },
    });
    const { client, server } = await connectClient();
    try {
      const result = await client.callTool({
        name: "vault_grep",
        arguments: { pattern: "target", limit: 5 },
      });
      const text = (result.content as { type: string; text: string }[])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
      const parsed = JSON.parse(text);
      expect(parsed.count).toBe(1);
      expect(parsed.hits[0].text).toContain("target");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("inbox_append creates a fresh daily file on a clean inbox", async () => {
    setupMockFetch({
      // no fileResponses → readFile returns 404 → first capture of the day
    });
    const { client, server } = await connectClient();
    try {
      const result = await client.callTool({
        name: "inbox_append",
        arguments: { text: "remember this", source: "test" },
      });
      const text = (result.content as { type: string; text: string }[])
        .map((c) => c.text)
        .join("");
      expect(text).toMatch(/Captured to inbox\/\d{4}-\d{2}-\d{2}\.md/);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("links_create writes a properly-shaped link file", async () => {
    let lastWriteBody: { path?: string; content?: string } = {};
    const fetchHandler = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(urlString);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.pathname === "/vault/file" && method === "PUT") {
        lastWriteBody = JSON.parse(typeof init?.body === "string" ? init.body : "") as { path?: string; content?: string };
        return new Response(JSON.stringify({ path: lastWriteBody.path ?? "", sha: "x" }), { status: 200 });
      }
      if (url.pathname === "/vault/list") {
        return new Response(JSON.stringify({ entries: [] }), { status: 200 });
      }
      return new Response("not mocked", { status: 501 });
    });
    vi.stubGlobal("fetch", fetchHandler);
    const { client, server } = await connectClient();
    try {
      const result = await client.callTool({
        name: "links_create",
        arguments: { url: "https://github.com/anthropics/claude-code", title: "Claude Code", tags: ["mcp", "agent"] },
      });
      const text = (result.content as { type: string; text: string }[])
        .map((c) => c.text)
        .join("");
      expect(text).toContain("Saved");
      expect(lastWriteBody.path).toMatch(/^links\/.+\.md$/);
      expect(lastWriteBody.content).toContain("url: https://github.com/anthropics/claude-code");
      expect(lastWriteBody.content).toContain("# Claude Code");
      expect(lastWriteBody.content).toContain("platform: github");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("notekit:daily prompt returns a guidance message that references today's date", async () => {
    const { client, server } = await connectClient();
    try {
      const result = await client.getPrompt({ name: "notekit:daily" });
      const text = result.messages
        .map((m) => (m.content.type === "text" ? m.content.text : ""))
        .join("\n");
      const today = new Date().toISOString().slice(0, 10);
      expect(text).toContain(today);
      expect(text).toContain("notes_search");
      expect(text).toContain("notes_create");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("notekit:capture prompt embeds the user-supplied text", async () => {
    const { client, server } = await connectClient();
    try {
      const result = await client.getPrompt({
        name: "notekit:capture",
        arguments: { text: "watch this YT video later" },
      });
      const text = result.messages
        .map((m) => (m.content.type === "text" ? m.content.text : ""))
        .join("\n");
      expect(text).toContain("watch this YT video later");
      expect(text).toContain("inbox_append");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("vault_list returns the stub vault payload", async () => {
    const { client, server } = await connectClient();
    try {
      const result = await client.callTool({ name: "vault_list", arguments: {} });
      const text = (result.content as { type: string; text: string }[])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      expect(text).toContain("renakaagusta");
      expect(text).toContain("notekit-vault");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("project_current returns null project when no marker is present in cwd", async () => {
    // We can't easily mock process.cwd() here, but as long as the test
    // is run from a directory without a `.notekit` marker (the repo
    // root is the typical case), the response should still be valid
    // JSON with a `project` field.
    const { client, server } = await connectClient();
    try {
      const result = await client.callTool({ name: "project_current", arguments: {} });
      const text = (result.content as { type: string; text: string }[])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
      const parsed = JSON.parse(text);
      expect(parsed).toHaveProperty("project");
      expect(parsed).toHaveProperty("cwd");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("notes_search reports the resolved scope even on an empty vault", async () => {
    setupMockFetch({
      listResponses: {
        "notes/": { entries: [] },
        "projects/": { entries: [] },
      },
    });
    const { client, server } = await connectClient();
    try {
      const result = await client.callTool({
        name: "notes_search",
        arguments: { query: "anything" },
      });
      const text = (result.content as { type: string; text: string }[])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
      const parsed = JSON.parse(text);
      expect(parsed.count).toBe(0);
      expect(["project", "global", "all"]).toContain(parsed.scope);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
