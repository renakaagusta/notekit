/**
 * Native Sign in with Apple — dynamic Capacitor plugin wrapper.
 *
 * Lives in its own module so `@capacitor-community/apple-sign-in` is
 * dynamically imported. The web build never pulls the plugin in, which
 * keeps the bundle slim and avoids the plugin's `Cordova` shims leaking
 * into the SPA on non-native targets.
 *
 * Flow on iOS native:
 *   1. Call `SignInWithApple.authorize` — iOS presents the native sheet,
 *      the user confirms with Face/Touch ID.
 *   2. The plugin returns an `identityToken` (JWT issued by Apple,
 *      audience = our App ID/bundle identifier) plus, on first
 *      sign-in only, the user's `givenName` / `familyName`.
 *   3. POST those fields to `/auth/apple/native`; the server verifies
 *      the token signature/issuer/audience against Apple's JWKS and
 *      mints a session cookie.
 *   4. The caller reloads the page so AuthGate sees the new session.
 */
import { apiUrl } from "./api";

interface AppleSignInResponseWrapper {
  response?: {
    identityToken?: string;
    givenName?: string | null;
    familyName?: string | null;
  };
}

interface AppleSignInOptions {
  clientId: string;
  redirectURI: string;
  scopes: string;
  state: string;
  nonce?: string;
}

interface AppleSignInPlugin {
  authorize(options: AppleSignInOptions): Promise<AppleSignInResponseWrapper>;
}

async function loadPlugin(): Promise<AppleSignInPlugin | null> {
  try {
    const mod = (await import("@capacitor-community/apple-sign-in")) as {
      SignInWithApple?: AppleSignInPlugin;
    };
    return mod.SignInWithApple ?? null;
  } catch (err) {
    console.warn("[auth/apple] plugin not available", err);
    return null;
  }
}

/**
 * Drive a native Apple sign-in and post the resulting identity token to
 * the server. Resolves on success — caller reloads the page so the new
 * cookie session is picked up by useAuth. Throws on any error so the
 * UI can surface a "sign-in cancelled / failed" toast.
 *
 * `appBundleId` defaults to `com.notekit.app` because that's the bundle
 * ID set in `capacitor.config.ts` and the audience Apple stamps into
 * the identity token on native flows. The server's
 * `APPLE_AUTH_NATIVE_APP_ID` env var must match exactly or the audience
 * check on `/auth/apple/native` will fail.
 */
export async function startNativeAppleSignIn(appBundleId = "com.notekit.app"): Promise<void> {
  const plugin = await loadPlugin();
  if (!plugin) throw new Error("apple_plugin_unavailable");

  const state = randomBase64Url(24);
  const nonce = randomBase64Url(24);

  const res = await plugin.authorize({
    clientId: appBundleId,
    // `redirectURI` is required by the plugin's TS type but ignored for
    // native flows — the redirect happens in-app. Any HTTPS URL works.
    redirectURI: `${apiUrl}/auth/apple/callback`,
    scopes: "email name",
    state,
    nonce,
  });
  const identityToken = res.response?.identityToken;
  if (!identityToken) throw new Error("apple_no_identity_token");

  const apiRes = await fetch(`${apiUrl}/auth/apple/native`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identityToken,
      givenName: res.response?.givenName ?? null,
      familyName: res.response?.familyName ?? null,
    }),
  });
  if (!apiRes.ok) {
    const text = await apiRes.text();
    throw new Error(`apple_native_exchange_failed: ${apiRes.status} ${text}`);
  }
}

/**
 * Random base64url string for state/nonce values. Web Crypto's
 * `getRandomValues` is fine here — these are CSRF-style nonces, not
 * key material.
 */
function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let b64 = "";
  for (const b of bytes) b64 += String.fromCharCode(b);
  return btoa(b64).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
