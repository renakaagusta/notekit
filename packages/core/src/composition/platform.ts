/**
 * Composition root exposing the wired platform detector to driving adapters,
 * so components depend on the PlatformPort capability rather than importing the
 * Capacitor-reading driven adapter directly.
 */
import { platformPort } from "../adapters/driven/native";

export const platform = platformPort;

/**
 * Whether the renderer runs inside the NoteKit Electron wrapper. Surfaced here
 * as an environment fact through the composition layer so driving adapters read
 * it without importing the browser transport adapter directly.
 */
export { isDesktop } from "../adapters/driven/api";
