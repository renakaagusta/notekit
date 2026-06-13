import { describe, it, expect } from "vitest";
import { detectLinkKind } from "./link-kind";

describe("detectLinkKind", () => {
  it("detects images by extension, case-insensitively", () => {
    for (const u of [
      "https://example.com/a.png",
      "https://example.com/photo.JPG",
      "https://cdn.example.com/x/y/z.webp",
      "https://example.com/i.svg?v=2#frag",
    ]) {
      expect(detectLinkKind(u)).toBe("image");
    }
  });

  it("detects pdfs by extension", () => {
    expect(detectLinkKind("https://example.com/doc.pdf")).toBe("pdf");
    expect(detectLinkKind("https://example.com/a/b/report.PDF?dl=1")).toBe("pdf");
  });

  it("falls back to link for pages, extensionless, and junk", () => {
    for (const u of [
      "https://example.com/article",
      "https://example.com/",
      "https://youtube.com/watch?v=abc",
      "not a url",
      "https://example.com/file.",
    ]) {
      expect(detectLinkKind(u)).toBe("link");
    }
  });
});
