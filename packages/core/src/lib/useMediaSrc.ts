import { useEffect, useState } from "react";
import { getMediaCache } from "./media-cache-idb";

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
      setSrc(null);
      return;
    }
    // Show the raw URL immediately; upgrade to a cached object URL when ready.
    setSrc(url);
    let objectUrl: string | null = null;
    let cancelled = false;

    getMediaCache()
      .getBlob(url)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return src;
}
