/**
 * Outbound port for the native (Capacitor) OAuth deep-link flow: opens the
 * provider in an in-app browser and captures the returned PAT via an app URL
 * listener. Bound to the concrete driven adapter by the composition root.
 */
export interface NativeOAuthPort {
  startNativeOAuth(provider: "github" | "google"): Promise<void>;
  /** Register the notekit://auth-callback listener once. No-op off native. */
  initNativeAuthDeepLink(): void;
}
