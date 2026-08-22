import type { NativePlatform } from "../../../domain/platform";

/**
 * Outbound port for detecting the current runtime platform. Application/service
 * code that needs to branch on native vs. web depends on this instead of the
 * Capacitor-reading driven adapter, so the detection stays injectable.
 */
export interface PlatformPort {
  getNativePlatform(): NativePlatform;
}
