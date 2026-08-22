import type { ApiFetchPort } from "./ApiFetchPort";

/**
 * Outbound port for the authentication transport: the REST client plus the
 * desktop (Electron loopback + OS keychain) sign-in surface. The auth driving
 * adapter depends on this instead of importing the concrete `api` adapter, so
 * the transport details stay behind the composition root.
 */
export interface AuthApiPort {
  readonly apiUrl: string;
  readonly isDesktop: boolean;
  apiFetch: ApiFetchPort;
  ensureDesktopAuthLoaded(): Promise<void>;
  clearDesktopToken(): Promise<void>;
  startDesktopSignIn(provider: "github" | "google"): Promise<boolean>;
}
