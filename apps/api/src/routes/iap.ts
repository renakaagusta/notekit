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
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db";
import { env } from "../env";
import { getCurrentUser } from "../auth/sessions";
import { parseBody, z } from "../validation";
import {
  decodeSignedPayload,
  lookupTransaction,
  verifySignedPayload,
  type AppleNotificationPayload,
  type SignedTransactionInfo,
} from "../iap/apple";
import { lookupSubscription } from "../iap/google";
import { recomputePlusForUser } from "../iap/entitlement";

export const iapRoutes = new Hono();

/**
 * GET /iap/entitlement — quick read for the client. Used by the mobile
 * paywall sheet and to render the "You're on Plus" badge.
 */
iapRoutes.get("/entitlement", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const plusUntil = user.plusUntil ? user.plusUntil.toISOString() : null;
  const active =
    user.plusSource === "lifetime" ||
    (user.plusUntil ? user.plusUntil.getTime() > Date.now() : false);
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
    console.error("[iap:apple:verify]", err);
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
    console.error("[iap:google:verify]", err);
    return c.json({ error: "verification_failed" }, 400);
  }
});

/**
 * POST /iap/apple/webhook
 * S2S Notifications V2: payload is { signedPayload: string } (JWS).
 *
 * We decode, look up which user owns the originalTransactionId, then
 * re-verify via the App Store Server API and recompute entitlement.
 *
 * Replies 200 unconditionally so Apple stops retrying — failures log + drop.
 */
iapRoutes.post("/apple/webhook", async (c) => {
  try {
    const body = (await c.req.json()) as { signedPayload?: string };
    if (!body.signedPayload) return c.json({ ok: true });
    const payload = await verifySignedPayload<AppleNotificationPayload>(
      body.signedPayload,
    );
    const signed = payload.data?.signedTransactionInfo;
    if (!signed) return c.json({ ok: true });
    const txn = decodeSignedPayload<SignedTransactionInfo>(signed);

    // Find which user this transaction belongs to.
    const existing = await db.query.appleIapReceipts.findFirst({
      where: eq(
        schema.appleIapReceipts.originalTransactionId,
        txn.originalTransactionId,
      ),
    });
    if (!existing) {
      // Unknown originalTransactionId — could be a refund or a transaction
      // we never saw. Log and drop; client will refresh on next foreground.
      console.warn(
        `[iap:apple:webhook] unknown originalTransactionId ${txn.originalTransactionId} (type=${payload.notificationType})`,
      );
      return c.json({ ok: true });
    }
    const result = await lookupTransaction(txn.transactionId);
    await upsertAppleReceipt(
      existing.userId,
      result.info,
      result.environment,
      result.raw,
    );
    await recomputePlusForUser(existing.userId);
  } catch (err) {
    console.error("[iap:apple:webhook]", err);
  }
  return c.json({ ok: true });
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
iapRoutes.post("/google/webhook", async (c) => {
  if (env.googlePlay.pubsubSecret) {
    if (c.req.query("secret") !== env.googlePlay.pubsubSecret) {
      return c.json({ error: "forbidden" }, 403);
    }
  }
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
      console.warn(`[iap:google:webhook] unknown purchaseToken (${token.slice(0, 12)}…)`);
      return c.json({ ok: true });
    }
    const state = await lookupSubscription(token);
    await upsertGooglePurchase(existing.userId, token, state);
    await recomputePlusForUser(existing.userId);
  } catch (err) {
    console.error("[iap:google:webhook]", err);
  }
  return c.json({ ok: true });
});

async function upsertAppleReceipt(
  userId: string,
  info: SignedTransactionInfo,
  environment: "sandbox" | "production",
  raw: string,
): Promise<void> {
  const expiresAt = info.expiresDate ? new Date(info.expiresDate) : null;
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
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.appleIapReceipts.originalTransactionId,
      set: {
        latestTransactionId: info.transactionId,
        productId: info.productId,
        expiresAt,
        environment,
        rawJson: raw,
        updatedAt: new Date(),
      },
    })
    .run();
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
      expiresAt: state.expiresAt ? new Date(state.expiresAt) : null,
      acknowledged: state.acknowledged,
      rawJson: JSON.stringify(state.raw),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.googleIapPurchases.purchaseToken,
      set: {
        productId: state.productId,
        expiresAt: state.expiresAt ? new Date(state.expiresAt) : null,
        acknowledged: state.acknowledged,
        rawJson: JSON.stringify(state.raw),
        updatedAt: new Date(),
      },
    })
    .run();
}
