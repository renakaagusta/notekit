/**
 * Comments live inside the ticket body as markdown blockquotes under a
 * `## Comments` heading. This format reads naturally in any markdown viewer,
 * diffs cleanly in git, and needs no extra storage.
 *
 *   ## Comments
 *
 *   > **rena** · 2026-05-16T10:00:00Z
 *   > Let's ship the picker first.
 *
 *   > **agent:claude-coder** · 2026-05-16T10:30:00Z
 *   > Started implementation in branch ticket-picker.
 *
 * If the convention turns out to be painful at scale, the natural migration
 * is to split comments into a sibling `.comments.md` file — the parser would
 * change but the rendered UX would not.
 */

export interface TicketComment {
  /** Whatever was in the header — usually `user:<id>` or `agent:<id>`. */
  author: string;
  /** ISO timestamp string as written. */
  timestamp: string;
  /** Markdown body of the comment with `> ` prefixes stripped. */
  body: string;
}

const COMMENTS_HEADING_RE = /^##\s+Comments\s*$/;
const NEXT_HEADING_RE = /^#{1,6}\s+/;
const QUOTE_RE = /^>\s?(.*)$/;
const HEADER_RE = /^\*\*([^*]+)\*\*\s*·\s*(.+)$/;

interface Region {
  start: number;
  end: number; // exclusive
}

function findCommentsRegion(lines: string[]): Region | null {
  let heading = -1;
  for (let i = 0; i < lines.length; i++) {
    if (COMMENTS_HEADING_RE.test(lines[i]!)) {
      heading = i;
      break;
    }
  }
  if (heading < 0) return null;
  let end = lines.length;
  for (let i = heading + 1; i < lines.length; i++) {
    if (NEXT_HEADING_RE.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return { start: heading + 1, end };
}

/** Return the body with the `## Comments` section (and everything until the next heading) stripped. */
export function bodyWithoutComments(body: string): string {
  const lines = body.split("\n");
  const region = findCommentsRegion(lines);
  if (!region) return body;
  // Drop from the heading line itself to the end of the region.
  lines.splice(region.start - 1, region.end - (region.start - 1));
  return lines.join("\n").replace(/\n+$/, "");
}

export function parseComments(body: string): TicketComment[] {
  const lines = body.split("\n");
  const region = findCommentsRegion(lines);
  if (!region) return [];

  const out: TicketComment[] = [];
  let buffer: string[] = [];

  function flush() {
    if (buffer.length === 0) return;
    const headerLine = buffer[0] ?? "";
    const m = headerLine.match(HEADER_RE);
    if (m) {
      out.push({
        author: m[1]!.trim(),
        timestamp: m[2]!.trim(),
        body: buffer.slice(1).join("\n").trim(),
      });
    } else {
      out.push({
        author: "unknown",
        timestamp: "",
        body: buffer.join("\n").trim(),
      });
    }
    buffer = [];
  }

  for (let i = region.start; i < region.end; i++) {
    const line = lines[i]!;
    const q = line.match(QUOTE_RE);
    if (q) {
      buffer.push(q[1]!);
    } else if (line.trim() === "") {
      flush();
    }
  }
  flush();
  return out;
}

export function appendComment(
  body: string,
  author: string,
  timestamp: string,
  text: string,
): string {
  const trimmed = text.trim();
  if (!trimmed) return body;

  const block = formatComment(author, timestamp, trimmed);

  const lines = body.split("\n");
  const region = findCommentsRegion(lines);

  if (region) {
    // Insert before whatever follows the comments region. Trim trailing
    // blank lines inside the region so the new comment is contiguous.
    let insertAt = region.end;
    while (insertAt > region.start && (lines[insertAt - 1] ?? "").trim() === "") {
      insertAt--;
    }
    const needsSeparator = insertAt > region.start;
    const insertion = needsSeparator ? ["", block] : [block];
    lines.splice(insertAt, 0, ...insertion);
    return lines.join("\n");
  }

  // No comments section yet — create one at the end of the body.
  const prefix = body.length === 0 ? "" : body.endsWith("\n\n") ? "" : body.endsWith("\n") ? "\n" : "\n\n";
  return `${body}${prefix}## Comments\n\n${block}\n`;
}

function formatComment(author: string, timestamp: string, text: string): string {
  const headerLine = `> **${author}** · ${timestamp}`;
  const bodyLines = text.split("\n").map((l) => (l.length === 0 ? ">" : `> ${l}`));
  return [headerLine, ...bodyLines].join("\n");
}
