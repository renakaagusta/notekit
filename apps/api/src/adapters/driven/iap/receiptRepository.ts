import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { IapReceiptRepository } from "../../../application/ports/out/IapReceiptRepository";
import { db, schema } from "../db";

/** Drizzle/Postgres implementation of {@link IapReceiptRepository}. */
export const iapReceiptRepository: IapReceiptRepository = {
  async upsertAppleReceipt(userId, receipt) {
    await db
      .insert(schema.appleIapReceipts)
      .values({
        id: `app_${nanoid(16)}`,
        userId,
        originalTransactionId: receipt.originalTransactionId,
        latestTransactionId: receipt.latestTransactionId,
        productId: receipt.productId,
        expiresAt: receipt.expiresAt,
        environment: receipt.environment,
        rawJson: receipt.rawJson,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: schema.appleIapReceipts.originalTransactionId,
        set: {
          latestTransactionId: receipt.latestTransactionId,
          productId: receipt.productId,
          expiresAt: receipt.expiresAt,
          environment: receipt.environment,
          rawJson: receipt.rawJson,
          updatedAt: Date.now(),
        },
      })
      .execute();
  },
  async upsertGooglePurchase(userId, purchaseToken, purchase) {
    await db
      .insert(schema.googleIapPurchases)
      .values({
        id: `gpl_${nanoid(16)}`,
        userId,
        purchaseToken,
        productId: purchase.productId,
        expiresAt: purchase.expiresAt,
        acknowledged: purchase.acknowledged,
        rawJson: purchase.rawJson,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: schema.googleIapPurchases.purchaseToken,
        set: {
          productId: purchase.productId,
          expiresAt: purchase.expiresAt,
          acknowledged: purchase.acknowledged,
          rawJson: purchase.rawJson,
          updatedAt: Date.now(),
        },
      })
      .execute();
  },
  async findGooglePurchaseOwner(purchaseToken) {
    const existing = await db.query.googleIapPurchases.findFirst({
      where: eq(schema.googleIapPurchases.purchaseToken, purchaseToken),
    });
    return existing?.userId ?? null;
  },
};
