import type { Note } from "../types/note";

/** First non-empty line of the body, with leading "# " stripped. Falls back to "Untitled". */
export function noteTitle(note: Pick<Note, "body" | "title">): string {
  const firstLine = note.body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return note.title || "Untitled";
  return firstLine.replace(/^#+\s+/, "").slice(0, 120) || "Untitled";
}

/** Lines after the title, joined with spaces, truncated for previews. */
export function notePreview(note: Pick<Note, "body">, max = 80): string {
  const lines = note.body.split("\n");
  let started = false;
  const after: string[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!started) {
      if (l.length > 0) started = true;
      continue;
    }
    if (l.length > 0) after.push(l);
  }
  const joined = after.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length <= max) return joined;
  return joined.slice(0, max - 1) + "…";
}
