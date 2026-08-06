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

export type Accent = "mono" | "green" | "blue" | "purple" | "orange" | "pink";

const KEY = "nk:accent";

/** Solid color per accent (contrast text is white for all colored options). */
export const ACCENT_COLORS: Record<Exclude<Accent, "mono">, string> = {
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
};

export const ACCENTS: Accent[] = ["mono", "green", "blue", "purple", "orange", "pink"];

export function getAccent(): Accent {
  try {
    const v = localStorage.getItem(KEY);
    if (v && (ACCENTS as string[]).includes(v)) return v as Accent;
  } catch {
    /* ignore */
  }
  return "mono";
}

/** Push the current accent onto the themed `.nk` root(s). "mono" clears the
 *  overrides so they fall back to the grayscale defaults. (The vars default on
 *  `.nk`, so overriding `html` would be shadowed by the `.nk` rule.) */
export function applyAccent(): void {
  if (typeof document === "undefined") return;
  const accent = getAccent();
  const color = accent === "mono" ? null : ACCENT_COLORS[accent];
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
    root.style.setProperty("--nk-accent", color);
    root.style.setProperty("--nk-accent-contrast", "#ffffff");
    root.style.setProperty("--nk-accent-soft", `color-mix(in srgb, ${color} 16%, transparent)`);
    // Capture CTA cards: "New note" = the solid accent, "New task" = a light tint.
    root.style.setProperty(
      "--nk-cta-note",
      `linear-gradient(155deg, ${color}, color-mix(in srgb, ${color} 76%, #000))`,
    );
    root.style.setProperty("--nk-cta-note-fg", "#ffffff");
    root.style.setProperty(
      "--nk-cta-task",
      `linear-gradient(155deg, color-mix(in srgb, ${color} 52%, #fff), color-mix(in srgb, ${color} 74%, #fff))`,
    );
    root.style.setProperty("--nk-cta-task-fg", `color-mix(in srgb, ${color} 32%, #000)`);
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
