import { desc, eq } from "drizzle-orm";
import { db, schema } from "../adapters/driven/db";
import type { PlusSource } from "../domain/entitlement";

// eslint-disable-next-line complexity -- evaluates Apple, Google, Stripe, and lifetime plus sources with expiry comparisons; each branch is necessary
export async function recomputePlusForUser(userId: string): Promise<void> {
  const [latestApple, latestGoogle] = await Promise.all([
    db.query.appleIapReceipts.findFirst({
      where: eq(schema.appleIapReceipts.userId, userId),
      orderBy: [desc(schema.appleIapReceipts.expiresAt)],
    }),
    db.query.googleIapPurchases.findFirst({
      where: eq(schema.googleIapPurchases.userId, userId),
      orderBy: [desc(schema.googleIapPurchases.expiresAt)],
    }),
  ]);

  let best: { expiresAt: number; source: PlusSource } | null = null;
  if (latestApple?.expiresAt) {
    best = { expiresAt: latestApple.expiresAt, source: "apple" };
  }
  if (
    latestGoogle?.expiresAt &&
    (!best || latestGoogle.expiresAt > best.expiresAt)
  ) {
    best = { expiresAt: latestGoogle.expiresAt, source: "google" };
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (user?.plusSource === "lifetime" || user?.plusSource === "stripe") {
    return;
  }
  await db
    .update(schema.users)
    .set({
      plusUntil: best?.expiresAt ?? null,
      plusSource: best?.source ?? null,
      plan: best ? "plus" : "free",
    })
    .where(eq(schema.users.id, userId))
    .execute();
}
