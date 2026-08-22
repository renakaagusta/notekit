/**
 * Composition root for the `useMediaSrc` driving-layer hook.
 *
 * This is the ONE place the hook is bound to its concrete media-cache adapter.
 * Wiring runs eagerly at import — before any component can call the hook — so
 * behavior is identical to the old direct `getMediaCache()` call; only the
 * dependency direction is now clean (the hook depends on {@link MediaCachePort},
 * this root injects the adapter). Import the hook from here, not from `lib/`.
 */
import { mediaCachePort } from "../adapters/driven/media-cache-idb";
import { configureMediaSrc, useMediaSrc } from "../lib/useMediaSrc";

configureMediaSrc(mediaCachePort);

export { useMediaSrc };
