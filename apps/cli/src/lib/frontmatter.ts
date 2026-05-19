// Tiny YAML frontmatter parser/serializer. Supports the subset NoteKit uses:
//   - scalar key: value
//   - inline arrays: key: [a, b, c]
//   - quoted strings ("foo: bar" preserves the colon)
//   - null/empty value
// Anything more exotic (block scalars, nested maps) is out of scope — those
// docs are not produced by NoteKit. We deliberately avoid pulling in gray-matter
// or js-yaml so the CLI bundle stays small.

const FRONT_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(input: string): ParsedFrontmatter {
  const m = FRONT_RE.exec(input);
  if (!m) return { data: {}, body: input };
  const yaml = m[1] ?? "";
  const body = m[2] ?? "";
  return { data: parseYamlBlock(yaml), body };
}

export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const yaml = stringifyYamlBlock(data);
  if (yaml.length === 0) return body;
  // Ensure body separates with exactly one newline after closing `---`.
  const tail = body.startsWith("\n") ? body : `\n${body}`;
  return `---\n${yaml}---${tail}`;
}

// ── internals ──────────────────────────────────────────────────────────────

function parseYamlBlock(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = parseScalar(value);
  }
  return out;
}

function parseScalar(raw: string): unknown {
  if (raw.length === 0) return null;
  if (raw === "null" || raw === "~") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;

  // Inline array: [a, b, "c, d"]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return splitTopLevelCommas(inner).map((item) => parseScalar(item.trim()));
  }

  // Quoted string
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }

  return raw;
}

function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let buf = "";
  let quote: string | null = null;
  for (const ch of s) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
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
  if (buf.length > 0) out.push(buf);
  return out;
}

function stringifyYamlBlock(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    lines.push(`${key}: ${formatScalar(value)}`);
  }
  return lines.length === 0 ? "" : lines.join("\n") + "\n";
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatInlineArrayItem(v)).join(", ")}]`;
  }
  return formatStringValue(String(value));
}

function formatInlineArrayItem(value: unknown): string {
  if (typeof value === "string") return formatStringValue(value);
  return formatScalar(value);
}

function formatStringValue(s: string): string {
  // Quote when the string contains characters that would confuse the parser.
  if (/[:,\[\]#]/.test(s) || s.trim() !== s || s.length === 0) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}
