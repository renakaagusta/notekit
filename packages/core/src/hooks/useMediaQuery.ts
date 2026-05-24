import { useEffect, useState } from "react";

/**
 * Subscribe to a media query and re-render when it flips.
 *
 * Reads the actual match synchronously on first render (via a `useState`
 * initializer) so client-side mounts on narrow viewports — Capacitor
 * WebViews, mobile browsers, resized desktop windows — see the correct
 * value on the very first paint. The historical "default to false until
 * mount" behavior left the Capacitor build stuck on desktop layout
 * because the post-mount re-render either didn't fire or didn't reach
 * the `data-mobile` consumers in time.
 *
 * Still SSR-safe: when `window` is undefined (Node/SSR), returns `false`
 * and resyncs on the client's first effect.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    // Resync in case the viewport changed between the useState initializer
    // and the effect (rare but possible during fast device rotation).
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Convenience: the breakpoint we use for the mobile shell. */
export const MOBILE_BREAKPOINT = "(max-width: 720px)";
