import type { AppleAuthPort } from "../../../application/ports/out/AppleAuthPort";
import {
  APPLE_AUTHORIZE_URL,
  exchangeAppleCodeForProfile,
  verifyAppleNativeIdToken,
} from "./apple";

/** Sign in with Apple implementation of {@link AppleAuthPort}. */
export const appleAuthPort: AppleAuthPort = {
  authorizeUrl: APPLE_AUTHORIZE_URL,
  exchangeCodeForProfile: exchangeAppleCodeForProfile,
  verifyNativeIdToken: verifyAppleNativeIdToken,
};
