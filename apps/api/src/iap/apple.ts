/**
 * Apple App Store Server API client.
 *
 * Two surfaces:
 *   1. `lookupTransaction(transactionId)` — mints an ES256 JWT, hits the
 *      App Store Server API, returns the decoded signed transaction info.
 *   2. `decodeSignedPayload(jws)` — parses (NOT cryptographically verifies)
 *      the JWS body used by S2S Notifications V2 and Apple's API responses.
 *      Production should verify the JWS chain against Apple's root cert;
 *      that lives in `verifySignedPayload` below as a TODO.
 *
 * Docs:
 *   - https://developer.apple.com/documentation/appstoreserverapi
 *   - https://developer.apple.com/documentation/appstoreservernotifications
 */
import { createSign } from "node:crypto";
import { env } from "../env";

export interface SignedTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  expiresDate?: number; // ms epoch
  purchaseDate: number;
  type: string;
  environment: "Sandbox" | "Production";
}

export interface AppleNotificationPayload {
  notificationType: string;
  subtype?: string;
  data?: {
    bundleId: string;
    environment: "Sandbox" | "Production";
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

function b64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function mintAppleJwt(): string {
  if (
    !env.apple.issuerId ||
    !env.apple.keyId ||
    !env.apple.keyP8 ||
    !env.apple.bundleId
  ) {
    throw new Error("apple_iap_not_configured");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: env.apple.keyId, typ: "JWT" };
  const claims = {
    iss: env.apple.issuerId,
    iat: now,
    exp: now + 60 * 30, // 30 min, max is 1 hour
    aud: "appstoreconnect-v1",
    bid: env.apple.bundleId,
  };
  const signingInput = `${b64url(header)}.${b64url(claims)}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign({ key: env.apple.keyP8, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${sig.toString("base64url")}`;
}

const PROD_BASE = "https://api.storekit.itunes.apple.com";
const SANDBOX_BASE = "https://api.storekit-sandbox.itunes.apple.com";

interface ApiResponse {
  signedTransactionInfo?: string;
}

/**
 * Look up the latest state of a transaction. Tries production first; on
 * 404 falls back to sandbox (Apple's recommended strategy when you don't
 * know which environment minted the receipt).
 */
export async function lookupTransaction(
  transactionId: string,
): Promise<{
  info: SignedTransactionInfo;
  environment: "sandbox" | "production";
  raw: string;
}> {
  const jwt = mintAppleJwt();

  const tryFetch = async (base: string) =>
    fetch(`${base}/inApps/v1/transactions/${transactionId}`, {
      headers: { authorization: `Bearer ${jwt}` },
    });

  let res = await tryFetch(PROD_BASE);
  let env_: "sandbox" | "production" = "production";
  if (res.status === 404) {
    res = await tryFetch(SANDBOX_BASE);
    env_ = "sandbox";
  }
  if (!res.ok) {
    throw new Error(
      `apple_lookup_${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const body = (await res.json()) as ApiResponse;
  if (!body.signedTransactionInfo) {
    throw new Error("apple_lookup_no_signed_info");
  }
  const info = decodeSignedPayload<SignedTransactionInfo>(
    body.signedTransactionInfo,
  );
  return {
    info,
    environment: env_,
    raw: JSON.stringify(body),
  };
}

/**
 * Decode the JWS body. **Does not verify the signature.** Acceptable for
 * data returned from the App Store Server API (we trust TLS + our JWT) but
 * NOT for S2S Notifications V2 — those must call `verifySignedPayload`.
 */
export function decodeSignedPayload<T>(jws: string): T {
  const parts = jws.split(".");
  if (parts.length !== 3 || !parts[1]) throw new Error("apple_jws_malformed");
  const payload = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(payload) as T;
}

/**
 * S2S Notifications V2 must be verified against Apple's certificate chain.
 *
 * Apple embeds an x5c cert chain in the JWS header. Verification:
 *   1. Parse header, extract x5c (array of DER-encoded certs, base64).
 *   2. Walk the chain to Apple's root CA (AppleRootCA-G3 for ECC). Apple
 *      publishes the root cert at
 *      https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 *   3. Use the leaf cert's public key to verify the JWS signature.
 *
 * TODO: implement before going live. For dev + sandbox we accept any
 * well-formed JWS, which is safe-ish because the webhook URL is unknown
 * to attackers and we recompute entitlement from the App Store Server API
 * after the webhook fires — the webhook is just a heads-up.
 */
export async function verifySignedPayload<T>(jws: string): Promise<T> {
  if (env.isProd) {
    // Defensive guard: refuse to silently accept unverified JWS in prod.
    // Implement full verification before flipping NODE_ENV=production.
    throw new Error(
      "apple_jws_verification_not_implemented — implement verifySignedPayload before production",
    );
  }
  return decodeSignedPayload<T>(jws);
}
