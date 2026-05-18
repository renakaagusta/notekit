/**
 * Mobile push channel.
 *
 * iOS uses direct APNs HTTP/2 with a `.p8` auth key — no Firebase
 * dependency. Android uses FCM HTTP v1 (unavoidable for background push).
 *
 * M5 wires the actual HTTP/2 + JWT signing. Until then this loops tokens and
 * logs.
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
    if (t.platform === "ios") {
      await sendApns(t.token, summary, notificationId, payload).catch((err) =>
        handleMobileFailure(t.id, err),
      );
    } else if (t.platform === "android") {
      await sendFcm(t.token, summary, notificationId, payload).catch((err) =>
        handleMobileFailure(t.id, err),
      );
    }
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
 * Direct APNs HTTP/2 push. Requires APNS_KEY_ID, APNS_TEAM_ID,
 * APNS_BUNDLE_ID, APNS_KEY_P8 (PEM contents). Uses node:http2.
 */
async function sendApns(
  deviceToken: string,
  summary: string,
  notificationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (
    !env.apns.keyId ||
    !env.apns.teamId ||
    !env.apns.bundleId ||
    !env.apns.keyP8
  ) {
    return;
  }
  const jwt = await buildApnsJwt(
    env.apns.keyId,
    env.apns.teamId,
    env.apns.keyP8,
  );
  const host = env.apns.production
    ? "api.push.apple.com"
    : "api.sandbox.push.apple.com";

  const http2 = await import("node:http2");
  const client = http2.connect(`https://${host}`);
  try {
    await new Promise<void>((resolve, reject) => {
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        "apns-topic": env.apns.bundleId!,
        "apns-push-type": "alert",
        authorization: `bearer ${jwt}`,
        "content-type": "application/json",
      });
      req.setEncoding("utf8");
      let status = 0;
      let body = "";
      req.on("response", (h) => {
        status = Number(h[":status"]);
      });
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        if (status >= 200 && status < 300) return resolve();
        reject(new Error(`apns_${status}: ${body.slice(0, 200)}`));
      });
      req.on("error", reject);
      req.end(
        JSON.stringify({
          aps: {
            alert: { title: "NoteKit", body: summary },
            sound: "default",
          },
          notificationId,
          data: payload,
        }),
      );
    });
  } finally {
    client.close();
  }
}

/**
 * APNs uses ES256 JWTs signed with the .p8 private key. Tokens valid up to
 * an hour; we mint per-request for simplicity (low traffic). Optimize later
 * with a 50-minute cache if needed.
 */
async function buildApnsJwt(
  keyId: string,
  teamId: string,
  p8Pem: string,
): Promise<string> {
  const { createSign } = await import("node:crypto");
  const header = { alg: "ES256", kid: keyId };
  const claims = { iss: teamId, iat: Math.floor(Date.now() / 1000) };
  const b64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64url");
  const signingInput = `${b64(header)}.${b64(claims)}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign({ key: p8Pem, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${sig.toString("base64url")}`;
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
