/**
 * Provider parity tests for vault/agents.ts.
 *
 * The helpers were refactored to dispatch by provider; this test asserts both
 * "github" and "notekit" paths produce the same shape of result, and that the
 * dispatcher actually calls the right backend (no cross-wiring).
 *
 * We mock global fetch so the tests run without a network. Each backend's
 * response shape is impersonated only as far as needed — the goal is parity
 * of dispatch, not exhaustive HTTP coverage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAgent, writeAgent, deleteAgentFile, listAgents } from "./agents";

type FetchCall = { url: string; init?: RequestInit };

function setupFetchMock() {
  const calls: FetchCall[] = [];
  const handler = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const u = String(url);

    // Read: github via /repos/owner/repo/contents/path
    if (u.includes("/contents/agents/scribe.json") && (!init || init.method === undefined || init.method === "GET")) {
      const payload = {
        slug: "scribe",
        name: "Scribe",
        email: "scribe@agents.notekit.app",
        description: "writes things",
        avatarUrl: null,
        createdAt: "2026-05-20T00:00:00.000Z",
      };
      return new Response(
        JSON.stringify({
          path: "agents/scribe.json",
          sha: "abc123",
          content: Buffer.from(JSON.stringify(payload)).toString("base64"),
          encoding: "base64",
        }),
        { status: 200 },
      );
    }

    // Write: PUT to /contents/agents/<slug>.json
    if (u.includes("/contents/agents/") && init?.method === "PUT") {
      return new Response(
        JSON.stringify({ content: { sha: "newsha999" } }),
        { status: 200 },
      );
    }

    // Delete: DELETE to /contents/agents/<slug>.json. Per fetch spec, 204
    // responses cannot carry a body.
    if (u.includes("/contents/agents/") && init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }

    // listTree branch ref lookup (Forgejo + GitHub paths)
    if (u.includes("/git/refs/heads/main")) {
      return new Response(JSON.stringify({ object: { sha: "treeref000" } }), {
        status: 200,
      });
    }
    if (u.includes("/git/trees/treeref000")) {
      return new Response(
        JSON.stringify({
          tree: [
            { path: "agents/scribe.json", type: "blob", sha: "abc123", size: 100 },
          ],
        }),
        { status: 200 },
      );
    }

    return new Response("not mocked: " + u, { status: 500 });
  });
  vi.stubGlobal("fetch", handler);
  return calls;
}

describe("vault/agents provider parity", () => {
  let calls: FetchCall[];

  beforeEach(() => {
    calls = setupFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe.each(["github", "notekit"] as const)("provider=%s", (provider) => {
    it("reads an agent profile by slug", async () => {
      const found = await readAgent(provider, "tok", "alice", "vault", "main", "scribe");
      expect(found).not.toBeNull();
      expect(found!.profile).toMatchObject({
        slug: "scribe",
        name: "Scribe",
        email: "scribe@agents.notekit.app",
      });
      expect(found!.sha).toBe("abc123");
    });

    it("writes an agent profile and returns a sha", async () => {
      const profile = {
        slug: "scribe",
        name: "Scribe",
        email: "scribe@agents.notekit.app",
        description: "",
        avatarUrl: null,
        createdAt: "2026-05-20T00:00:00.000Z",
      };
      const res = await writeAgent(provider, "tok", "alice", "vault", "main", profile);
      expect(res.sha).toBe("newsha999");
    });

    it("deletes an agent file without throwing", async () => {
      await expect(
        deleteAgentFile(provider, "tok", "alice", "vault", "main", "scribe", "abc123"),
      ).resolves.toBeUndefined();
    });

    it("lists agents under agents/ in the tree", async () => {
      const out = await listAgents(provider, "tok", "alice", "vault", "main");
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ slug: "scribe", name: "Scribe" });
    });

    it("hits the correct backend host", async () => {
      await readAgent(provider, "tok", "alice", "vault", "main", "scribe");
      // The first call should hit either api.github.com (github) or our
      // configured Forgejo URL (notekit). We don't care about the exact
      // path — only that we're not cross-wired.
      const firstCallUrl = calls.find((c) =>
        c.url.includes("/contents/agents/scribe.json"),
      )?.url;
      expect(firstCallUrl).toBeDefined();
      if (provider === "github") {
        expect(firstCallUrl).toContain("api.github.com");
      } else {
        // forgejo.ts falls back to http://notekit-git:3000 when FORGEJO_URL
        // isn't set. Don't pin the host — just assert we didn't hit GitHub.
        expect(firstCallUrl).not.toContain("api.github.com");
      }
    });
  });
});
