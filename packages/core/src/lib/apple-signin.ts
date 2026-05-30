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

interface CapacitorGlobal {
  registerPlugin?: (name: string) => unknown;
  Plugins?: Record<string, unknown>;
}

/**
 * Bind to the native SignInWithApple plugin via the global Capacitor runtime.
 *
 * We deliberately do NOT `import("@capacitor-community/apple-sign-in")` — that
 * dynamic import hangs forever under the `capacitor://localhost` scheme on
 * iOS 16 (the module-script chunk never resolves), so the sign-in silently
 * stalls. `Capacitor.registerPlugin(name)` returns a proxy that bridges to the
 * already-registered native plugin by name, no package JS required.
 */
function loadPlugin(): AppleSignInPlugin | null {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap) return null;
  try {
    if (cap.registerPlugin) {
      return cap.registerPlugin("SignInWithApple") as unknown as AppleSignInPlugin;
    }
    const direct = cap.Plugins?.SignInWithApple;
    return (direct as AppleSignInPlugin | undefined) ?? null;
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
  const plugin = loadPlugin();
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

  // Native can't use the SameSite=Lax session cookie cross-origin, so the
  // server also returns a bearer PAT. Stash it where the api-client looks
  // for the mobile bearer token; the caller then reloads so the client
  // re-initializes in bearer mode and the session sticks.
  const data = (await apiRes.json().catch(() => null)) as { token?: string } | null;
  if (data?.token) {
    try {
      localStorage.setItem("notekit:e2e-pat", data.token);
    } catch {
      /* storage blocked — fall back to the cookie attempt */
    }
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
