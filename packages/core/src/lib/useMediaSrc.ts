import { useEffect, useState } from "react";
import type { MediaCachePort } from "../application/ports/out/MediaCachePort";

let mediaCache: MediaCachePort | null = null;

/**
 * Bind the media cache adapter this hook reads through. Called once by the
 * composition root before the hook is used; keeps the driving-layer hook free
 * of any direct dependency on a driven adapter.
 */
export function configureMediaSrc(port: MediaCachePort): void {
  mediaCache = port;
}

/**
 * Resolve a remote media URL to a displayable `src` through the local
 * cache (#28). Returns a cached object URL once bytes are available;
 * until then (and for opaque cross-origin URLs we can't read) it returns
 * the raw URL so the element still renders. Object URLs are revoked on
 * unmount / url change to avoid leaks.
 */
export function useMediaSrc(url: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(url ?? null);

  useEffect(() => {
    if (!url) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset to null when url is cleared; no external subscription pattern applies here
      setSrc(null);
      return;
    }
    // Show the raw URL immediately; upgrade to a cached object URL when ready.
    setSrc(url);
    let objectUrl: string | null = null;
    let cancelled = false;

    if (!mediaCache) throw new Error("useMediaSrc used before configureMediaSrc");
    mediaCache
      .getBlob(url)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => { /* cache miss is expected; fall back to raw URL */ });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return src;
}
