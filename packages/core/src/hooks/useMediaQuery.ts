import { useEffect, useState } from "react";

/**
 * Subscribe to a media query and re-render when it flips.
 *
 * Returns `false` during SSR / before mount so the desktop layout (which is the
 * historical default) doesn't flash on first paint at narrow widths — the
 * effect resyncs on mount to the real value.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Convenience: the breakpoint we use for the mobile shell. */
export const MOBILE_BREAKPOINT = "(max-width: 720px)";
