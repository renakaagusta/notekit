import type { Note } from "../types/note";
import type { Ticket } from "../types/ticket";
import type { SavedLink, LinkKind } from "../types/link";

/**
 * Serialize a note/ticket into a markdown file with YAML frontmatter.
 * The frontmatter holds the structured fields so the markdown body stays clean
 * and reads naturally in the GitHub UI.
 */

function yamlString(v: string): string {
  if (v === "") return '""';
  if (/^[A-Za-z0-9 _\-.,/:]+$/.test(v)) return v;
  return JSON.stringify(v);
}

function emitFrontmatter(obj: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${k}: []`);
      } else {
        lines.push(`${k}:`);
        for (const item of v) lines.push(`  - ${yamlString(String(item))}`);
      }
    } else if (typeof v === "object") {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${k}: ${yamlString(String(v))}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function parseFrontmatter(
  src: string,
): { frontmatter: Record<string, unknown>; body: string } {
  if (!src.startsWith("---\n")) {
    return { frontmatter: {}, body: src };
  }
  const end = src.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: {}, body: src };
  const yaml = src.slice(4, end);
  const body = src.slice(end + 4).replace(/^\n/, "");

  // Minimal YAML parser — supports the subset we emit.
  const out: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const [, key, rest] = m;
    if (!key) {
      i++;
      continue;
    }
    if (rest === "" || rest === undefined) {
      const arr: string[] = [];
      i++;
      while (i < lines.length && lines[i]?.startsWith("  - ")) {
        arr.push(unquote(lines[i]!.slice(4)));
        i++;
      }
      out[key] = arr;
      continue;
    }
    if (rest === "[]") {
      out[key] = [];
      i++;
      continue;
    }
    out[key] = unquote(rest);
    i++;
  }
  return { frontmatter: out, body };
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

export function serializeNote(note: Note): string {
  const fm = emitFrontmatter({
    id: note.id,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    folder: note.folder,
    tags: note.tags,
    // Emit only when non-default so existing markdown notes don't churn.
    format: note.format && note.format !== "md" ? note.format : undefined,
  });
  return fm + note.body;
}

export function deserializeNote(path: string, content: string): Note | null {
  const { frontmatter, body } = parseFrontmatter(content);
  const id = String(frontmatter.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    path,
    title: "", // first-line is the title; legacy field
    body,
    // Preserve the full parsed frontmatter so consumers (e.g. GraphView's
    // creator/collaborators/project lookups) can read keys that aren't
    // first-class fields on Note. The first-class fields above still win
    // when both exist.
    frontmatter,
    createdAt: String(frontmatter.createdAt ?? new Date().toISOString()),
    updatedAt: String(frontmatter.updatedAt ?? new Date().toISOString()),
    folder: (frontmatter.folder as string | null) ?? null,
    tags: Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [],
    format: frontmatter.format === "html" ? "html" : "md",
  };
}

export function serializeTicket(t: Ticket): string {
  const fm = emitFrontmatter({
    id: t.id,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee,
    labels: t.labels,
    linkedNotes: t.linkedNotes,
    dueDate: t.dueDate,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdBy: t.createdBy,
  });
  return fm + `# ${t.title}\n\n${t.body}`;
}

export function deserializeTicket(path: string, content: string): Ticket | null {
  const { frontmatter, body } = parseFrontmatter(content);
  const id = String(frontmatter.id ?? "").trim();
  if (!id) return null;

  // First line is `# Title`, rest is body.
  const lines = body.split("\n");
  let title = "Untitled";
  let rest = body;
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("# ")) {
    title = first.slice(2).trim() || "Untitled";
    rest = lines.slice(1).join("\n").replace(/^\n+/, "");
  }

  const allowedStatus = ["todo", "in_progress", "blocked", "done", "archived"];
  const allowedPriority = ["low", "medium", "high", "urgent"];

  const status = String(frontmatter.status ?? "todo");
  const priority = String(frontmatter.priority ?? "medium");

  return {
    id,
    path,
    title,
    body: rest,
    status: (allowedStatus.includes(status) ? status : "todo") as Ticket["status"],
    priority: (allowedPriority.includes(priority)
      ? priority
      : "medium") as Ticket["priority"],
    assignee: (frontmatter.assignee as string | null) ?? null,
    labels: Array.isArray(frontmatter.labels)
      ? (frontmatter.labels as string[])
      : [],
    linkedNotes: Array.isArray(frontmatter.linkedNotes)
      ? (frontmatter.linkedNotes as string[])
      : [],
    createdAt: String(frontmatter.createdAt ?? new Date().toISOString()),
    updatedAt: String(frontmatter.updatedAt ?? new Date().toISOString()),
    dueDate: (frontmatter.dueDate as string | null) ?? null,
    createdBy: (frontmatter.createdBy as string | null) ?? null,
  };
}

function parseLinkKind(v: unknown): LinkKind {
  return v === "image" || v === "pdf" ? v : "link";
}

export function serializeLink(link: SavedLink): string {
  const fm = emitFrontmatter({
    id: link.id,
    url: link.url,
    platform: link.platform,
    // Emit only when non-default so existing link files don't churn.
    kind: link.kind && link.kind !== "link" ? link.kind : undefined,
    folder: link.folder,
    tags: link.tags,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  });
  const body = link.description
    ? `# ${link.title}\n\n${link.description}`
    : `# ${link.title}`;
  return fm + body;
}

export function deserializeLink(path: string, content: string): SavedLink | null {
  const { frontmatter, body } = parseFrontmatter(content);
  const id = String(frontmatter.id ?? "").trim();
  if (!id) return null;

  const lines = body.split("\n");
  let title = "Untitled";
  let description: string | null = null;
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("# ")) {
    title = first.slice(2).trim() || "Untitled";
    const rest = lines.slice(1).join("\n").replace(/^\n+/, "").trim();
    if (rest) description = rest;
  }

  return {
    id,
    path,
    url: String(frontmatter.url ?? ""),
    title,
    description,
    platform: (frontmatter.platform as string | null) ?? null,
    tags: Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [],
    kind: parseLinkKind(frontmatter.kind),
    folder: folderFromFrontmatter(frontmatter.folder, path),
    createdAt: String(frontmatter.createdAt ?? new Date().toISOString()),
    updatedAt: String(frontmatter.updatedAt ?? new Date().toISOString()),
  };
}

/**
 * Resolve a link's folder. Prefer the explicit `folder:` frontmatter
 * value; fall back to deriving it from the path so old links written
 * before the folder field existed still slot into the right place when
 * a user moves them into a folder by hand (e.g. via Git).
 */
function folderFromFrontmatter(raw: unknown, path: string): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const rel = path.startsWith("links/") ? path.slice("links/".length) : path;
  const slash = rel.lastIndexOf("/");
  if (slash === -1) return null;
  return rel.slice(0, slash);
}
