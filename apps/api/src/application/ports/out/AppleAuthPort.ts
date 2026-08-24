/**
 * A normalized Sign in with Apple profile. Mirrors the driven adapter's
 * `AppleNormalizedProfile` — the port owns this shape so the driving route
 * depends on the port, not the concrete `auth/apple` adapter.
 */
export interface AppleProfile {
  providerAccountId: string;
  email: string;
  /** Set only on the first sign-in that includes the `user` payload. */
  name: string | null;
  /** Apple has no avatar URL field. */
  avatarUrl: null;
}

/**
 * Outbound port for Sign in with Apple verification. The auth driving route
 * depends on this instead of the concrete `adapters/driven/auth/apple` adapter.
 */
export interface AppleAuthPort {
  /** Apple's authorize endpoint URL. */
  authorizeUrl: string;
  /**
   * Exchange a web `response_mode=form_post` authorization code for a verified
   * profile plus the id_token used to obtain it.
   */
  exchangeCodeForProfile(
    code: string,
    redirectUri: string,
  ): Promise<AppleProfile & { idToken: string }>;
  /** Verify an id_token sent directly by the iOS native plugin. */
  verifyNativeIdToken(idToken: string): Promise<AppleProfile>;
}
