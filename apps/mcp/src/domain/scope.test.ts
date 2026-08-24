// Tests for the scope resolver. Tabular cases — every interesting
// combination of (kind, requested scope, project context) is one row,
// asserting the prefixes and effective scope we promised in
// docs/MCP_DISTRIBUTION.md §2.

import { describe, expect, it } from "vitest";
import { resolveScope, projectOfPath, isUnderAnyPrefix } from "./scope.js";

const ctx = (project: string | null) =>
  project ? { project, source: "/marker", scope: undefined, vault: undefined } : null;

describe("resolveScope", () => {
  it("scope=project with marker → projects/<slug>/notes/ + top-level fallback", () => {
    const r = resolveScope("notes", { scope: "project", ctx: ctx("notekit") });
    expect(r.readPrefixes).toEqual(["projects/notekit/notes/", "notes/"]);
    expect(r.writePrefix).toBe("projects/notekit/notes/");
    expect(r.effective).toBe("project");
    expect(r.project).toBe("notekit");
  });

  it("scope=project without marker degrades to all", () => {
    const r = resolveScope("notes", { scope: "project", ctx: null });
    expect(r.effective).toBe("all");
    expect(r.project).toBeNull();
    expect(r.readPrefixes).toEqual(["notes/", "projects/"]);
    expect(r.writePrefix).toBe("notes/");
  });

  it("scope=global ignores marker", () => {
    const r = resolveScope("tickets", { scope: "global", ctx: ctx("notekit") });
    expect(r.readPrefixes).toEqual(["tickets/"]);
    expect(r.writePrefix).toBe("tickets/");
    expect(r.effective).toBe("global");
  });

  it("scope=all reads everywhere, writes top-level", () => {
    const r = resolveScope("inbox", { scope: "all", ctx: ctx("notekit") });
    expect(r.readPrefixes).toEqual(["inbox/", "projects/"]);
    expect(r.writePrefix).toBe("inbox/");
    expect(r.effective).toBe("all");
  });

  it("explicit project arg overrides ctx", () => {
    const r = resolveScope("notes", {
      scope: "project",
      project: "stackbase",
      ctx: ctx("notekit"),
    });
    expect(r.project).toBe("stackbase");
    expect(r.writePrefix).toBe("projects/stackbase/notes/");
  });

  it("default scope follows the marker's declared scope", () => {
    const m = { project: "notekit", source: null, scope: "global" as const };
    const r = resolveScope("notes", { ctx: m });
    expect(r.effective).toBe("global");
  });

  it("default scope is 'project' when marker omits scope", () => {
    const r = resolveScope("notes", { ctx: ctx("notekit") });
    expect(r.effective).toBe("project");
  });
});

describe("projectOfPath", () => {
  it.each([
    ["notes/today.md", null],
    ["projects/notekit/notes/today.md", "notekit"],
    ["projects/foo/tickets/bug-1.md", "foo"],
    ["projects/", null],
    ["", null],
  ])("of %s → %s", (p, expected) => {
    expect(projectOfPath(p)).toBe(expected);
  });
});

describe("isUnderAnyPrefix", () => {
  it("matches when a prefix is a substring at start", () => {
    expect(isUnderAnyPrefix("notes/x.md", ["notes/"])).toBe(true);
    expect(isUnderAnyPrefix("projects/notekit/notes/x.md", ["projects/"])).toBe(true);
  });
  it("does not match unrelated prefixes", () => {
    expect(isUnderAnyPrefix("notes/x.md", ["tickets/"])).toBe(false);
  });
});
