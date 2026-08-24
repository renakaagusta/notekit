/**
 * In-app purchase verification + provider webhooks.
 *
 * Verify endpoints are called by the mobile client right after a purchase
 * (or "restore purchases"). They hit the upstream API, upsert a receipt
 * row, recompute entitlement.
 *
 * Webhooks are called by Apple (S2S Notifications V2) and Google (RTDN via
 * Pub/Sub push). They don't trust the payload alone — they re-lookup the
 * current state via the API and recompute entitlement.
 */
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { db, schema } from "../adapters/driven/db";
import {
  lookupTransaction,
  type SignedTransactionInfo,
} from "../adapters/driven/iap/apple";
import { lookupSubscription } from "../adapters/driven/iap/google";
import { recomputePlusForUser } from "../composition/entitlement";
import { getCurrentUser } from "../composition/sessions";
import { logger } from '../lib/logger'
import { requireWebhookSecret } from '../middleware/webhook-auth'
import { parseBody, z } from "../validation";

export const iapRoutes = new Hono();

/**
 * GET /iap/entitlement — quick read for the client. Used by the mobile
 * paywall sheet and to render the "You're on Plus" badge.
 */
iapRoutes.get("/entitlement", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const plusUntil = user.plusUntil ? new Date(user.plusUntil).toISOString() : null;
  const active =
    user.plusSource === "lifetime" ||
    (user.plusUntil ? user.plusUntil > Date.now() : false);
  return c.json({
    plus: active,
    plusUntil,
    plusSource: user.plusSource ?? null,
    softLimits: {
      mobileFreeNotes: 50,
    },
  });
});

const AppleVerifyBody = z.object({
  transactionId: z.string().min(1).max(64),
});

/**
 * POST /iap/apple/verify
 * Client passes the transactionId from StoreKit. We look up the current
 * server-side state and persist it.
 */
iapRoutes.post("/apple/verify", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, AppleVerifyBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  try {
    const result = await lookupTransaction(parsed.data.transactionId);
    await upsertAppleReceipt(user.id, result.info, result.environment, result.raw);
    await recomputePlusForUser(user.id);
    return c.json({ ok: true, productId: result.info.productId });
  } catch (err) {
    logger.error({ err }, "[iap] verification failed")
    return c.json({ error: "verification_failed" }, 400);
  }
});

const GoogleVerifyBody = z.object({
  purchaseToken: z.string().min(1).max(1024),
  productId: z.string().min(1).max(256),
});

iapRoutes.post("/google/verify", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, GoogleVerifyBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  try {
    const state = await lookupSubscription(parsed.data.purchaseToken);
    await upsertGooglePurchase(user.id, parsed.data.purchaseToken, state);
    await recomputePlusForUser(user.id);
    return c.json({ ok: true, productId: state.productId });
  } catch (err) {
    logger.error({ err }, "[iap] verification failed")
    return c.json({ error: "verification_failed" }, 400);
  }
});

/**
 * POST /iap/apple/webhook
 * S2S Notifications V2: payload is { signedPayload: string } (JWS).
 *
 * Returns 501 until x5c JWS chain verification is implemented in
 * iap/apple.ts. Apple retries 5xx with exponential back-off.
 * Remove this early return once verifySignedPayload is complete.
 */
iapRoutes.post("/apple/webhook", requireWebhookSecret("APPLE_WEBHOOK_SECRET", { scheme: "bearer" }), async (c) => {
  logger.warn("[iap] Apple S2S webhook called but JWS x5c verification is not implemented — returning 501");
  return c.json(
    { error: "not_implemented", message: "Apple JWS x5c signature verification is not yet implemented" },
    501,
  );
});

/**
 * POST /iap/google/webhook
 * Pub/Sub push subscription envelope:
 *   { message: { data: base64 } }
 *
 * Auth via shared secret in query (Pub/Sub supports OIDC; we use the simpler
 * path here — set `GOOGLE_PLAY_PUBSUB_SECRET` and configure Pub/Sub to push
 * to `/iap/google/webhook?secret=...`).
 */
iapRoutes.post("/google/webhook", requireWebhookSecret("GOOGLE_PLAY_PUBSUB_SECRET", { scheme: "bearer" }), async (c) => {
  try {
    const body = (await c.req.json()) as {
      message?: { data?: string };
    };
    if (!body.message?.data) return c.json({ ok: true });
    const decoded = Buffer.from(body.message.data, "base64").toString("utf8");
    const event = JSON.parse(decoded) as {
      subscriptionNotification?: { purchaseToken: string };
    };
    const token = event.subscriptionNotification?.purchaseToken;
    if (!token) return c.json({ ok: true });
    const existing = await db.query.googleIapPurchases.findFirst({
      where: eq(schema.googleIapPurchases.purchaseToken, token),
    });
    if (!existing) {
      return c.json({ ok: true });
    }
    const state = await lookupSubscription(token);
    await upsertGooglePurchase(existing.userId, token, state);
    await recomputePlusForUser(existing.userId);
  } catch (err) {
    logger.warn({ err }, "[iap] webhook handler error")
  }
  return c.json({ ok: true });
});

async function upsertAppleReceipt(
  userId: string,
  info: SignedTransactionInfo,
  environment: "sandbox" | "production",
  raw: string,
): Promise<void> {
  const expiresAt = info.expiresDate ?? null;
  await db
    .insert(schema.appleIapReceipts)
    .values({
      id: `app_${nanoid(16)}`,
      userId,
      originalTransactionId: info.originalTransactionId,
      latestTransactionId: info.transactionId,
      productId: info.productId,
      expiresAt,
      environment,
      rawJson: raw,
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: schema.appleIapReceipts.originalTransactionId,
      set: {
        latestTransactionId: info.transactionId,
        productId: info.productId,
        expiresAt,
        environment,
        rawJson: raw,
        updatedAt: Date.now(),
      },
    })
    .execute();
}

async function upsertGooglePurchase(
  userId: string,
  purchaseToken: string,
  state: {
    productId: string;
    expiresAt: number;
    acknowledged: boolean;
    raw: unknown;
  },
): Promise<void> {
  await db
    .insert(schema.googleIapPurchases)
    .values({
      id: `gpl_${nanoid(16)}`,
      userId,
      purchaseToken,
      productId: state.productId,
      expiresAt: state.expiresAt ?? null,
      acknowledged: state.acknowledged,
      rawJson: JSON.stringify(state.raw),
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: schema.googleIapPurchases.purchaseToken,
      set: {
        productId: state.productId,
        expiresAt: state.expiresAt ?? null,
        acknowledged: state.acknowledged,
        rawJson: JSON.stringify(state.raw),
        updatedAt: Date.now(),
      },
    })
    .execute();
}
