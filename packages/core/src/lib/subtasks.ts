/**
 * Parse and mutate markdown checkbox subtasks inside a ticket body.
 *
 * Supports the common GitHub-flavored syntax:
 *   - [ ] todo item
 *   - [x] done item
 *   * [X] also done
 *
 * Nested checkboxes are kept in the list as flat entries; indentation in the
 * source is preserved on toggle so the markdown stays clean.
 */

export interface Subtask {
  /** Zero-based index into the body's line array. */
  line: number;
  checked: boolean;
  text: string;
}

const CHECKBOX_RE = /^(\s*)([-*+])\s+\[( |x|X)\]\s+(.*)$/;

export function parseSubtasks(body: string): Subtask[] {
  const out: Subtask[] = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(CHECKBOX_RE);
    if (!m) continue;
    const [, , , box, text] = m;
    out.push({
      line: i,
      checked: box !== " ",
      text: text!.trim(),
    });
  }
  return out;
}

export interface SubtaskProgress {
  done: number;
  total: number;
}

export function subtaskProgress(body: string): SubtaskProgress {
  const subs = parseSubtasks(body);
  return {
    done: subs.filter((s) => s.checked).length,
    total: subs.length,
  };
}

/**
 * Toggle the checkbox on the given body-line. Returns the new body. If the
 * line doesn't look like a checkbox, the body is returned unchanged.
 */
export function toggleSubtaskAt(body: string, lineIndex: number, checked: boolean): string {
  const lines = body.split("\n");
  const line = lines[lineIndex];
  if (line === undefined) return body;
  const m = line.match(CHECKBOX_RE);
  if (!m) return body;
  const [, indent, marker, , text] = m;
  lines[lineIndex] = `${indent}${marker} [${checked ? "x" : " "}] ${text}`;
  return lines.join("\n");
}

/**
 * Append a new unchecked subtask to the body. Inserts after the last existing
 * checkbox so the list stays grouped; falls back to appending at the end.
 */
export function appendSubtask(body: string, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return body;
  const lines = body.split("\n");
  const newLine = `- [ ] ${trimmed}`;

  // Find the last checkbox line.
  let lastCheckbox = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (CHECKBOX_RE.test(lines[i]!)) {
      lastCheckbox = i;
      break;
    }
  }

  if (lastCheckbox >= 0) {
    lines.splice(lastCheckbox + 1, 0, newLine);
    return lines.join("\n");
  }

  // No existing checklist — append at the end with a blank line separator.
  const needsSeparator = body.length > 0 && !body.endsWith("\n\n");
  const prefix = body.length === 0 ? "" : body.endsWith("\n") ? (needsSeparator ? "\n" : "") : "\n\n";
  return `${body}${prefix}${newLine}\n`;
}
