import type { LinkKind } from "../types/link";

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg",
  "bmp",
  "ico",
  "heic",
  "heif",
]);

/**
 * Guess how a saved URL should be rendered from its file extension.
 * Pure and side-effect free so it can run at add-time and in tests.
 * Falls back to `link` for anything we don't recognize — including
 * extensionless URLs and unparseable strings.
 */
export function detectLinkKind(url: string): LinkKind {
  const ext = extensionOf(url);
  if (ext === "pdf") return "pdf";
  if (ext && IMAGE_EXT.has(ext)) return "image";
  return "link";
}

function extensionOf(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Not an absolute URL — fall back to stripping query/hash by hand so
    // relative-ish strings ("foo.png?x=1") still classify.
    pathname = url.split(/[?#]/)[0] ?? "";
  }
  const last = pathname.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0 || dot === last.length - 1) return null;
  return last.slice(dot + 1).toLowerCase();
}
