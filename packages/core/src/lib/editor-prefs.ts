/**
 * Device-local editor preferences (font family + size). Applied by overriding
 * the `--editor-font` / `--editor-size` CSS variables the editor already reads
 * (see .nk-prose). Stored in localStorage like the other UI prefs (vim mode) —
 * these are per-device display choices, not vault content.
 */

export type EditorFont = "sans" | "serif" | "mono";

const FONT_KEY = "nk:editor-font";
const SIZE_KEY = "nk:editor-size";

export const FONT_STACKS: Record<EditorFont, string> = {
  sans: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  mono: '"SF Mono", ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, monospace',
};

export const FONT_LABELS: Record<EditorFont, string> = {
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
};

export const MIN_SIZE = 14;
export const MAX_SIZE = 22;
const DEFAULT_SIZE = 16;

export function getEditorFont(): EditorFont {
  try {
    const v = localStorage.getItem(FONT_KEY);
    if (v === "sans" || v === "serif" || v === "mono") return v;
  } catch {
    /* ignore */
  }
  return "sans";
}

export function getEditorSize(): number {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY));
    if (Number.isFinite(n) && n >= MIN_SIZE && n <= MAX_SIZE) return n;
  } catch {
    /* ignore */
  }
  return DEFAULT_SIZE;
}

/** Push the current prefs onto the themed `.nk` root(s) so the editor picks
 *  them up. (The vars are defined on `.nk`, so overriding `html` would be
 *  shadowed by the `.nk` rule.) */
export function applyEditorPrefs(): void {
  if (typeof document === "undefined") return;
  const font = FONT_STACKS[getEditorFont()];
  const size = `${getEditorSize()}px`;
  document.querySelectorAll<HTMLElement>(".nk").forEach((root) => {
    root.style.setProperty("--editor-font", font);
    root.style.setProperty("--editor-size", size);
  });
}

export function setEditorFont(font: EditorFont): void {
  try {
    localStorage.setItem(FONT_KEY, font);
  } catch {
    /* ignore */
  }
  applyEditorPrefs();
}

export function setEditorSize(size: number): void {
  const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(size)));
  try {
    localStorage.setItem(SIZE_KEY, String(clamped));
  } catch {
    /* ignore */
  }
  applyEditorPrefs();
}
