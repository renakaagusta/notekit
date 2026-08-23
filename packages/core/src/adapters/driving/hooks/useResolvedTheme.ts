import { useMediaQuery } from "./useMediaQuery";

export type ThemePreference = "light" | "dark" | "auto" | null | undefined;
export type ResolvedTheme = "light" | "dark";

/**
 * Resolve the active theme for a given user preference.
 *
 *   - "light" / "dark" → that exact theme, regardless of OS.
 *   - "auto" / undefined / null → follow the OS via
 *     `prefers-color-scheme`, defaulting to dark when the system
 *     reports neither preference (e.g. older browsers).
 *
 * Reactive: re-renders when the OS theme flips (Settings → Display →
 * Appearance) so the app picks up the change without a reload.
 *
 * Used in both `AuthGate` (no settings yet → always system) and
 * `App.tsx` (authenticated → user's persisted preference wins).
 * Keeping the logic in one place avoids the two-screen mismatch where
 * sign-in showed dark while the rest of the app would have rendered
 * light because the OS preferred light.
 */
export function useResolvedTheme(preference?: ThemePreference): ResolvedTheme {
  const prefersLight = useMediaQuery("(prefers-color-scheme: light)");
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return prefersLight ? "light" : "dark";
}
