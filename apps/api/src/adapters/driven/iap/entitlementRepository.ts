import { desc, eq } from "drizzle-orm";
import type { IapEntitlementRepository } from "../../../application/ports/out/IapEntitlementRepository";
import { db, schema } from "../db";

/** Drizzle/Postgres implementation of {@link IapEntitlementRepository}. */
export const iapEntitlementRepository: IapEntitlementRepository = {
  async getLatestAppleExpiry(userId) {
    const r = await db.query.appleIapReceipts.findFirst({
      where: eq(schema.appleIapReceipts.userId, userId),
      orderBy: [desc(schema.appleIapReceipts.expiresAt)],
    });
    return r?.expiresAt ?? null;
  },
  async getLatestGoogleExpiry(userId) {
    const r = await db.query.googleIapPurchases.findFirst({
      where: eq(schema.googleIapPurchases.userId, userId),
      orderBy: [desc(schema.googleIapPurchases.expiresAt)],
    });
    return r?.expiresAt ?? null;
  },
  async getUserPlusSource(userId) {
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    return u?.plusSource;
  },
  async setUserPlus(userId, plus) {
    await db.update(schema.users).set(plus).where(eq(schema.users.id, userId)).execute();
  },
};
