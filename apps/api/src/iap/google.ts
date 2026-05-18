/**
 * Google Play Developer API client for subscription verification.
 *
 * Uses a service account (clientEmail + privateKey from the JSON Google
 * gives you in the Play Console). Mints an RS256 JWT, exchanges it for an
 * OAuth access token, then calls `purchases.subscriptionsv2.get`.
 *
 * Docs:
 *   https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get
 */
import { createSign } from "node:crypto";
import { env } from "../env";

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  if (!env.googlePlay.clientEmail || !env.googlePlay.privateKey) {
    throw new Error("google_play_not_configured");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: env.googlePlay.clientEmail,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const signingInput = `${b64(header)}.${b64(claims)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign({ key: env.googlePlay.privateKey }).toString("base64url");
  const assertion = `${signingInput}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `google_token_${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 600) * 1000,
  };
  return json.access_token;
}

export interface GoogleSubscriptionState {
  productId: string;
  expiresAt: number; // ms epoch
  acknowledged: boolean;
  raw: unknown;
}

interface SubscriptionV2Response {
  lineItems?: Array<{
    productId: string;
    expiryTime?: string;
  }>;
  subscriptionState?: string;
  acknowledgementState?: string;
}

export async function lookupSubscription(
  purchaseToken: string,
): Promise<GoogleSubscriptionState> {
  if (!env.googlePlay.packageName) {
    throw new Error("google_play_package_not_configured");
  }
  const accessToken = await getAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${env.googlePlay.packageName}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(
      `google_lookup_${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as SubscriptionV2Response;
  const line = json.lineItems?.[0];
  if (!line?.productId) throw new Error("google_lookup_no_line_item");
  const expiresAt = line.expiryTime ? Date.parse(line.expiryTime) : 0;
  return {
    productId: line.productId,
    expiresAt,
    acknowledged: json.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    raw: json,
  };
}
