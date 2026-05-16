import type { Note } from "../types/note";
import type { Ticket } from "../types/ticket";

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
    frontmatter: {},
    createdAt: String(frontmatter.createdAt ?? new Date().toISOString()),
    updatedAt: String(frontmatter.updatedAt ?? new Date().toISOString()),
    folder: (frontmatter.folder as string | null) ?? null,
    tags: Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [],
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
  };
}
