/**
 * Native platform detection + lazy imports for `@capacitor/*`.
 *
 * The web app must build and run without `@capacitor/*` installed (because
 * web users never need it). All Capacitor imports go through dynamic import
 * inside try/catch so missing modules fail soft.
 */

import type { PlatformPort } from "../../application/ports/out/PlatformPort";
import type { NativePlatform } from "../../domain/platform";

export type { NativePlatform };

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => NativePlatform;
}

function readCapacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { Capacitor?: CapacitorGlobal };
  return w.Capacitor ?? null;
}

export function isNativePlatform(): boolean {
  return readCapacitor()?.isNativePlatform?.() === true;
}

export function getNativePlatform(): NativePlatform {
  const cap = readCapacitor();
  if (!cap || cap.isNativePlatform?.() !== true) return "web";
  return cap.getPlatform?.() ?? "web";
}

/**
 * {@link PlatformPort} conformance for this driven adapter. The composition
 * root injects this const wherever platform detection is needed.
 */
export const platformPort: PlatformPort = { getNativePlatform };
