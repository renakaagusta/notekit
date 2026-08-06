/**
 * Appearance customization (shadcn-style theming), layered on top of the
 * light/dark theme + accent color:
 *   - Base color: the neutral palette family (Zinc default, Slate, Stone, Gray).
 *     Applied as a `data-base` attribute on the themed `.nk` root; the actual
 *     token values live in CSS keyed on [data-base][data-theme], so light/dark
 *     switch automatically (the shadcn pattern).
 *   - App font: the UI font family (--ui-font).
 *   - Radius: the corner-radius scale (--r-sm/md/lg).
 *   - Logo: monochrome (default) or accent-colored mark (--nk-logo).
 *
 * All device-local (localStorage), applied to `.nk` (where the tokens default,
 * so overriding <html> would be shadowed). Reuses the same seam as accent.ts /
 * editor-prefs.ts.
 */

export type BaseColor = "zinc" | "slate" | "stone" | "gray" | "custom";
export type UiFont = "system" | "inter" | "serif" | "mono" | "rounded";
export type RadiusChoice = "none" | "small" | "medium" | "large";
export type LogoStyle = "mono" | "accent";

export const BASE_COLORS: BaseColor[] = ["zinc", "slate", "stone", "gray", "custom"];
export const BASE_LABELS: Record<BaseColor, string> = {
  zinc: "Zinc",
  slate: "Slate",
  stone: "Stone",
  gray: "Gray",
  custom: "Custom",
};
/** A representative swatch color per base (dark-surface tone) for the picker. */
export const BASE_SWATCH: Record<Exclude<BaseColor, "custom">, string> = {
  zinc: "#3f3f46",
  slate: "#334155",
  stone: "#44403c",
  gray: "#374151",
};
const BASE_CUSTOM_KEY = "nk:base-custom";
const DEFAULT_BASE_CUSTOM = "#6d5bd0";

/** The user's custom base tint hex. */
export function getCustomBase(): string {
  try {
    const v = localStorage.getItem(BASE_CUSTOM_KEY);
    if (v && /^#[0-9a-fA-F]{6}$/.test(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_BASE_CUSTOM;
}

export const UI_FONTS: UiFont[] = ["system", "inter", "serif", "mono", "rounded"];
export const UI_FONT_LABELS: Record<UiFont, string> = {
  system: "System",
  inter: "Inter",
  serif: "Serif",
  mono: "Mono",
  rounded: "Rounded",
};
const UI_FONT_STACKS: Record<UiFont, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  inter: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: '"Iowan Old Style", Georgia, "Times New Roman", serif',
  mono: '"SF Mono", ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, monospace',
  rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "Segoe UI", system-ui, sans-serif',
};

export const RADII: RadiusChoice[] = ["none", "small", "medium", "large"];
export const RADIUS_LABELS: Record<RadiusChoice, string> = {
  none: "None",
  small: "Small",
  medium: "Medium",
  large: "Large",
};
const RADIUS_SCALE: Record<RadiusChoice, [string, string, string]> = {
  none: ["2px", "2px", "3px"],
  small: ["3px", "4px", "5px"],
  medium: ["5px", "6px", "8px"], // NoteKit default
  large: ["9px", "11px", "14px"],
};

export const LOGO_STYLES: LogoStyle[] = ["mono", "accent"];
export const LOGO_LABELS: Record<LogoStyle, string> = { mono: "Mono", accent: "Accent" };

const K = {
  base: "nk:base",
  font: "nk:ui-font",
  radius: "nk:radius",
  logo: "nk:logo",
};

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

export const getBaseColor = () => read<BaseColor>(K.base, BASE_COLORS, "zinc");
export const getUiFont = () => read<UiFont>(K.font, UI_FONTS, "inter");
export const getRadius = () => read<RadiusChoice>(K.radius, RADII, "medium");
export const getLogoStyle = () => read<LogoStyle>(K.logo, LOGO_STYLES, "mono");

/** Push all appearance prefs onto the themed `.nk` root(s). */
export function applyAppearance(): void {
  if (typeof document === "undefined") return;
  const base = getBaseColor();
  const font = UI_FONT_STACKS[getUiFont()];
  const [rs, rm, rl] = RADIUS_SCALE[getRadius()];
  const logo = getLogoStyle();
  document.querySelectorAll<HTMLElement>(".nk").forEach((root) => {
    if (base === "zinc") delete root.dataset.base;
    else root.dataset.base = base;
    // Custom base: the [data-base="custom"] CSS mixes --base-tint into the
    // neutral ramp (theme-aware), keeping text contrast.
    if (base === "custom") root.style.setProperty("--base-tint", getCustomBase());
    else root.style.removeProperty("--base-tint");
    root.style.setProperty("--ui-font", font);
    root.style.setProperty("--r-sm", rs);
    root.style.setProperty("--r-md", rm);
    root.style.setProperty("--r-lg", rl);
    if (logo === "accent") root.style.setProperty("--nk-logo", "var(--nk-accent)");
    else root.style.removeProperty("--nk-logo");
  });
}

export const setBaseColor = (v: BaseColor) => (persist(K.base, v), applyAppearance());
/** Set a custom base tint hex and switch to it. */
export function setCustomBase(hex: string): void {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  persist(BASE_CUSTOM_KEY, hex);
  persist(K.base, "custom");
  applyAppearance();
}
export const setUiFont = (v: UiFont) => (persist(K.font, v), applyAppearance());
export const setRadius = (v: RadiusChoice) => (persist(K.radius, v), applyAppearance());
export const setLogoStyle = (v: LogoStyle) => (persist(K.logo, v), applyAppearance());

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
