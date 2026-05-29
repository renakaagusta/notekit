/**
 * Sign in with Apple — server side.
 *
 * Apple is structurally different from the other OAuth providers we
 * support, so it lives in its own module instead of slotting into the
 * generic `getProvider()` shape:
 *
 *   1. Client secret is a JWT we sign per-request with our private key
 *      (.p8 → ES256), not a static string.
 *   2. The authorization callback uses `response_mode=form_post`, so
 *      Apple delivers `code` + `id_token` + optional `user` payload as
 *      a POST form, not a GET query.
 *   3. There is no userInfo endpoint — the user identity is in the
 *      `id_token` JWT, which we verify against Apple's JWKS.
 *   4. The user's name is only ever sent on the FIRST authorize, in the
 *      `user` form field. We capture it then or live without it.
 *
 * Both the web flow (`GET /auth/apple` → Apple → `POST /auth/apple/callback`)
 * and the iOS native plugin (`POST /auth/apple/native` with the device's
 * identity token) end up here for the same JWT verification + session
 * mint, so the surfaces share the trust boundary.
 */

import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";
import { env } from "../env";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = `${APPLE_ISSUER}/auth/keys`;
const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
export const APPLE_AUTHORIZE_URL = `${APPLE_ISSUER}/auth/authorize`;

// Cache the JWKS verifier across requests so we don't refetch Apple's
// rotating public keys on every sign-in. `createRemoteJWKSet` does its
// own short-lived caching internally.
const jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

export interface AppleNormalizedProfile {
  providerAccountId: string;
  email: string;
  /** Set only on the FIRST native sign-in or web callback that includes
   *  the `user` payload — Apple never resends it. */
  name: string | null;
  /** Apple does not have an avatar URL field. */
  avatarUrl: null;
}

/**
 * Build the ES256-signed JWT that Apple expects as `client_secret` on
 * the token-exchange POST. Valid for ~5 minutes — short-lived because
 * we sign on every request anyway.
 */
async function appleClientSecret(): Promise<string> {
  const { teamId, keyId, privateKey, serviceId } = env.appleAuth;
  if (!teamId || !keyId || !privateKey || !serviceId) {
    throw new Error("Apple Sign In not configured (missing team/key/serviceId/privateKey)");
  }
  const key = await importPKCS8(privateKey, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(serviceId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .sign(key);
}

/**
 * Audiences this server will accept on an Apple id_token. The web flow
 * comes back as the Service ID; the native iOS plugin uses the App ID
 * (bundle identifier). We accept either when configured.
 */
function acceptedAudiences(): string[] {
  const out: string[] = [];
  if (env.appleAuth.serviceId) out.push(env.appleAuth.serviceId);
  if (env.appleAuth.nativeAppId) out.push(env.appleAuth.nativeAppId);
  return out;
}

/**
 * Verify an Apple id_token's signature, issuer, and audience. Returns
 * the verified claims on success, throws on any failure — call sites
 * should catch and return a generic 401 to avoid leaking the failure
 * mode to a probing client.
 */
async function verifyAppleIdToken(idToken: string): Promise<JWTPayload> {
  const audiences = acceptedAudiences();
  if (audiences.length === 0) {
    throw new Error("Apple Sign In not configured (no serviceId/nativeAppId)");
  }
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: APPLE_ISSUER,
    audience: audiences,
  });
  return payload;
}

/**
 * Exchange an authorization code (from the web `response_mode=form_post`
 * callback) for an id_token, then verify and extract the profile.
 *
 * `redirectUri` must match the one Apple was authorized against
 * exactly — typically `${env.apiUrl}/auth/apple/callback`.
 */
export async function exchangeAppleCodeForProfile(
  code: string,
  redirectUri: string,
): Promise<AppleNormalizedProfile & { idToken: string }> {
  const clientSecret = await appleClientSecret();
  const serviceId = env.appleAuth.serviceId;
  if (!serviceId) throw new Error("APPLE_SERVICE_ID not set");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: serviceId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apple token exchange failed: ${res.status} ${text}`);
  }
  const tok = (await res.json()) as { id_token?: string };
  if (!tok.id_token) throw new Error("Apple token exchange returned no id_token");

  const payload = await verifyAppleIdToken(tok.id_token);
  return {
    ...profileFromPayload(payload),
    idToken: tok.id_token,
  };
}

/**
 * Verify an id_token sent directly from the iOS native plugin and
 * return a normalized profile. No code exchange — the device already
 * got an identity token from AuthenticationServices.
 */
export async function verifyAppleNativeIdToken(
  idToken: string,
): Promise<AppleNormalizedProfile> {
  const payload = await verifyAppleIdToken(idToken);
  return profileFromPayload(payload);
}

function profileFromPayload(payload: JWTPayload): AppleNormalizedProfile {
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const email = typeof payload.email === "string" ? payload.email : null;
  if (!sub) throw new Error("Apple id_token missing `sub` claim");
  if (!email) {
    // Apple omits `email` if the user previously shared it and revoked
    // — there's no way to recover without forcing them to re-share, so
    // surface clearly instead of silently dropping the sign-in.
    throw new Error("Apple id_token missing `email` claim (user may have revoked email sharing)");
  }
  return {
    providerAccountId: sub,
    email,
    name: null,
    avatarUrl: null,
  };
}
