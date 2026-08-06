/**
 * Accent color. NoteKit is monochrome by default — accent spots (active nav /
 * chips, toggles, the onboarding CTA, primary highlights) inherit the theme's
 * grayscale `--accent`. The user can optionally pick a color, which overrides
 * the `--nk-accent*` CSS variables those spots read. Device-local (localStorage)
 * like the other display prefs.
 *
 * The CSS default lives in styles.css:
 *   :root { --nk-accent: var(--accent);
 *           --nk-accent-contrast: var(--primary-foreground);
 *           --nk-accent-soft: var(--accent-soft); }
 * so "mono" simply removes the JS overrides and falls back to grayscale.
 */

export type Accent = "mono" | "green" | "blue" | "purple" | "orange" | "pink" | "custom";

const KEY = "nk:accent";
const CUSTOM_KEY = "nk:accent-custom";
const DEFAULT_CUSTOM = "#e11d48";

/** Solid color per preset accent (contrast text is white for all). */
export const ACCENT_COLORS: Record<"green" | "blue" | "purple" | "orange" | "pink", string> = {
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  orange: "#f97316",
  pink: "#ec4899",
};

export const ACCENT_LABELS: Record<Accent, string> = {
  mono: "Mono",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  orange: "Orange",
  pink: "Pink",
  custom: "Custom",
};

export const ACCENTS: Accent[] = ["mono", "green", "blue", "purple", "orange", "pink", "custom"];

export function getAccent(): Accent {
  try {
    const v = localStorage.getItem(KEY);
    if (v && (ACCENTS as string[]).includes(v)) return v as Accent;
  } catch {
    /* ignore */
  }
  return "mono";
}

/** The user's custom accent hex (defaults to a rose so the swatch isn't blank). */
export function getCustomAccent(): string {
  try {
    const v = localStorage.getItem(CUSTOM_KEY);
    if (v && /^#[0-9a-fA-F]{6}$/.test(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_CUSTOM;
}

/** Resolve the current accent to a hex, or null for mono. */
function accentHex(): string | null {
  const a = getAccent();
  if (a === "mono") return null;
  if (a === "custom") return getCustomAccent();
  return ACCENT_COLORS[a];
}

/** Blend a hex color toward `#000`/`#fff` by `amount` (0..1), returning hex.
 *  Done in JS (not CSS color-mix) because iOS WKWebView mishandles color-mix
 *  nested inside a gradient — the whole background then computes invalid and the
 *  card falls back to transparent. Plain hex gradients work everywhere. */
function mix(hex: string, toward: "#000000" | "#ffffff", amount: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const t = toward === "#000000" ? 0 : 255;
  const ch = (c: number) => Math.round(c + (t - c) * amount).toString(16).padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

/** Push the current accent onto the themed `.nk` root(s). "mono" clears the
 *  overrides so they fall back to the grayscale defaults. (The vars default on
 *  `.nk`, so overriding `html` would be shadowed by the `.nk` rule.) */
export function applyAccent(): void {
  if (typeof document === "undefined") return;
  const color = accentHex();
  const CTA_VARS = [
    "--nk-accent",
    "--nk-accent-contrast",
    "--nk-accent-soft",
    "--nk-cta-note",
    "--nk-cta-note-fg",
    "--nk-cta-task",
    "--nk-cta-task-fg",
  ];
  document.querySelectorAll<HTMLElement>(".nk").forEach((root) => {
    if (!color) {
      // Fall back to the grayscale defaults (accent) + slate CTAs (in CSS).
      CTA_VARS.forEach((v) => root.style.removeProperty(v));
      return;
    }
    const noteDeep = mix(color, "#000000", 0.24);
    const taskLight = mix(color, "#ffffff", 0.5);
    const taskMid = mix(color, "#ffffff", 0.28);
    const taskFg = mix(color, "#000000", 0.66);
    root.style.setProperty("--nk-accent", color);
    root.style.setProperty("--nk-accent-contrast", "#ffffff");
    root.style.setProperty("--nk-accent-soft", `color-mix(in srgb, ${color} 16%, transparent)`);
    // Capture CTA cards: "New note" = the solid accent, "New task" = a light tint.
    // Plain hex gradients (no nested color-mix) for iOS WKWebView compatibility.
    root.style.setProperty("--nk-cta-note", `linear-gradient(155deg, ${color}, ${noteDeep})`);
    root.style.setProperty("--nk-cta-note-fg", "#ffffff");
    root.style.setProperty("--nk-cta-task", `linear-gradient(155deg, ${taskLight}, ${taskMid})`);
    root.style.setProperty("--nk-cta-task-fg", taskFg);
  });
}

export function setAccent(accent: Accent): void {
  try {
    localStorage.setItem(KEY, accent);
  } catch {
    /* ignore */
  }
  applyAccent();
}

/** Set a custom accent hex and switch to it. */
export function setCustomAccent(hex: string): void {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  try {
    localStorage.setItem(CUSTOM_KEY, hex);
    localStorage.setItem(KEY, "custom");
  } catch {
    /* ignore */
  }
  applyAccent();
}
