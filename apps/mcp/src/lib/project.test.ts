// Tests for the project marker + git-remote parsing helpers. These are
// pure (modulo filesystem reads in `findMarker`) so we cover them with a
// real tmpdir per case instead of mocking fs.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ownerRepoFromRemoteUrl,
  parseMarkerContent,
  resolveProjectContext,
  slugFromRemoteUrl,
  slugify,
} from "./project.js";

describe("parseMarkerContent", () => {
  it("parses a single-line text marker", () => {
    const m = parseMarkerContent("project: notekit", "/x/.notekit");
    expect(m).toEqual({
      project: "notekit",
      vault: undefined,
      scope: undefined,
      source: "/x/.notekit",
    });
  });

  it("parses multi-line text marker with vault override and scope", () => {
    const raw = "# comment\nproject: alpha\nvault: me/notekit-vault\nscope: global\n";
    const m = parseMarkerContent(raw, null);
    expect(m).toEqual({
      project: "alpha",
      vault: "me/notekit-vault",
      scope: "global",
      source: null,
    });
  });

  it("parses JSON form", () => {
    const json = JSON.stringify({ project: "alpha", scope: "all" });
    const m = parseMarkerContent(json, null);
    expect(m?.project).toBe("alpha");
    expect(m?.scope).toBe("all");
  });

  it("returns null when project is missing", () => {
    expect(parseMarkerContent("vault: x", null)).toBeNull();
    expect(parseMarkerContent("{}", null)).toBeNull();
    expect(parseMarkerContent("", null)).toBeNull();
  });

  it("ignores invalid scope", () => {
    const m = parseMarkerContent("project: x\nscope: nonsense", null);
    expect(m?.scope).toBeUndefined();
  });
});

describe("slugFromRemoteUrl / ownerRepoFromRemoteUrl", () => {
  it.each([
    ["git@github.com:renakaagusta/notekit.git", "notekit", "renakaagusta/notekit"],
    ["https://github.com/renakaagusta/notekit.git", "notekit", "renakaagusta/notekit"],
    ["https://github.com/renakaagusta/notekit", "notekit", "renakaagusta/notekit"],
    ["ssh://git@gitlab.example.com/group/sub/repo.git", "repo", "sub/repo"],
    ["", null, null],
  ])("parses %s", (url, slug, ownerRepo) => {
    expect(slugFromRemoteUrl(url)).toBe(slug);
    expect(ownerRepoFromRemoteUrl(url)).toBe(ownerRepo);
  });

  it("slugifies non-ASCII names", () => {
    expect(slugify("My App!! v2")).toBe("my-app-v2");
    expect(slugify("  ___  ")).toBe("");
  });
});

describe("resolveProjectContext", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(path.join(tmpdir(), "notekit-mcp-"));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("prefers NOTEKIT_PROJECT env over markers", () => {
    writeFileSync(path.join(workdir, ".notekit"), "project: from-file");
    const m = resolveProjectContext({
      cwd: workdir,
      env: { NOTEKIT_PROJECT: "from-env" },
    });
    expect(m?.project).toBe("from-env");
    expect(m?.source).toBeNull();
  });

  it("walks up to find a marker in an ancestor directory", () => {
    writeFileSync(path.join(workdir, ".notekit"), "project: parent\n");
    const deep = path.join(workdir, "a", "b", "c");
    mkdirSync(deep, { recursive: true });
    const m = resolveProjectContext({ cwd: deep, env: {} });
    expect(m?.project).toBe("parent");
    expect(m?.source).toBe(path.join(workdir, ".notekit"));
  });

  it("returns null when no marker exists", () => {
    const m = resolveProjectContext({ cwd: workdir, env: {} });
    expect(m).toBeNull();
  });

  it("accepts notekit.json as an alternate marker name", () => {
    writeFileSync(
      path.join(workdir, "notekit.json"),
      JSON.stringify({ project: "alpha", scope: "project" }),
    );
    const m = resolveProjectContext({ cwd: workdir, env: {} });
    expect(m?.project).toBe("alpha");
    expect(m?.scope).toBe("project");
  });
});
