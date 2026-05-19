// Tiny frontmatter parser/serializer for NoteKit's Markdown-with-YAML files.
// We deliberately avoid a YAML dep: notes and tickets only use a flat subset
// (scalars + inline arrays + ISO date strings). If we ever need anchors or
// nested maps, swap this for `yaml` — but until then, ~50 lines beats ~5MB.
//
// Supported grammar (between leading `---` and a terminating `---` line):
//   key: scalar
//   key: [a, b, c]
//   key:
//   key: "string with: colons"
//
// Values are coerced as follows:
//   - `true` / `false`   → boolean
//   - integers / floats  → number
//   - `null` / ``        → null
//   - `[..., ...]`       → string[] (commas split; quotes optional)
//   - everything else    → string (quotes stripped)

export type Frontmatter = Record<string, unknown>;

export interface MarkdownFile {
  frontmatter: Frontmatter;
  body: string;
}

const FENCE = "---";

export function parseMarkdown(source: string): MarkdownFile {
  if (!source.startsWith(FENCE)) {
    return { frontmatter: {}, body: source };
  }
  // Split off the opening fence, then find the closing one.
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== FENCE) {
    return { frontmatter: {}, body: source };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === FENCE) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { frontmatter: {}, body: source };
  }

  const fmLines = lines.slice(1, end);
  const body = lines.slice(end + 1).join("\n").replace(/^\n/, "");

  const fm: Frontmatter = {};
  for (const raw of fmLines) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!key) continue;
    fm[key] = coerce(value);
  }
  return { frontmatter: fm, body };
}

export function serializeMarkdown(file: MarkdownFile): string {
  const entries = Object.entries(file.frontmatter);
  if (entries.length === 0) {
    return file.body.endsWith("\n") ? file.body : `${file.body}\n`;
  }
  const fmLines = entries.map(([k, v]) => `${k}: ${encode(v)}`);
  const fm = `${FENCE}\n${fmLines.join("\n")}\n${FENCE}\n`;
  const body = file.body.startsWith("\n") ? file.body.slice(1) : file.body;
  return `${fm}\n${body}${body.endsWith("\n") ? "" : "\n"}`;
}

function coerce(value: string): unknown {
  if (value === "" || value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;

  // Inline array: [a, "b, with comma", c]
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return splitTopLevel(inner).map((item) => {
      const trimmed = item.trim();
      return stripQuotes(trimmed);
    });
  }

  // Numbers (but never date-looking strings)
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }

  return stripQuotes(value);
}

function stripQuotes(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuote: '"' | "'" | null = null;
  for (const ch of s) {
    if (inQuote) {
      buf += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      buf += ch;
      continue;
    }
    if (ch === ",") {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function encode(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => encodeScalar(v)).join(", ")}]`;
  }
  return encodeScalar(value);
}

function encodeScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  const s = String(value);
  // Quote if it contains characters that would break our parser.
  if (/[:#\[\]",]/.test(s) || s.includes("\n")) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}
