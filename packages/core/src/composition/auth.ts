/**
 * Composition root for the auth driving-layer hook.
 *
 * The ONE place useAuth is bound to its driven adapters (REST/desktop auth
 * transport, native Apple sign-in, native OAuth deep-link, platform detection).
 * Wiring runs eagerly at import — before any component renders the hook — so
 * behavior is identical to the old direct imports. Import useAuth from here.
 */
import { authApiPort } from "../adapters/driven/api";
import { appleSignInPort } from "../adapters/driven/apple-signin";
import { platformPort } from "../adapters/driven/native";
import { nativeOAuthPort } from "../adapters/driven/native-oauth";
import { configureUseAuth, useAuth } from "../hooks/useAuth";

configureUseAuth({
  authApi: authApiPort,
  appleSignIn: appleSignInPort,
  nativeOAuth: nativeOAuthPort,
  platform: platformPort,
});

export { useAuth };
export type { SignInProvider, AuthStatus } from "../hooks/useAuth";
