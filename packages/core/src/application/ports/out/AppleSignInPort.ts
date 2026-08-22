/**
 * Outbound port for native Apple sign-in (Authentication Services via the
 * Capacitor plugin). Bound to the concrete driven adapter by the composition
 * root; a no-op path off native iOS.
 */
export interface AppleSignInPort {
  startNativeAppleSignIn(appBundleId?: string): Promise<void>;
}
