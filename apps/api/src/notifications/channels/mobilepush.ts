/**
 * Mobile push channel.
 *
 * Single delivery path: FCM HTTP v1 for every platform. iOS devices register
 * an FCM token (Firebase wraps APNs natively), Android registers an FCM token
 * directly, so the server never speaks the APNs protocol itself — one
 * service-account credential covers both.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { env } from "../../env";

export async function sendMobilePush(
  userId: string,
  summary: string,
  notificationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const tokens = await db.query.mobilePushTokens.findMany({
    where: eq(schema.mobilePushTokens.userId, userId),
  });
  if (tokens.length === 0) return;

  for (const t of tokens) {
    // Every platform delivers through FCM — the `platform` column is kept for
    // diagnostics only and no longer changes the dispatch.
    await sendFcm(t.token, summary, notificationId, payload).catch((err) =>
      handleMobileFailure(t.id, err),
    );
  }
}

async function handleMobileFailure(tokenId: string, err: unknown): Promise<void> {
  const reason = (err as Error).message ?? String(err);
  // Apple "BadDeviceToken" / FCM "UNREGISTERED" → drop the token.
  if (reason.includes("BadDeviceToken") || reason.includes("UNREGISTERED")) {
    await db
      .delete(schema.mobilePushTokens)
      .where(eq(schema.mobilePushTokens.id, tokenId))
      .run();
    return;
  }
  console.error("[notify:mobilepush] send failed:", err);
}

/**
 * FCM HTTP v1: requires a Google service-account JSON. Exchanges JWT for an
 * access token, then POSTs to `projects/<id>/messages:send`. Token cached
 * for 50 minutes (tokens last 60).
 */
let fcmTokenCache: { token: string; expiresAt: number } | null = null;

async function sendFcm(
  deviceToken: string,
  summary: string,
  notificationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!env.fcm.projectId || !env.fcm.clientEmail || !env.fcm.privateKey) {
    return;
  }
  const accessToken = await getFcmAccessToken();
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${env.fcm.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: "NoteKit", body: summary },
          data: {
            notificationId,
            payload: JSON.stringify(payload),
          },
        },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fcm_${res.status}: ${body.slice(0, 200)}`);
  }
}

async function getFcmAccessToken(): Promise<string> {
  if (fcmTokenCache && fcmTokenCache.expiresAt > Date.now()) {
    return fcmTokenCache.token;
  }
  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: env.fcm.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
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
  const sig = signer
    .sign({ key: env.fcm.privateKey! })
    .toString("base64url");
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
    throw new Error(`fcm_token_${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  fcmTokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 600) * 1000,
  };
  return json.access_token;
}
