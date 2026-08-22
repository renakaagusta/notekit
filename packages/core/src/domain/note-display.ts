import type { Note } from "./entities/note";

/** First non-empty line of the body, with leading "# " stripped. Falls back to "Untitled". */
// eslint-disable-next-line complexity -- handles empty body, code-fenced opening, and plain heading; three distinct cases
export function noteTitle(note: Pick<Note, "body" | "title">): string {
  // A note may briefly exist without a body (e.g. a freshly-created draft or a
  // record still syncing) — treat a missing body as empty rather than crashing.
  const lines = (note.body ?? "").split("\n").map((l) => l.trim());
  const first = lines.findIndex((l) => l.length > 0);
  if (first === -1) return note.title || "Untitled";
  const firstLine = lines[first] ?? "";
  // A body that opens with a code fence (```interactive, ```html, …) has no
  // meaningful heading on line 1 — the fence marker itself is not a title.
  // Prefer the explicit title, else the first text line AFTER the fenced block.
  if (firstLine.startsWith("```")) {
    if (note.title && note.title.trim()) return note.title.trim().slice(0, 120);
    let j = first + 1;
    while (j < lines.length && !(lines[j] ?? "").startsWith("```")) j++; // closing fence
    for (let k = j + 1; k < lines.length; k++) {
      const l = lines[k] ?? "";
      if (l.length > 0) return l.replace(/^#+\s+/, "").slice(0, 120) || "Untitled";
    }
    return "Untitled";
  }
  return firstLine.replace(/^#+\s+/, "").slice(0, 120) || "Untitled";
}

/** Lines after the title, joined with spaces, truncated for previews. */
export function notePreview(note: Pick<Note, "body">, max = 80): string {
  const lines = (note.body ?? "").split("\n");
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
